const express = require('express');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const WAVES = new Set(['baseline', 'midline', 'endline']);

async function getParticipant(userId) {
  const result = await pool.query(
    `SELECT participant_id, study_id, consent_research, research_consent_version,
            research_consented_at, consent_withdrawn_at
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
    `SELECT wave, submitted_at, updated_at
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
    completed_waves: responses.rows,
  });
}));

router.post('/consent', asyncHandler(async (req, res) => {
  const accepted = Boolean(req.body.accepted);
  const version = String(req.body.consent_version || 'research-v1');
  const participant = await getParticipant(req.user.user_id);
  if (!participant) return res.status(404).json({ error: 'Study participant topilmadi' });

  await pool.query(
    `UPDATE study_participants
        SET consent_research=$1,
            research_consent_version=$2,
            research_consented_at=CASE WHEN $1 THEN NOW() ELSE research_consented_at END,
            consent_withdrawn_at=CASE WHEN $1 THEN NULL ELSE NOW() END
      WHERE user_id=$3`,
    [accepted, version, req.user.user_id]
  );

  await pool.query(
    `INSERT INTO consent_records (study_id, consent_scope, consent_version, accepted)
     VALUES ($1, 'research', $2, $3)`,
    [participant.study_id, version, accepted]
  );

  res.json({ ok: true, consent_research: accepted, study_id: participant.study_id });
}));

router.post('/withdraw', asyncHandler(async (req, res) => {
  const participant = await getParticipant(req.user.user_id);
  if (!participant) return res.status(404).json({ error: 'Study participant topilmadi' });

  await pool.query(
    `UPDATE study_participants
        SET consent_research=FALSE, consent_withdrawn_at=NOW()
      WHERE user_id=$1`,
    [req.user.user_id]
  );
  await pool.query(
    `INSERT INTO consent_records (study_id, consent_scope, consent_version, accepted)
     VALUES ($1, 'research', COALESCE($2,'research-v1'), FALSE)`,
    [participant.study_id, participant.research_consent_version]
  );
  res.json({ ok: true });
}));

router.get('/:wave', asyncHandler(async (req, res) => {
  const wave = req.params.wave;
  if (!WAVES.has(wave)) return res.status(400).json({ error: 'Wave noto‘g‘ri' });
  const participant = await getParticipant(req.user.user_id);
  if (!participant) return res.status(404).json({ error: 'Study participant topilmadi' });

  const result = await pool.query(
    `SELECT * FROM survey_responses WHERE study_id=$1 AND wave=$2`,
    [participant.study_id, wave]
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
      study_id, wave, ${fields.join(', ')}
    ) VALUES ($1,$2,${fields.map((_, i) => `$${i + 3}`).join(',')})
    ON CONFLICT (study_id, wave) DO UPDATE SET
      ${fields.map((key, i) => `${key}=EXCLUDED.${key}`).join(', ')},
      updated_at=NOW()
    RETURNING response_id, study_id, wave, submitted_at, updated_at`;

  const result = await pool.query(sql, [participant.study_id, wave, ...values]);
  res.json({ ok: true, response: result.rows[0] });
}));

module.exports = router;
