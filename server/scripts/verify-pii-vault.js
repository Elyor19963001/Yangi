require('dotenv').config();
const { pool } = require('../src/config/db');
const {
  piiPool,
  externalPiiConfigured,
  piiTlsRequired,
} = require('../src/config/piiDb');

async function main() {
  if (!externalPiiConfigured()) throw new Error('PII_DATABASE_URL is required');

  const sslResult = await piiPool.query(
    `SELECT COALESCE(
        (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()),
        FALSE
      ) AS tls,
      to_regclass('public.pii_identities') IS NOT NULL AS schema_ready`
  );
  const tls = Boolean(sslResult.rows[0]?.tls);
  const schemaReady = Boolean(sslResult.rows[0]?.schema_ready);
  if (!schemaReady) throw new Error('PII vault schema is missing; run npm run db:pii:migrate');
  if (piiTlsRequired() && !tls) throw new Error('PII_REQUIRE_TLS=true, but the active PostgreSQL connection is not using TLS');

  const [piiCountResult, legacyResult] = await Promise.all([
    piiPool.query('SELECT COUNT(*)::int AS n FROM pii_identities'),
    pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE phone_number IS NOT NULL OR full_name IS NOT NULL`),
  ]);

  const residency = String(process.env.PII_DATA_RESIDENCY || '').trim().toUpperCase() || 'UNDECLARED';
  const region = String(process.env.PII_VAULT_REGION || '').trim() || 'UNDECLARED';
  console.log(`PII vault verified: rows=${Number(piiCountResult.rows[0]?.n || 0)} tls=${tls} tls_required=${piiTlsRequired()} residency=${residency} region=${region} legacy_research_pii=${Number(legacyResult.rows[0]?.n || 0)}`);
}

main()
  .catch((error) => {
    console.error('PII vault verification failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    if (piiPool) await piiPool.end();
  });
