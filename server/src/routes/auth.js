const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const {
  findIdentityByPhone,
  registerIdentity,
} = require('../services/identityVault');
const {
  buildMessageId,
  devMode,
  sendOtpSms,
  smsReadiness,
  statusSecretMatches,
} = require('../services/sms');

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

async function ensureOtpCooldown(userId) {
  const previousOtp = await pool.query(
    `SELECT created_at
       FROM otp_codes
      WHERE user_id=$1
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  );

  if (!previousOtp.rowCount) return null;
  const ageMs = Date.now() - new Date(previousOtp.rows[0].created_at).getTime();
  const minResendMs = 60 * 1000;
  if (ageMs < 0 || ageMs >= minResendMs) return null;
  return Math.max(1, Math.ceil((minResendMs - ageMs) / 1000));
}

async function issueOtp(userId, phone) {
  const readiness = smsReadiness();
  if (!devMode() && !readiness.configured) {
    const error = new Error('SMS provider hali production uchun konfiguratsiya qilinmagan');
    error.code = 'SMS_PROVIDER_NOT_CONFIGURED';
    throw error;
  }

  const retryAfterSeconds = await ensureOtpCooldown(userId);
  if (retryAfterSeconds) {
    const error = new Error(`Yangi OTP olishdan oldin ${retryAfterSeconds} soniya kuting.`);
    error.code = 'OTP_COOLDOWN';
    error.retryAfterSeconds = retryAfterSeconds;
    throw error;
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const otpHash = await bcrypt.hash(otp, 10);
  const messageId = buildMessageId();
  const provider = devMode() ? 'dev' : 'playmobile';

  await pool.query('DELETE FROM otp_codes WHERE user_id = $1', [userId]);
  await pool.query(
    `INSERT INTO otp_codes
      (user_id, otp_hash, expires_at, attempt_count, provider, provider_message_id, sent_at)
     VALUES ($1, $2, NOW() + INTERVAL '10 minutes', 0, $3, $4, NULL)`,
    [userId, otpHash, provider, messageId]
  );

  if (devMode()) {
    await pool.query(
      'UPDATE otp_codes SET sent_at=NOW() WHERE user_id=$1 AND provider_message_id=$2',
      [userId, messageId]
    );
    return { mode: 'dev', provider: 'dev', messageId, otp };
  }

  try {
    const sent = await sendOtpSms(phone, otp, messageId);
    await pool.query(
      'UPDATE otp_codes SET sent_at=NOW() WHERE user_id=$1 AND provider_message_id=$2',
      [userId, messageId]
    );
    await pool.query(
      `INSERT INTO sms_delivery_log
        (user_id, purpose, provider, provider_message_id, status, description, sent_at, updated_at)
       VALUES ($1, 'otp', $2, $3, 'Accepted', $4, NOW(), NOW())
       ON CONFLICT (provider_message_id) DO UPDATE SET
         status=EXCLUDED.status,
         description=EXCLUDED.description,
         updated_at=NOW()`,
      [userId, sent.provider, sent.messageId, sent.providerResponse || 'Playmobile HTTP 2xx']
    );
    return { mode: 'sms', provider: sent.provider, messageId: sent.messageId };
  } catch (error) {
    await pool.query(
      'DELETE FROM otp_codes WHERE user_id=$1 AND provider_message_id=$2',
      [userId, messageId]
    );
    await pool.query(
      `INSERT INTO sms_delivery_log
        (user_id, purpose, provider, provider_message_id, status, description, sent_at, updated_at)
       VALUES ($1, 'otp', $2, $3, 'Failed', $4, NOW(), NOW())
       ON CONFLICT (provider_message_id) DO UPDATE SET
         status='Failed',
         description=EXCLUDED.description,
         updated_at=NOW()`,
      [userId, provider, messageId, String(error.providerDescription || error.message || 'SMS send failed').slice(0, 500)]
    );
    throw error;
  }
}

router.get('/sms/config', (_req, res) => {
  const readiness = smsReadiness();
  res.json({
    mode: readiness.mode,
    provider: readiness.provider,
    configured: readiness.configured,
    status_callback_configured: readiness.status_callback_configured,
  });
});

router.post('/sms/status', asyncHandler(async (req, res) => {
  if (!statusSecretMatches(req)) return res.status(401).json({ error: 'SMS status token noto‘g‘ri' });
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (!messages.length) return res.status(400).json({ error: 'messages massivini yuboring' });

  let updated = 0;
  for (const item of messages.slice(0, 200)) {
    const messageId = String(item?.['message-id'] || '').slice(0, 40);
    const status = String(item?.status || '').slice(0, 40);
    const description = String(item?.description || '').slice(0, 500);
    if (!messageId || !status) continue;
    const result = await pool.query(
      `UPDATE sms_delivery_log
          SET status=$2,
              description=CASE WHEN $3='' THEN description ELSE $3 END,
              status_at=NOW(),
              updated_at=NOW()
        WHERE provider_message_id=$1`,
      [messageId, status, description]
    );
    updated += result.rowCount;
  }

  res.json({ ok: true, updated });
}));

router.post('/register', otpRequestLimiter, asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!phone) return res.status(400).json({ error: 'Telefon +998XXXXXXXXX formatida bo‘lishi kerak' });

  const identity = await registerIdentity({
    phone,
    fullName: req.body.full_name || null,
    districtId: req.body.district_id || null,
  });

  try {
    const issued = await issueOtp(identity.userId, phone);
    const response = {
      ok: true,
      message: issued.mode === 'sms' ? 'OTP SMS orqali yuborildi' : 'OTP test rejimida yaratildi',
      expires_in_seconds: 600,
      resend_after_seconds: 60,
      delivery: { mode: issued.mode, provider: issued.provider, status: 'accepted' },
      identity_storage: identity.mode,
    };
    if (issued.mode === 'dev') response.dev_otp = issued.otp;
    res.json(response);
  } catch (error) {
    if (error.code === 'OTP_COOLDOWN') {
      res.set('Retry-After', String(error.retryAfterSeconds));
      return res.status(429).json({ error: error.message, retry_after_seconds: error.retryAfterSeconds });
    }
    if (error.code === 'SMS_PROVIDER_NOT_CONFIGURED') {
      return res.status(503).json({ error: error.message, code: error.code });
    }
    if (error.code === 'SMS_SEND_FAILED') {
      return res.status(502).json({ error: 'SMS yuborilmadi. Keyinroq qayta urinib ko‘ring.', code: error.code });
    }
    throw error;
  }
}));

router.post('/resend-otp', otpRequestLimiter, asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!phone) return res.status(400).json({ error: 'Telefon +998XXXXXXXXX formatida bo‘lishi kerak' });

  const identity = await findIdentityByPhone(phone);
  if (!identity) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

  try {
    const issued = await issueOtp(identity.user_id, phone);
    const response = {
      ok: true,
      message: issued.mode === 'sms' ? 'Yangi OTP SMS orqali yuborildi' : 'Yangi test OTP yaratildi',
      expires_in_seconds: 600,
      resend_after_seconds: 60,
      delivery: { mode: issued.mode, provider: issued.provider, status: 'accepted' },
    };
    if (issued.mode === 'dev') response.dev_otp = issued.otp;
    res.json(response);
  } catch (error) {
    if (error.code === 'OTP_COOLDOWN') {
      res.set('Retry-After', String(error.retryAfterSeconds));
      return res.status(429).json({ error: error.message, retry_after_seconds: error.retryAfterSeconds });
    }
    if (error.code === 'SMS_PROVIDER_NOT_CONFIGURED') {
      return res.status(503).json({ error: error.message, code: error.code });
    }
    if (error.code === 'SMS_SEND_FAILED') {
      return res.status(502).json({ error: 'SMS yuborilmadi. Keyinroq qayta urinib ko‘ring.', code: error.code });
    }
    throw error;
  }
}));

router.post('/verify-otp', otpVerifyLimiter, asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const otp = String(req.body.otp || '');
  if (!phone || !/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'Phone yoki OTP noto‘g‘ri' });

  const identity = await findIdentityByPhone(phone);
  if (!identity) return res.status(400).json({ error: 'OTP topilmadi yoki foydalanuvchi mavjud emas' });

  const result = await pool.query(
    `SELECT u.user_id, u.role, sp.study_id, sp.consent_analytics,
            o.otp_id, o.otp_hash, o.expires_at, o.attempt_count
       FROM users u
       JOIN otp_codes o ON o.user_id = u.user_id AND o.sent_at IS NOT NULL
       LEFT JOIN study_participants sp ON sp.user_id = u.user_id
      WHERE u.user_id = $1
      ORDER BY o.created_at DESC LIMIT 1`,
    [identity.user_id]
  );

  if (!result.rowCount) return res.status(400).json({ error: 'OTP topilmadi yoki yuborish tasdiqlanmagan' });
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

  const bootstrapAdminPhone = normalizePhone(process.env.BOOTSTRAP_ADMIN_PHONE);
  if (bootstrapAdminPhone && phone === bootstrapAdminPhone) {
    await pool.query(
      `UPDATE users SET role='admin', updated_at=NOW()
        WHERE user_id=$1 AND NOT EXISTS (SELECT 1 FROM users WHERE role='admin' AND user_id<>$1)`,
      [row.user_id]
    );
  }

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
  const consentAnalytics = req.body.consent_analytics === true;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO study_participants
        (user_id, study_id, consent_version, consent_analytics, consented_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         consent_version = EXCLUDED.consent_version,
         consent_analytics = EXCLUDED.consent_analytics,
         consented_at = NOW()`,
      [userId, studyId, consentVersion, consentAnalytics]
    );

    await client.query(
      `INSERT INTO consent_records (study_id, consent_scope, consent_version, accepted, recorded_at)
       VALUES ($1, 'analytics', $2, $3, NOW())`,
      [studyId, consentVersion, consentAnalytics]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
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
