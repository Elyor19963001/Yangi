BEGIN;

ALTER TABLE otp_codes
  ADD COLUMN IF NOT EXISTS attempt_count SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE otp_codes
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_otp_codes_user_created
  ON otp_codes (user_id, created_at DESC);

COMMIT;
