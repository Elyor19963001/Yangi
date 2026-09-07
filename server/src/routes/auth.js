const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

function normalizePhone(phone) {
  const p = String(phone || '').replace(/\s+/g, '');
  if (!/^\+998\d{9}$/.test(p)) return null;
  return p;
}

function signUser(row) {
  return jwt.sign(
    {
      user_id: row.user_id,
      role: row.role || 'user',
      study_id: row.study_id || null,
      consent_analytics: Boolean(row.consent_analytics),
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

router.post('/register', asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!phone) return res.status(400).json({ error: 'Telefon +998XXXXXXXXX formatida bo‘lishi kerak' });

  const otp = String(crypto.randomInt(100000, 999999));
  const otpHash = await bcrypt.hash(otp, 10);

  const userResult = await pool.query(
    `INSERT INTO users (phone_number, full_name, district_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (phone_number) DO UPDATE SET
       full_name = COALESCE(EXCLUDED.full_name, users.full_name),
       district_id = COALESCE(EXCLUDED.district_id, users.district_id),
       updated_at = NOW()
     RETURNING user_id`,
    [phone, req.body.full_name || null, req.body.district_id || null]
  );

  const userId = userResult.rows[0].user_id;
  await pool.query('DELETE FROM otp_codes WHERE user_id = $1', [userId]);
  await pool.query(
    `INSERT INTO otp_codes (user_id, otp_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
    [userId, otpHash]
  );

  const response = { ok: true, user_id: userId, message: 'OTP yuborildi' };
  if (String(process.env.DEV_MODE).toLowerCase() === 'true') response.dev_otp = otp;
  res.json(response);
}));

router.post('/verify-otp', asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const otp = String(req.body.otp || '');
  if (!phone || !/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'Phone yoki OTP noto‘g‘ri' });

  const result = await pool.query(
    `SELECT u.user_id, u.role, sp.study_id, sp.consent_analytics, o.otp_hash, o.expires_at
       FROM users u
       JOIN otp_codes o ON o.user_id = u.user_id
       LEFT JOIN study_participants sp ON sp.user_id = u.user_id
      WHERE u.phone_number = $1
      ORDER BY o.created_at DESC LIMIT 1`,
    [phone]
  );

  if (!result.rowCount) return res.status(400).json({ error: 'OTP topilmadi' });
  const row = result.rows[0];
  if (new Date(row.expires_at) < new Date()) return res.status(400).json({ error: 'OTP muddati tugagan' });
  if (!(await bcrypt.compare(otp, row.otp_hash))) return res.status(400).json({ error: 'OTP noto‘g‘ri' });

  await pool.query('UPDATE users SET is_verified = TRUE, updated_at=NOW() WHERE user_id = $1', [row.user_id]);
  await pool.query(
    `UPDATE users SET role='admin', updated_at=NOW()
      WHERE user_id=$1 AND NOT EXISTS (SELECT 1 FROM users WHERE role='admin')`,
    [row.user_id]
  );
  await pool.query('DELETE FROM otp_codes WHERE user_id = $1', [row.user_id]);

  const current = await pool.query(
    `SELECT u.user_id, u.role, sp.study_id, sp.consent_analytics
       FROM users u LEFT JOIN study_participants sp ON sp.user_id=u.user_id
      WHERE u.user_id=$1`,
    [row.user_id]
  );
  res.json({ ok: true, token: signUser(current.rows[0]), role: current.rows[0].role });
}));

// Kept compatible with the current onboarding UI. This flow will be moved post-OTP
// before the public research pilot so consent cannot be changed by phone alone.
router.post('/consent', asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!phone) return res.status(400).json({ error: 'Telefon noto‘g‘ri' });

  const user = await pool.query('SELECT user_id FROM users WHERE phone_number=$1', [phone]);
  if (!user.rowCount) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  const userId = user.rows[0].user_id;
  const existing = await pool.query('SELECT study_id FROM study_participants WHERE user_id=$1', [userId]);
  const studyId = existing.rows[0]?.study_id || crypto.randomUUID();

  await pool.query(
    `INSERT INTO study_participants
      (user_id, study_id, consent_version, consent_analytics, consented_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       consent_version = EXCLUDED.consent_version,
       consent_analytics = EXCLUDED.consent_analytics,
       consented_at = NOW()`,
    [userId, studyId, req.body.consent_version || 'v1', Boolean(req.body.consent_analytics)]
  );

  res.json({ ok: true, study_id: studyId });
}));

module.exports = router;
