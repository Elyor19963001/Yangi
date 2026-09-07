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

CREATE INDEX IF NOT EXISTS idx_activity_study_time ON user_activity(study_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_feature_time ON user_activity(feature, timestamp);
CREATE INDEX IF NOT EXISTS idx_prices_date ON prices(price_date DESC);
CREATE INDEX IF NOT EXISTS idx_listings_status_created ON listings(status, created_at DESC);

COMMIT;
