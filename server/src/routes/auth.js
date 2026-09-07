const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const otpRequestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'OTP juda ko‘p so‘raldi. Bir necha daqiqadan keyin qayta urinib ko‘ring.' },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'OTP tekshirish urinishlari juda ko‘p. Keyinroq qayta urinib ko‘ring.' },
});

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

router.post('/register', otpRequestLimiter, asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!phone) return res.status(400).json({ error: 'Telefon +998XXXXXXXXX formatida bo‘lishi kerak' });

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
  const previousOtp = await pool.query(
    `SELECT created_at
       FROM otp_codes
      WHERE user_id=$1
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  );

  if (previousOtp.rowCount) {
    const ageMs = Date.now() - new Date(previousOtp.rows[0].created_at).getTime();
    const minResendMs = 60 * 1000;
    if (ageMs >= 0 && ageMs < minResendMs) {
      const retryAfterSeconds = Math.max(1, Math.ceil((minResendMs - ageMs) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: `Yangi OTP olishdan oldin ${retryAfterSeconds} soniya kuting.`,
        retry_after_seconds: retryAfterSeconds,
      });
    }
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const otpHash = await bcrypt.hash(otp, 10);

  await pool.query('DELETE FROM otp_codes WHERE user_id = $1', [userId]);
  await pool.query(
    `INSERT INTO otp_codes (user_id, otp_hash, expires_at, attempt_count)
     VALUES ($1, $2, NOW() + INTERVAL '10 minutes', 0)`,
    [userId, otpHash]
  );

  const response = { ok: true, user_id: userId, message: 'OTP yuborildi', expires_in_seconds: 600 };
  if (String(process.env.DEV_MODE).toLowerCase() === 'true') response.dev_otp = otp;
  res.json(response);
}));

router.post('/verify-otp', otpVerifyLimiter, asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const otp = String(req.body.otp || '');
  if (!phone || !/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'Phone yoki OTP noto‘g‘ri' });

  const result = await pool.query(
    `SELECT u.user_id, u.role, sp.study_id, sp.consent_analytics,
            o.otp_id, o.otp_hash, o.expires_at, o.attempt_count
       FROM users u
       JOIN otp_codes o ON o.user_id = u.user_id
       LEFT JOIN study_participants sp ON sp.user_id = u.user_id
      WHERE u.phone_number = $1
      ORDER BY o.created_at DESC LIMIT 1`,
    [phone]
  );

  if (!result.rowCount) return res.status(400).json({ error: 'OTP topilmadi' });
  const row = result.rows[0];

  if (Number(row.attempt_count || 0) >= 5) {
    await pool.query('DELETE FROM otp_codes WHERE otp_id=$1', [row.otp_id]);
    return res.status(429).json({ error: 'OTP urinishlari limiti tugadi. Yangi OTP oling.' });
  }

  if (new Date(row.expires_at) < new Date()) {
    await pool.query('DELETE FROM otp_codes WHERE otp_id=$1', [row.otp_id]);
    return res.status(400).json({ error: 'OTP muddati tugagan. Yangi OTP oling.' });
  }

  const matches = await bcrypt.compare(otp, row.otp_hash);
  if (!matches) {
    const updated = await pool.query(
      `UPDATE otp_codes
          SET attempt_count = attempt_count + 1,
              last_attempt_at = NOW()
        WHERE otp_id=$1
      RETURNING attempt_count`,
      [row.otp_id]
    );
    const attempts = Number(updated.rows[0]?.attempt_count || 0);
    const remaining = Math.max(0, 5 - attempts);
    if (remaining === 0) await pool.query('DELETE FROM otp_codes WHERE otp_id=$1', [row.otp_id]);
    return res.status(400).json({
      error: remaining > 0
        ? `OTP noto‘g‘ri. ${remaining} ta urinish qoldi.`
        : 'OTP urinishlari limiti tugadi. Yangi OTP oling.',
      attempts_remaining: remaining,
    });
  }

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

router.post('/consent', requireAuth, asyncHandler(async (req, res) => {
  const userId = Number(req.user.user_id);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(401).json({ error: 'Authentication required' });

  const account = await pool.query(
    'SELECT user_id, role, is_verified FROM users WHERE user_id=$1',
    [userId]
  );
  if (!account.rowCount) return res.status(401).json({ error: 'Foydalanuvchi topilmadi' });
  if (!account.rows[0].is_verified) return res.status(403).json({ error: 'Avval OTP orqali hisobni tasdiqlang' });

  const existing = await pool.query(
    'SELECT study_id FROM study_participants WHERE user_id=$1',
    [userId]
  );
  const studyId = existing.rows[0]?.study_id || crypto.randomUUID();
  const consentVersion = String(req.body.consent_version || 'v2-auth').slice(0, 30);
  const consentAnalytics = Boolean(req.body.consent_analytics);

  await pool.query('BEGIN');
  try {
    await pool.query(
      `INSERT INTO study_participants
        (user_id, study_id, consent_version, consent_analytics, consented_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         consent_version = EXCLUDED.consent_version,
         consent_analytics = EXCLUDED.consent_analytics,
         consented_at = NOW()`,
      [userId, studyId, consentVersion, consentAnalytics]
    );

    await pool.query(
      `INSERT INTO consent_records (study_id, consent_scope, consent_version, accepted, recorded_at)
       VALUES ($1, 'analytics', $2, $3, NOW())`,
      [studyId, consentVersion, consentAnalytics]
    );

    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }

  const refreshed = {
    user_id: userId,
    role: account.rows[0].role || 'user',
    study_id: studyId,
    consent_analytics: consentAnalytics,
  };

  res.json({
    ok: true,
    study_id: studyId,
    consent_analytics: consentAnalytics,
    token: signUser(refreshed),
  });
}));

module.exports = router;
