require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

async function runSqlFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  await pool.query(sql);
  console.log(`Applied ${path.basename(filePath)}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const sqlDir = path.join(__dirname, '..', 'sql');
  await runSqlFile(path.join(sqlDir, 'schema.sql'));

  const migrationsDir = path.join(sqlDir, 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    for (const file of files) await runSqlFile(path.join(migrationsDir, file));
  }

  console.log('Database schema and migrations are up to date.');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
