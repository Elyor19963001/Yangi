const express = require('express');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT u.user_id, u.full_name, u.district_id, u.registration_date,
            sp.study_id, sp.consent_analytics, sp.consented_at
       FROM users u LEFT JOIN study_participants sp ON sp.user_id=u.user_id
      WHERE u.user_id=$1`,
    [req.user.user_id]
  );
  res.json(result.rows[0]);
}));

router.put('/', asyncHandler(async (req, res) => {
  const result = await pool.query(
    `UPDATE users SET full_name=COALESCE($1,full_name), district_id=COALESCE($2,district_id)
      WHERE user_id=$3 RETURNING user_id, full_name, district_id`,
    [req.body.full_name, req.body.district_id, req.user.user_id]
  );
  res.json(result.rows[0]);
}));

module.exports = router;
