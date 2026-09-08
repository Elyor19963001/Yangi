const { Pool } = require('pg');

const externalPiiConfigured = () => Boolean(String(process.env.PII_DATABASE_URL || '').trim());

const piiPool = externalPiiConfigured()
  ? new Pool({
      connectionString: process.env.PII_DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      application_name: 'phd-pii-vault',
    })
  : null;

function piiMode() {
  return externalPiiConfigured() ? 'external' : 'embedded-dev';
}

module.exports = { piiPool, piiMode, externalPiiConfigured };
