const express = require('express');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

const PILOT_STATUSES = new Set(['screened','eligible','enrolled','randomized','active','completed','withdrawn','excluded']);
const QUALITY_STATUSES = new Set(['pending','reviewed','clean','flagged','excluded']);
const ASSIGNMENT_GROUPS = new Set(['control','treatment']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function csvEscape(value) {
  if (value == null) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function csvResponse(res, filename, rows, header) {
  const lines = [header.join(',')];
  for (const row of rows) lines.push(header.map((k) => csvEscape(row[k])).join(','));
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.type('text/csv').send(lines.join('\n'));
}

function boundedLimit(value, fallback = 200, max = 1000) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

router.get('/metrics', asyncHandler(async (_req, res) => {
  const [analyticsConsent, active, features, researchConsent, waves, pilot] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS n FROM study_participants WHERE consent_analytics=TRUE'),
    pool.query(`SELECT COUNT(DISTINCT study_id)::int AS n FROM user_activity
                WHERE timestamp >= NOW() - INTERVAL '7 days' AND record_origin='pilot'`),
    pool.query(`SELECT feature, COUNT(*)::int AS events, COUNT(DISTINCT study_id)::int AS users
                  FROM user_activity
                 WHERE feature IS NOT NULL AND record_origin='pilot'
                 GROUP BY feature ORDER BY events DESC`),
    pool.query(`SELECT COUNT(*)::int AS n FROM study_participants
                WHERE consent_research=TRUE AND consent_withdrawn_at IS NULL`),
    pool.query(`SELECT wave, COUNT(*)::int AS n FROM survey_responses
                WHERE record_origin='pilot' AND dataset_status<>'excluded'
                GROUP BY wave ORDER BY wave`),
    pool.query(`SELECT
                  COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE pilot_status IN ('enrolled','randomized','active','completed'))::int AS enrolled,
                  COUNT(*) FILTER (WHERE assignment_group='treatment')::int AS treatment,
                  COUNT(*) FILTER (WHERE assignment_group='control')::int AS control,
                  COUNT(*) FILTER (WHERE pilot_status='completed')::int AS completed,
                  COUNT(*) FILTER (WHERE eligible_for_analysis=TRUE AND data_quality_status<>'excluded')::int AS analysis_eligible
                FROM study_participants`),
  ]);

  res.json({
    consented_participants: analyticsConsent.rows[0].n,
    active_7d: active.rows[0].n,
    research_consented_participants: researchConsent.rows[0].n,
    survey_waves: waves.rows,
    features: features.rows,
    pilot: pilot.rows[0],
    pii_in_response: false,
  });
}));

router.get('/progress', asyncHandler(async (_req, res) => {
  const [statusRows, groupRows, waveRows] = await Promise.all([
    pool.query(`SELECT pilot_status, COUNT(*)::int AS n
                  FROM study_participants GROUP BY pilot_status ORDER BY pilot_status`),
    pool.query(`SELECT COALESCE(assignment_group,'unassigned') AS assignment_group, COUNT(*)::int AS n
                  FROM study_participants GROUP BY COALESCE(assignment_group,'unassigned') ORDER BY 1`),
    pool.query(`SELECT
                  sp.assignment_group,
                  COUNT(DISTINCT sp.study_id)::int AS participants,
                  COUNT(DISTINCT sp.study_id) FILTER (WHERE sr.wave='baseline' AND sr.record_origin='pilot' AND sr.dataset_status<>'excluded')::int AS t0,
                  COUNT(DISTINCT sp.study_id) FILTER (WHERE sr.wave='midline' AND sr.record_origin='pilot' AND sr.dataset_status<>'excluded')::int AS t3,
                  COUNT(DISTINCT sp.study_id) FILTER (WHERE sr.wave='endline' AND sr.record_origin='pilot' AND sr.dataset_status<>'excluded')::int AS t6
                FROM study_participants sp
                LEFT JOIN survey_responses sr ON sr.study_id=sp.study_id
               WHERE sp.pilot_status IN ('enrolled','randomized','active','completed')
               GROUP BY sp.assignment_group ORDER BY sp.assignment_group NULLS LAST`),
  ]);
  res.json({ statuses: statusRows.rows, groups: groupRows.rows, wave_completion: waveRows.rows });
}));

