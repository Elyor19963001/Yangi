require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (process.env.SEED_DEMO !== 'true') {
    console.log('SEED_DEMO is not true; demo seed skipped.');
    return;
  }
  const seed = fs.readFileSync(path.join(__dirname, '..', 'sql', 'demo_seed.sql'), 'utf8');
  await pool.query(seed);
  console.log('Demo seed applied.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
