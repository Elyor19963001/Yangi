BEGIN;

CREATE TABLE IF NOT EXISTS districts (
  district_id SERIAL PRIMARY KEY,
  name VARCHAR(120) UNIQUE NOT NULL,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  is_rural_target BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS users (
  user_id BIGSERIAL PRIMARY KEY,
  phone_number VARCHAR(13) UNIQUE NOT NULL,
  full_name VARCHAR(120),
  district_id INT REFERENCES districts(district_id),
  registration_date TIMESTAMPTZ DEFAULT NOW(),
  is_verified BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS study_participants (
  participant_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  study_id UUID UNIQUE NOT NULL,
  consent_version VARCHAR(30) NOT NULL,
  consent_analytics BOOLEAN DEFAULT FALSE,
  consented_at TIMESTAMPTZ,
  baseline_link_code VARCHAR(80),
  notes TEXT
);

ALTER TABLE study_participants ADD COLUMN IF NOT EXISTS consent_research BOOLEAN DEFAULT FALSE;
ALTER TABLE study_participants ADD COLUMN IF NOT EXISTS research_consent_version VARCHAR(30);
ALTER TABLE study_participants ADD COLUMN IF NOT EXISTS research_consented_at TIMESTAMPTZ;
ALTER TABLE study_participants ADD COLUMN IF NOT EXISTS consent_withdrawn_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS consent_records (
  consent_record_id BIGSERIAL PRIMARY KEY,
  study_id UUID NOT NULL REFERENCES study_participants(study_id) ON DELETE CASCADE,
  consent_scope VARCHAR(40) NOT NULL CHECK (consent_scope IN ('research','analytics')),
  consent_version VARCHAR(30) NOT NULL,
  accepted BOOLEAN NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_responses (
  response_id BIGSERIAL PRIMARY KEY,
  study_id UUID NOT NULL REFERENCES study_participants(study_id) ON DELETE CASCADE,
  wave VARCHAR(20) NOT NULL CHECK (wave IN ('baseline','midline','endline')),
  district_id INT REFERENCES districts(district_id),
  age_group VARCHAR(20),
  gender VARCHAR(30),
  education_level VARCHAR(60),
  household_size INT CHECK (household_size BETWEEN 1 AND 30),
  employment_status VARCHAR(60),
  monthly_household_income_uzs NUMERIC(14,2) CHECK (monthly_household_income_uzs >= 0),
  internet_access BOOLEAN,
  internet_type VARCHAR(60),
  monthly_internet_cost_uzs NUMERIC(12,2) CHECK (monthly_internet_cost_uzs >= 0),
  internet_quality SMALLINT CHECK (internet_quality BETWEEN 1 AND 5),
  smartphone_access BOOLEAN,
  computer_access BOOLEAN,
  digital_skills SMALLINT CHECK (digital_skills BETWEEN 1 AND 5),
  egov_use BOOLEAN,
  digital_payment_use BOOLEAN,
  ecommerce_use BOOLEAN,
  online_selling_use BOOLEAN,
  price_knowledge SMALLINT CHECK (price_knowledge BETWEEN 0 AND 10),
  financial_services_use BOOLEAN,
  platform_usage_frequency SMALLINT CHECK (platform_usage_frequency BETWEEN 0 AND 30),
  nps SMALLINT CHECK (nps BETWEEN 0 AND 10),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(study_id, wave)
);

CREATE TABLE IF NOT EXISTS otp_codes (
  otp_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  product_id SERIAL PRIMARY KEY,
  name VARCHAR(120) UNIQUE NOT NULL,
  category VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS markets (
  market_id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  district_id INT REFERENCES districts(district_id),
  UNIQUE(name, district_id)
);

CREATE TABLE IF NOT EXISTS prices (
  price_id BIGSERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(product_id),
  market_id INT NOT NULL REFERENCES markets(market_id),
  district_id INT REFERENCES districts(district_id),
  price NUMERIC(14,2) NOT NULL CHECK (price >= 0),
  unit VARCHAR(30),
  price_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, market_id, price_date)
);

CREATE TABLE IF NOT EXISTS listings (
  listing_id BIGSERIAL PRIMARY KEY,
  seller_id BIGINT NOT NULL REFERENCES users(user_id),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  price NUMERIC(14,2) NOT NULL CHECK (price >= 0),
  quantity NUMERIC(14,3),
  unit VARCHAR(30),
  image_url VARCHAR(600),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','deleted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS government_programs (
  program_id SERIAL PRIMARY KEY,
  title VARCHAR(250) NOT NULL,
  program_type VARCHAR(80),
  summary TEXT,
  eligibility TEXT,
  source_url VARCHAR(800),
  valid_from DATE,
  valid_to DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_activity (
  activity_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  study_id UUID,
  action_type VARCHAR(80) NOT NULL,
  feature VARCHAR(80),
  metadata JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_spaces (
  space_id BIGSERIAL PRIMARY KEY,
  space_type VARCHAR(20) NOT NULL CHECK (space_type IN ('group','channel')),
  visibility VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500),
  avatar_emoji VARCHAR(16) DEFAULT '💬',
  district_id INT REFERENCES districts(district_id),
  created_by BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  invite_code VARCHAR(64) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_members (
  space_id BIGINT NOT NULL REFERENCES chat_spaces(space_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  is_muted BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (space_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  message_id BIGSERIAL PRIMARY KEY,
  space_id BIGINT NOT NULL REFERENCES chat_spaces(space_id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  reply_to_message_id BIGINT REFERENCES chat_messages(message_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS chat_price_signals (
  signal_id BIGSERIAL PRIMARY KEY,
  message_id BIGINT UNIQUE NOT NULL REFERENCES chat_messages(message_id) ON DELETE CASCADE,
  space_id BIGINT NOT NULL REFERENCES chat_spaces(space_id) ON DELETE CASCADE,
  product_id INT REFERENCES products(product_id),
  product_text VARCHAR(120),
  price_min NUMERIC(14,2) NOT NULL CHECK (price_min >= 0),
  price_max NUMERIC(14,2) CHECK (price_max >= 0),
  unit VARCHAR(30),
  market_text VARCHAR(160),
  district_id INT REFERENCES districts(district_id),
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (confidence BETWEEN 0 AND 1),
  status VARCHAR(20) NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified','verified','rejected')),
  extracted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_study_time ON user_activity(study_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_feature_time ON user_activity(feature, timestamp);
CREATE INDEX IF NOT EXISTS idx_prices_date ON prices(price_date DESC);
CREATE INDEX IF NOT EXISTS idx_listings_status_created ON listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_survey_wave ON survey_responses(wave, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_study ON consent_records(study_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_spaces_type_visibility ON chat_spaces(space_type, visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_space_time ON chat_messages(space_id, message_id DESC);
CREATE INDEX IF NOT EXISTS idx_chat_price_signals_space_time ON chat_price_signals(space_id, extracted_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_price_signals_product ON chat_price_signals(product_id, extracted_at DESC);

COMMIT;
