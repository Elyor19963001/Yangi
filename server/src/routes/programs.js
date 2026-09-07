const express = require('express');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { activity } = require('../middleware/activity');

const router = express.Router();
router.use(requireAuth);

router.get('/', activity('view', 'programs'), asyncHandler(async (_req, res) => {
  const result = await pool.query(
    `SELECT program_id, title, program_type, summary, eligibility, source_url, valid_from, valid_to
       FROM government_programs
      WHERE is_active = TRUE
      ORDER BY valid_to NULLS LAST, title`
  );
  res.json(result.rows);
}));

module.exports = router;