router.get('/participants', asyncHandler(async (req, res) => {
  const limit = boundedLimit(req.query.limit);
  const result = await pool.query(
    `SELECT
       sp.study_id,
       sp.pilot_status,
       sp.pilot_cohort,
       sp.assignment_group,
       sp.assignment_source,
       sp.assignment_at,
       sp.enrolled_at,
       sp.completed_at,
       sp.eligible_for_analysis,
       sp.data_quality_status,
       sp.consent_research,
       sp.research_consented_at,
       sp.consent_withdrawn_at,
       COUNT(sr.response_id) FILTER (WHERE sr.record_origin='pilot' AND sr.dataset_status<>'excluded')::int AS pilot_waves,
       BOOL_OR(sr.wave='baseline' AND sr.record_origin='pilot' AND sr.dataset_status<>'excluded') AS t0_complete,
       BOOL_OR(sr.wave='midline' AND sr.record_origin='pilot' AND sr.dataset_status<>'excluded') AS t3_complete,
       BOOL_OR(sr.wave='endline' AND sr.record_origin='pilot' AND sr.dataset_status<>'excluded') AS t6_complete,
       MAX(sr.updated_at) FILTER (WHERE sr.record_origin='pilot') AS last_survey_at
     FROM study_participants sp
     LEFT JOIN survey_responses sr ON sr.study_id=sp.study_id
     GROUP BY sp.participant_id
     ORDER BY sp.updated_at DESC, sp.participant_id DESC
     LIMIT $1`,
    [limit]
  );
  res.json({ participants: result.rows, pii_in_response: false });
}));

