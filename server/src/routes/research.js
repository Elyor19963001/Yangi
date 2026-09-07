const express = require('express');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

router.get('/metrics', asyncHandler(async (_req, res) => {
  const [users, active, features] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS n FROM study_participants WHERE consent_analytics=TRUE'),
    pool.query(`SELECT COUNT(DISTINCT study_id)::int AS n FROM user_activity WHERE timestamp >= NOW() - INTERVAL '7 days'`),
    pool.query(`SELECT feature, COUNT(*)::int AS events, COUNT(DISTINCT study_id)::int AS users
                  FROM user_activity WHERE feature IS NOT NULL GROUP BY feature ORDER BY events DESC`),
  ]);
  res.json({
    consented_participants: users.rows[0].n,
    active_7d: active.rows[0].n,
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

module.exports = router;
