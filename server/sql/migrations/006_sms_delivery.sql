BEGIN;

ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS provider VARCHAR(30);
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(40);
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_otp_codes_provider_message_id
  ON otp_codes(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sms_delivery_log (
  sms_delivery_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  purpose VARCHAR(30) NOT NULL DEFAULT 'otp',
  provider VARCHAR(30) NOT NULL,
  provider_message_id VARCHAR(40) UNIQUE NOT NULL,
  status VARCHAR(40) NOT NULL,
  description VARCHAR(500),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_delivery_log_user_sent
  ON sms_delivery_log(user_id, sent_at DESC);

COMMIT;
