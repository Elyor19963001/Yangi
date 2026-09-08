require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { piiPool, externalPiiConfigured } = require('../src/config/piiDb');

async function main() {
  if (!externalPiiConfigured()) {
    console.log('PII vault migration skipped: PII_DATABASE_URL is not configured.');
    return;
  }
  const filePath = path.join(__dirname, '..', 'sql', 'pii_schema.sql');
  const sql = fs.readFileSync(filePath, 'utf8');
  await piiPool.query(sql);
  console.log('PII vault schema is up to date.');
}

main()
  .catch((err) => {
    console.error('PII vault migration failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (piiPool) await piiPool.end();
  });
