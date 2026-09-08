require('dotenv').config();
const crypto = require('crypto');
const { pool } = require('../src/config/db');
const { piiPool, externalPiiConfigured } = require('../src/config/piiDb');

function enabled(name) {
  return String(process.env[name] || '').toLowerCase() === 'true';
}

async function main() {
  if (!externalPiiConfigured()) {
    console.log('PII backfill skipped: PII_DATABASE_URL is not configured.');
    return;
  }
  if (!enabled('PII_BACKFILL_ENABLED')) {
    console.log('PII backfill skipped: PII_BACKFILL_ENABLED is not true.');
    return;
  }

  const source = await pool.query(
    `SELECT user_id, identity_ref, phone_number, full_name
       FROM users
      WHERE phone_number IS NOT NULL OR full_name IS NOT NULL
      ORDER BY user_id`
  );

  let migrated = 0;
  for (const row of source.rows) {
    if (!row.phone_number) {
      throw new Error(`Legacy user ${row.user_id} has full_name but no phone_number; manual review required before scrub.`);
    }
    const identityRef = row.identity_ref || crypto.randomUUID();

    const existing = await piiPool.query(
      `SELECT identity_ref, research_user_id
         FROM pii_identities
        WHERE phone_number=$1 OR research_user_id=$2`,
      [row.phone_number, row.user_id]
    );

    if (existing.rowCount) {
      const mapped = existing.rows[0];
      if (Number(mapped.research_user_id) !== Number(row.user_id)) {
        throw new Error(`PII mapping conflict for research user ${row.user_id}`);
      }
      await piiPool.query(
        `UPDATE pii_identities
            SET full_name=COALESCE($1,full_name), legacy_migrated=TRUE, updated_at=NOW()
          WHERE research_user_id=$2`,
        [row.full_name || null, row.user_id]
      );
    } else {
      await piiPool.query(
        `INSERT INTO pii_identities
          (identity_ref, research_user_id, phone_number, full_name, legacy_migrated, created_at, updated_at)
         VALUES ($1,$2,$3,$4,TRUE,NOW(),NOW())`,
        [identityRef, row.user_id, row.phone_number, row.full_name || null]
      );
    }

    await pool.query(
      `UPDATE users
          SET identity_ref=$1,
              phone_number=NULL,
              full_name=NULL,
              pii_migrated_at=NOW(),
              updated_at=NOW()
        WHERE user_id=$2`,
      [identityRef, row.user_id]
    );
    migrated += 1;
  }

  console.log(`PII backfill complete. Migrated and scrubbed ${migrated} user record(s).`);
}

main()
  .catch((err) => {
    console.error('PII backfill failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    if (piiPool) await piiPool.end();
  });