router.patch('/participants/:studyId', asyncHandler(async (req, res) => {
  const studyId = String(req.params.studyId || '');
  if (!UUID_RE.test(studyId)) return res.status(400).json({ error: 'study_id noto‘g‘ri' });

  const b = req.body || {};
  const updates = [];
  const values = [];
  const audit = {};

  function setField(sqlName, value) {
    values.push(value);
    updates.push(`${sqlName}=$${values.length}`);
    audit[sqlName] = value;
  }

  if (b.pilot_status !== undefined) {
    const status = String(b.pilot_status);
    if (!PILOT_STATUSES.has(status)) return res.status(400).json({ error: 'pilot_status noto‘g‘ri' });
    setField('pilot_status', status);
    if (status === 'enrolled') updates.push('enrolled_at=COALESCE(enrolled_at,NOW())');
    if (status === 'completed') updates.push('completed_at=COALESCE(completed_at,NOW())');
  }

  if (b.pilot_cohort !== undefined) {
    const cohort = b.pilot_cohort == null ? null : String(b.pilot_cohort).trim().slice(0, 40);
    setField('pilot_cohort', cohort || null);
  }

  if (b.data_quality_status !== undefined) {
    const status = String(b.data_quality_status);
    if (!QUALITY_STATUSES.has(status)) return res.status(400).json({ error: 'data_quality_status noto‘g‘ri' });
    setField('data_quality_status', status);
  }

  if (b.eligible_for_analysis !== undefined) setField('eligible_for_analysis', b.eligible_for_analysis === true);

  if (b.withdrawal_reason !== undefined) {
    const reason = b.withdrawal_reason == null ? null : String(b.withdrawal_reason).trim().slice(0, 300);
    setField('withdrawal_reason', reason || null);
  }

  if (b.assignment_group !== undefined) {
    const group = String(b.assignment_group);
    if (!ASSIGNMENT_GROUPS.has(group)) return res.status(400).json({ error: 'assignment_group control yoki treatment bo‘lishi kerak' });
    if (b.assignment_source !== 'external_randomization') {
      return res.status(400).json({ error: 'Assignment faqat tashqi randomizatsiya natijasi sifatida import qilinadi' });
    }
    setField('assignment_group', group);
    setField('assignment_source', 'external_randomization');
    updates.push('assignment_at=COALESCE(assignment_at,NOW())');
  }

  if (!updates.length) return res.status(400).json({ error: 'Yangilanadigan maydon yo‘q' });
  updates.push('updated_at=NOW()');
  values.push(studyId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE study_participants SET ${updates.join(', ')} WHERE study_id=$${values.length}
       RETURNING study_id, pilot_status, pilot_cohort, assignment_group, assignment_source,
                 assignment_at, enrolled_at, completed_at, eligible_for_analysis, data_quality_status, withdrawal_reason, updated_at`,
      values
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Participant topilmadi' });
    }
    await client.query(
      `INSERT INTO research_audit_log (actor_user_id, study_id, action_type, details)
       VALUES ($1,$2,'participant_update',$3::jsonb)`,
      [req.user.user_id, studyId, JSON.stringify(audit)]
    );
    await client.query('COMMIT');
    res.json({ ok: true, participant: result.rows[0], pii_in_response: false });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/audit', asyncHandler(async (req, res) => {
  const limit = boundedLimit(req.query.limit, 100, 500);
  const result = await pool.query(
    `SELECT audit_id, study_id, action_type, details, created_at
       FROM research_audit_log ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  res.json({ events: result.rows, pii_in_response: false });
}));

router.get('/export-events.csv', asyncHandler(async (_req, res) => {
  const result = await pool.query(
    `SELECT ua.activity_id, ua.study_id, ua.action_type, ua.feature, ua.metadata, ua.timestamp, ua.record_origin
       FROM user_activity ua
       JOIN study_participants sp ON sp.study_id=ua.study_id
      WHERE ua.study_id IS NOT NULL
        AND ua.record_origin='pilot'
        AND sp.consent_analytics=TRUE
        AND sp.eligible_for_analysis=TRUE
      ORDER BY ua.timestamp`
  );
  csvResponse(res, 'phd_events_pseudonymous_pilot.csv', result.rows,
    ['activity_id','study_id','action_type','feature','metadata','timestamp','record_origin']);
}));

async function exportSurveyRows(res, filename) {
  const result = await pool.query(
    `SELECT study_id, pilot_status, pilot_cohort, assignment_group, assignment_source,
            eligible_for_analysis, data_quality_status, response_id, wave, record_origin, dataset_status,
            district_id, age_group, gender, education_level, household_size, employment_status,
            monthly_household_income_uzs, internet_access, internet_type, monthly_internet_cost_uzs,
            internet_quality, smartphone_access, computer_access, digital_skills, egov_use,
            digital_payment_use, ecommerce_use, online_selling_use, price_knowledge,
            financial_services_use, platform_usage_frequency, nps, submitted_at, updated_at
       FROM research_panel_pseudonymous
      WHERE record_origin='pilot'
        AND dataset_status='eligible'
        AND consent_research=TRUE
        AND consent_withdrawn_at IS NULL
        AND eligible_for_analysis=TRUE
        AND data_quality_status<>'excluded'
      ORDER BY study_id, wave`
  );
  const header = [
    'study_id','pilot_status','pilot_cohort','assignment_group','assignment_source',
    'eligible_for_analysis','data_quality_status','response_id','wave','record_origin','dataset_status',
    'district_id','age_group','gender','education_level','household_size','employment_status',
    'monthly_household_income_uzs','internet_access','internet_type','monthly_internet_cost_uzs',
    'internet_quality','smartphone_access','computer_access','digital_skills','egov_use',
    'digital_payment_use','ecommerce_use','online_selling_use','price_knowledge',
    'financial_services_use','platform_usage_frequency','nps','submitted_at','updated_at'
  ];
  csvResponse(res, filename, result.rows, header);
}

router.get('/export-surveys.csv', asyncHandler(async (_req, res) => {
  await exportSurveyRows(res, 'phd_survey_pseudonymous_pilot.csv');
}));

router.get('/export-panel.csv', asyncHandler(async (_req, res) => {
  await exportSurveyRows(res, 'phd_panel_pseudonymous_pilot.csv');
}));

module.exports = router;
