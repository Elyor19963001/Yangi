require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function flag(name, defaultValue = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function poolFor(url, prefix) {
  const connectionString = String(url || '').trim();
  if (!connectionString) throw new Error(`${prefix}_DATABASE_URL is required`);
  const urlDeclaresSsl = /(?:\?|&)sslmode=(?:require|verify-ca|verify-full)(?:&|$)/i.test(connectionString);
  const requireTls = flag(`${prefix}_REQUIRE_TLS`, false) || urlDeclaresSsl;
  let ssl;
  if (requireTls && !urlDeclaresSsl) {
    const caBase64 = String(process.env[`${prefix}_TLS_CA_BASE64`] || '').trim();
    ssl = { rejectUnauthorized: flag(`${prefix}_TLS_REJECT_UNAUTHORIZED`, true) };
    if (caBase64) ssl.ca = Buffer.from(caBase64, 'base64').toString('utf8');
  }
  return {
    pool: new Pool({
      connectionString,
      ssl,
      max: 2,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      keepAlive: true,
      application_name: `phd-${prefix.toLowerCase()}-pii-transfer`,
    }),
    requireTls,
  };
}

async function connectionTls(pool) {
  const result = await pool.query(
    `SELECT COALESCE(
        (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()),
        FALSE
      ) AS tls`
  );
  return Boolean(result.rows[0]?.tls);
}

async function main() {
  if (!flag('PII_TARGET_TRANSFER_ENABLED', false)) {
    throw new Error('PII_TARGET_TRANSFER_ENABLED=true is required for transfer');
  }

  const sourceConfig = poolFor(process.env.PII_DATABASE_URL, 'PII_SOURCE');
  const targetConfig = poolFor(process.env.PII_TARGET_DATABASE_URL, 'PII_TARGET');
  const source = sourceConfig.pool;
  const target = targetConfig.pool;

  try {
    const [sourceTls, targetTls] = await Promise.all([
      connectionTls(source),
      connectionTls(target),
    ]);
    if (sourceConfig.requireTls && !sourceTls) throw new Error('Source PII connection is not using TLS');
    if (targetConfig.requireTls && !targetTls) throw new Error('Target PII connection is not using TLS');

    const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'pii_schema.sql'), 'utf8');
    await target.query(schemaSql);

    const sourceRows = await source.query(
      `SELECT identity_ref, research_user_id, phone_number, full_name,
              legacy_migrated, created_at, updated_at
         FROM pii_identities
        ORDER BY research_user_id`
    );

    const client = await target.connect();
    try {
      await client.query('BEGIN');
      for (const row of sourceRows.rows) {
        await client.query(
          `INSERT INTO pii_identities
            (identity_ref, research_user_id, phone_number, full_name, legacy_migrated, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (research_user_id) DO UPDATE SET
             identity_ref=EXCLUDED.identity_ref,
             phone_number=EXCLUDED.phone_number,
             full_name=EXCLUDED.full_name,
             legacy_migrated=EXCLUDED.legacy_migrated,
             updated_at=GREATEST(pii_identities.updated_at, EXCLUDED.updated_at)`,
          [
            row.identity_ref,
            row.research_user_id,
            row.phone_number,
            row.full_name,
            row.legacy_migrated,
            row.created_at,
            row.updated_at,
          ]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const targetCount = await target.query('SELECT COUNT(*)::int AS n FROM pii_identities');
    const targetRefs = await target.query(
      'SELECT identity_ref::text FROM pii_identities ORDER BY research_user_id'
    );
    const sourceRefs = sourceRows.rows.map((row) => String(row.identity_ref));
    const migratedRefs = targetRefs.rows.map((row) => String(row.identity_ref));
    const missing = sourceRefs.filter((ref) => !migratedRefs.includes(ref));
    if (missing.length) throw new Error(`Target verification failed: ${missing.length} identity mapping(s) missing`);

    console.log(`PII vault transfer complete: source_rows=${sourceRows.rowCount} target_rows=${Number(targetCount.rows[0]?.n || 0)} source_tls=${sourceTls} target_tls=${targetTls}. Source vault was NOT deleted.`);
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

main().catch((error) => {
  console.error('PII vault transfer failed:', error.message);
  process.exitCode = 1;
});
