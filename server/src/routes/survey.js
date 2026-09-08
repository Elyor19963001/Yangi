const express = require('express');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const WAVES = new Set(['baseline', 'midline', 'endline']);
const PILOT_WRITABLE_STATUSES = new Set(['enrolled', 'randomized', 'active']);

function recordOrigin() {
  const dev = String(process.env.DEV_MODE || '').toLowerCase() === 'true';
  const seeded = String(process.env.SEED_DEMO || '').toLowerCase() === 'true';
  return dev || seeded ? 'demo' : 'pilot';
}

async function getParticipant(userId) {
  const result = await pool.query(
    `SELECT participant_id, study_id, consent_research, research_consent_version,
            research_consented_at, consent_withdrawn_at, pilot_status, pilot_cohort,
            assignment_group, eligible_for_analysis, data_quality_status
       FROM study_participants
      WHERE user_id=$1`,
    [userId]
  );
  return result.rows[0] || null;
}

router.get('/status', asyncHandler(async (req, res) => {
  const participant = await getParticipant(req.user.user_id);
  if (!participant) return res.status(404).json({ error: 'Study participant topilmadi' });

  const responses = await pool.query(
    `SELECT wave, record_origin, dataset_status, submitted_at, updated_at
       FROM survey_responses
      WHERE study_id=$1
      ORDER BY submitted_at`,
    [participant.study_id]
  );

  res.json({
    study_id: participant.study_id,
    consent_research: Boolean(participant.consent_research),
    research_consent_version: participant.research_consent_version,
    research_consented_at: participant.research_consented_at,
    consent_withdrawn_at: participant.consent_withdrawn_at,
    pilot_status: participant.pilot_status,
    pilot_cohort: participant.pilot_cohort,
    assignment_group: participant.assignment_group,
    eligible_for_analysis: participant.eligible_for_analysis,
    data_quality_status: participant.data_quality_status,
    current_record_origin: recordOrigin(),
    completed_waves: responses.rows,
  });
}));

router.post('/consent', asyncHandler(async (req, res) => {
  const accepted = Boolean(req.body.accepted);
  const version = String(req.body.consent_version || 'research-v1').slice(0, 30);
  const participant = await getParticipant(req.user.user_id);
  if (!participant) return res.status(404).json({ error: 'Study participant topilmadi' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE study_participants
          SET consent_research=$1,
              research_consent_version=$2,
              research_consented_at=CASE WHEN $1 THEN NOW() ELSE research_consented_at END,
              consent_withdrawn_at=CASE WHEN $1 THEN NULL ELSE NOW() END,
              updated_at=NOW()
        WHERE user_id=$3`,
      [accepted, version, req.user.user_id]
    );

    await client.query(
      `INSERT INTO consent_records (study_id, consent_scope, consent_version, accepted)
       VALUES ($1, 'research', $2, $3)`,
      [participant.study_id, version, accepted]
    );

    await client.query(
      `INSERT INTO research_audit_log (actor_user_id, study_id, action_type, details)
       VALUES ($1,$2,$3,$4::jsonb)`,
      [req.user.user_id, participant.study_id, accepted ? 'research_consent_granted' : 'research_consent_declined', JSON.stringify({ consent_version: version })]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  res.json({ ok: true, consent_research: accepted, study_id: participant.study_id });
}));

router.post('/withdraw', asyncHandler(async (req, res) => {
  const participant = await getParticipant(req.user.user_id);
  if (!participant) return res.status(404).json({ error: 'Study participant topilmadi' });
  const reason = req.body?.reason == null ? null : String(req.body.reason).trim().slice(0, 300);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE study_participants
          SET consent_research=FALSE,
              consent_withdrawn_at=NOW(),
              pilot_status=CASE WHEN pilot_status='completed' THEN pilot_status ELSE 'withdrawn' END,
              withdrawal_reason=COALESCE($2, withdrawal_reason),
              updated_at=NOW()
        WHERE user_id=$1`,
      [req.user.user_id, reason]
    );
    await client.query(
      `INSERT INTO consent_records (study_id, consent_scope, consent_version, accepted)
       VALUES ($1, 'research', COALESCE($2,'research-v1'), FALSE)`,
      [participant.study_id, participant.research_consent_version]
    );
    await client.query(
      `INSERT INTO research_audit_log (actor_user_id, study_id, action_type, details)
       VALUES ($1,$2,'research_withdrawal',$3::jsonb)`,
      [req.user.user_id, participant.study_id, JSON.stringify({ reason: reason || null })]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  res.json({ ok: true });
}));

router.get('/:wave', asyncHandler(async (req, res) => {
  const wave = req.params.wave;
  if (!WAVES.has(wave)) return res.status(400).json({ error: 'Wave noto‘g‘ri' });
  const participant = await getParticipant(req.user.user_id);
  if (!participant) return res.status(404).json({ error: 'Study participant topilmadi' });

  const origin = recordOrigin();
  const result = await pool.query(
    `SELECT * FROM survey_responses
      WHERE study_id=$1 AND wave=$2 AND record_origin=$3
      ORDER BY updated_at DESC LIMIT 1`,
    [participant.study_id, wave, origin]
  );
  res.json(result.rows[0] || null);
}));

router.post('/:wave', asyncHandler(async (req, res) => {
  const wave = req.params.wave;
  if (!WAVES.has(wave)) return res.status(400).json({ error: 'Wave noto‘g‘ri' });

  const participant = await getParticipant(req.user.user_id);
  if (!participant) return res.status(404).json({ error: 'Study participant topilmadi' });
  if (!participant.consent_research || participant.consent_withdrawn_at) {
    return res.status(403).json({ error: 'Ilmiy so‘rovnoma uchun faol rozilik talab qilinadi' });
  }

  const origin = recordOrigin();
  if (origin === 'pilot' && !PILOT_WRITABLE_STATUSES.has(participant.pilot_status)) {
    return res.status(403).json({
      error: 'Real pilot so‘rovnomasi uchun participant avval enrolled/randomized/active holatiga o‘tkazilishi kerak',
      pilot_status: participant.pilot_status,
    });
  }

  const b = req.body || {};
  const fields = [
    'district_id','age_group','gender','education_level','household_size','employment_status',
    'monthly_household_income_uzs','internet_access','internet_type','monthly_internet_cost_uzs',
    'internet_quality','smartphone_access','computer_access','digital_skills','egov_use',
    'digital_payment_use','ecommerce_use','online_selling_use','price_knowledge',
    'financial_services_use','platform_usage_frequency','nps'
  ];
  const values = fields.map((key) => b[key] === '' || b[key] === undefined ? null : b[key]);

  const sql = `
    INSERT INTO survey_responses (
      study_id, wave, record_origin, ${fields.join(', ')}
    ) VALUES ($1,$2,$3,${fields.map((_, i) => `$${i + 4}`).join(',')})
    ON CONFLICT (study_id, wave, record_origin) DO UPDATE SET
      ${fields.map((key) => `${key}=EXCLUDED.${key}`).join(', ')},
      dataset_status='eligible',
      updated_at=NOW()
    RETURNING response_id, study_id, wave, record_origin, dataset_status, submitted_at, updated_at`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(sql, [participant.study_id, wave, origin, ...values]);
    await client.query(
      `INSERT INTO research_audit_log (actor_user_id, study_id, action_type, details)
       VALUES ($1,$2,'survey_upsert',$3::jsonb)`,
      [req.user.user_id, participant.study_id, JSON.stringify({ wave, record_origin: origin, response_id: result.rows[0].response_id })]
    );
    await client.query('COMMIT');
    res.json({ ok: true, response: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

module.exports = router;
