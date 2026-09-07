const express = require('express');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

router.get('/metrics', asyncHandler(async (_req, res) => {
  const [users, active, features, researchConsent, waves] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS n FROM study_participants WHERE consent_analytics=TRUE'),
    pool.query(`SELECT COUNT(DISTINCT study_id)::int AS n FROM user_activity WHERE timestamp >= NOW() - INTERVAL '7 days'`),
    pool.query(`SELECT feature, COUNT(*)::int AS events, COUNT(DISTINCT study_id)::int AS users
                  FROM user_activity WHERE feature IS NOT NULL GROUP BY feature ORDER BY events DESC`),
    pool.query(`SELECT COUNT(*)::int AS n FROM study_participants
                WHERE consent_research=TRUE AND consent_withdrawn_at IS NULL`),
    pool.query(`SELECT wave, COUNT(*)::int AS n FROM survey_responses GROUP BY wave ORDER BY wave`),
  ]);
  res.json({
    consented_participants: users.rows[0].n,
    active_7d: active.rows[0].n,
    research_consented_participants: researchConsent.rows[0].n,
    survey_waves: waves.rows,
    features: features.rows,
  });
}));

function csvEscape(value) {
  if (value == null) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

router.get('/export-events.csv', asyncHandler(async (_req, res) => {
  const result = await pool.query(
    `SELECT activity_id, study_id, action_type, feature, metadata, timestamp
       FROM user_activity
      WHERE study_id IS NOT NULL
      ORDER BY timestamp`
  );
  const header = ['activity_id','study_id','action_type','feature','metadata','timestamp'];
  const lines = [header.join(',')];
  for (const row of result.rows) lines.push(header.map((k) => csvEscape(row[k])).join(','));
  res.type('text/csv').send(lines.join('\n'));
}));

router.get('/export-surveys.csv', asyncHandler(async (_req, res) => {
  const result = await pool.query(
    `SELECT response_id, study_id, wave, district_id, age_group, gender, education_level,
            household_size, employment_status, monthly_household_income_uzs,
            internet_access, internet_type, monthly_internet_cost_uzs, internet_quality,
            smartphone_access, computer_access, digital_skills, egov_use, digital_payment_use,
            ecommerce_use, online_selling_use, price_knowledge, financial_services_use,
            platform_usage_frequency, nps, submitted_at, updated_at
       FROM survey_responses
      ORDER BY study_id, wave`
  );
  const header = [
    'response_id','study_id','wave','district_id','age_group','gender','education_level',
    'household_size','employment_status','monthly_household_income_uzs','internet_access',
    'internet_type','monthly_internet_cost_uzs','internet_quality','smartphone_access',
    'computer_access','digital_skills','egov_use','digital_payment_use','ecommerce_use',
    'online_selling_use','price_knowledge','financial_services_use','platform_usage_frequency',
    'nps','submitted_at','updated_at'
  ];
  const lines = [header.join(',')];
  for (const row of result.rows) lines.push(header.map((k) => csvEscape(row[k])).join(','));
  res.setHeader('Content-Disposition', 'attachment; filename="phd_survey_pseudonymous.csv"');
  res.type('text/csv').send(lines.join('\n'));
}));

module.exports = router;
