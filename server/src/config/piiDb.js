const { Pool } = require('pg');

function flag(name, defaultValue = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

const piiDatabaseUrl = String(process.env.PII_DATABASE_URL || '').trim();
const externalPiiConfigured = () => Boolean(piiDatabaseUrl);
const urlDeclaresSsl = /(?:\?|&)sslmode=(?:require|verify-ca|verify-full)(?:&|$)/i.test(piiDatabaseUrl);
const piiTlsRequired = () => flag('PII_REQUIRE_TLS', false) || urlDeclaresSsl;

function tlsOptions() {
  if (!piiTlsRequired() || urlDeclaresSsl) return undefined;
  const rejectUnauthorized = flag('PII_TLS_REJECT_UNAUTHORIZED', true);
  const caBase64 = String(process.env.PII_TLS_CA_BASE64 || '').trim();
  const ssl = { rejectUnauthorized };
  if (caBase64) ssl.ca = Buffer.from(caBase64, 'base64').toString('utf8');
  return ssl;
}

const piiPool = externalPiiConfigured()
  ? new Pool({
      connectionString: piiDatabaseUrl,
      ssl: tlsOptions(),
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      keepAlive: true,
      application_name: 'phd-pii-vault',
    })
  : null;

function piiMode() {
  return externalPiiConfigured() ? 'external' : 'embedded-dev';
}

module.exports = {
  piiPool,
  piiMode,
  piiTlsRequired,
  externalPiiConfigured,
};
