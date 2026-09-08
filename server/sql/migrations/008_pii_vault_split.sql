BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS identity_ref UUID,
  ADD COLUMN IF NOT EXISTS pii_migrated_at TIMESTAMPTZ;

ALTER TABLE users ALTER COLUMN phone_number DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_identity_ref
  ON users(identity_ref)
  WHERE identity_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_pii_migration
  ON users(pii_migrated_at)
  WHERE pii_migrated_at IS NULL;

COMMIT;
