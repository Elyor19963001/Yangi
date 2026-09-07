BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='users_role_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('user','operator','researcher','admin'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_role_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  old_role VARCHAR(20),
  new_role VARCHAR(20) NOT NULL,
  changed_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  reason VARCHAR(300),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_user_role_audit_user ON user_role_audit(user_id, changed_at DESC);

-- One-time safe bootstrap for an existing pilot installation: if there is no admin yet,
-- promote only the earliest verified account (or earliest account if none is verified).
UPDATE users
   SET role='admin', updated_at=NOW()
 WHERE user_id = (
   SELECT user_id
     FROM users
    ORDER BY is_verified DESC, registration_date ASC, user_id ASC
    LIMIT 1
 )
   AND NOT EXISTS (SELECT 1 FROM users WHERE role='admin');

COMMIT;
