const crypto = require('crypto');
const { pool } = require('../config/db');
const { piiPool, externalPiiConfigured, piiMode } = require('../config/piiDb');

async function findIdentityByPhone(phone) {
  if (externalPiiConfigured()) {
    const result = await piiPool.query(
      `SELECT identity_ref, research_user_id AS user_id, phone_number, full_name
         FROM pii_identities
        WHERE phone_number=$1`,
      [phone]
    );
    return result.rows[0] || null;
  }

  const result = await pool.query(
    `SELECT identity_ref, user_id, phone_number, full_name
       FROM users
      WHERE phone_number=$1`,
    [phone]
  );
  return result.rows[0] || null;
}

async function getIdentityByUserId(userId) {
  if (externalPiiConfigured()) {
    const result = await piiPool.query(
      `SELECT identity_ref, research_user_id AS user_id, phone_number, full_name
         FROM pii_identities
        WHERE research_user_id=$1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  const result = await pool.query(
    `SELECT identity_ref, user_id, phone_number, full_name
       FROM users
      WHERE user_id=$1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function registerIdentity({ phone, fullName, districtId }) {
  if (!externalPiiConfigured()) {
    const result = await pool.query(
      `INSERT INTO users (phone_number, full_name, district_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (phone_number) DO UPDATE SET
         full_name = CASE
           WHEN users.is_verified THEN users.full_name
           ELSE COALESCE(EXCLUDED.full_name, users.full_name)
         END,
         district_id = CASE
           WHEN users.is_verified THEN users.district_id
           ELSE COALESCE(EXCLUDED.district_id, users.district_id)
         END,
         updated_at = NOW()
       RETURNING user_id`,
      [phone, fullName || null, districtId || null]
    );
    return { userId: result.rows[0].user_id, mode: 'embedded-dev' };
  }

  const existing = await findIdentityByPhone(phone);
  if (existing) {
    const account = await pool.query(
      'SELECT user_id, is_verified FROM users WHERE user_id=$1',
      [existing.user_id]
    );
    if (!account.rowCount) {
      const error = new Error('PII vault va research account mapping mos emas');
      error.code = 'PII_MAPPING_BROKEN';
      throw error;
    }

    if (!account.rows[0].is_verified) {
      await pool.query(
        'UPDATE users SET district_id=COALESCE($1,district_id), updated_at=NOW() WHERE user_id=$2',
        [districtId || null, existing.user_id]
      );
      if (fullName) {
        await piiPool.query(
          'UPDATE pii_identities SET full_name=COALESCE($1,full_name), updated_at=NOW() WHERE research_user_id=$2',
          [fullName, existing.user_id]
        );
      }
    }
    return { userId: existing.user_id, mode: 'external' };
  }

  const identityRef = crypto.randomUUID();
  let userId = null;
  try {
    const created = await pool.query(
      `INSERT INTO users (identity_ref, phone_number, full_name, district_id)
       VALUES ($1, NULL, NULL, $2)
       RETURNING user_id`,
      [identityRef, districtId || null]
    );
    userId = created.rows[0].user_id;

    await piiPool.query(
      `INSERT INTO pii_identities
        (identity_ref, research_user_id, phone_number, full_name, created_at, updated_at)
       VALUES ($1,$2,$3,$4,NOW(),NOW())`,
      [identityRef, userId, phone, fullName || null]
    );
    return { userId, mode: 'external' };
  } catch (error) {
    if (userId) {
      try { await pool.query('DELETE FROM users WHERE user_id=$1', [userId]); } catch (_) {}
    }
    throw error;
  }
}

async function updateIdentityProfile(userId, fullName) {
  if (fullName === undefined) return;
  if (externalPiiConfigured()) {
    const result = await piiPool.query(
      `UPDATE pii_identities
          SET full_name=$1, updated_at=NOW()
        WHERE research_user_id=$2`,
      [fullName || null, userId]
    );
    if (!result.rowCount) {
      const error = new Error('PII identity topilmadi');
      error.code = 'PII_IDENTITY_NOT_FOUND';
      throw error;
    }
    return;
  }
  await pool.query(
    'UPDATE users SET full_name=$1, updated_at=NOW() WHERE user_id=$2',
    [fullName || null, userId]
  );
}

async function legacyPiiCount() {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM users
      WHERE phone_number IS NOT NULL OR full_name IS NOT NULL`
  );
  return Number(result.rows[0]?.n || 0);
}

async function piiConnectionOk() {
  if (!externalPiiConfigured()) return false;
  try {
    await piiPool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

function piiReadiness() {
  const residency = String(process.env.PII_DATA_RESIDENCY || '').trim().toUpperCase();
  return {
    mode: piiMode(),
    external: externalPiiConfigured(),
    residency_declared: residency || null,
    residency_declared_uz: residency === 'UZ',
    region_label: String(process.env.PII_VAULT_REGION || '').trim() || null,
  };
}

module.exports = {
  findIdentityByPhone,
  getIdentityByUserId,
  registerIdentity,
  updateIdentityProfile,
  legacyPiiCount,
  piiConnectionOk,
  piiReadiness,
};
