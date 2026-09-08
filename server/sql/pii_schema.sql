BEGIN;

CREATE TABLE IF NOT EXISTS pii_identities (
  identity_ref UUID PRIMARY KEY,
  research_user_id BIGINT UNIQUE NOT NULL,
  phone_number VARCHAR(13) UNIQUE NOT NULL,
  full_name VARCHAR(120),
  legacy_migrated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pii_access_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  research_user_id BIGINT,
  action_type VARCHAR(80) NOT NULL,
  actor_user_id BIGINT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pii_identities_research_user
  ON pii_identities(research_user_id);
CREATE INDEX IF NOT EXISTS idx_pii_access_time
  ON pii_access_audit(created_at DESC);

COMMIT;
