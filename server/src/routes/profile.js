const express = require('express');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { getIdentityByUserId, updateIdentityProfile } = require('../services/identityVault');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT u.user_id, u.district_id, u.registration_date, u.role,
            sp.study_id, sp.consent_analytics, sp.consented_at
       FROM users u LEFT JOIN study_participants sp ON sp.user_id=u.user_id
      WHERE u.user_id=$1`,
    [req.user.user_id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  const identity = await getIdentityByUserId(req.user.user_id);
  res.json({
    ...result.rows[0],
    full_name: identity?.full_name || null,
    pii_storage: process.env.PII_DATABASE_URL ? 'external' : 'embedded-dev',
  });
}));

router.put('/', asyncHandler(async (req, res) => {
  const userId = req.user.user_id;
  if (req.body.full_name !== undefined) {
    await updateIdentityProfile(userId, String(req.body.full_name || '').trim().slice(0, 120) || null);
  }
  const result = await pool.query(
    `UPDATE users SET district_id=COALESCE($1,district_id), updated_at=NOW()
      WHERE user_id=$2 RETURNING user_id, district_id, role`,
    [req.body.district_id, userId]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  const identity = await getIdentityByUserId(userId);
  res.json({ ...result.rows[0], full_name: identity?.full_name || null });
}));

module.exports = router;
