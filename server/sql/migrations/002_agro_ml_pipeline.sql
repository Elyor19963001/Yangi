BEGIN;

ALTER TABLE agro_field_samples ADD COLUMN IF NOT EXISTS season VARCHAR(20);
ALTER TABLE agro_field_samples ADD COLUMN IF NOT EXISTS feature_status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE agro_field_samples ADD COLUMN IF NOT EXISTS feature_json JSONB;
ALTER TABLE agro_field_samples ADD COLUMN IF NOT EXISTS feature_updated_at TIMESTAMPTZ;

ALTER TABLE agro_model_runs ADD COLUMN IF NOT EXISTS training_samples INT;
ALTER TABLE agro_model_runs ADD COLUMN IF NOT EXISTS classes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE agro_model_runs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE agro_model_runs ADD COLUMN IF NOT EXISTS worker_version VARCHAR(40);

CREATE TABLE IF NOT EXISTS agro_model_artifacts (
  artifact_id BIGSERIAL PRIMARY KEY,
  run_id BIGINT UNIQUE NOT NULL REFERENCES agro_model_runs(run_id) ON DELETE CASCADE,
  model_format VARCHAR(40) NOT NULL DEFAULT 'joblib',
  feature_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_blob BYTEA NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agro_grid_predictions (
  prediction_id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES agro_model_runs(run_id) ON DELETE CASCADE,
  district_id INT REFERENCES districts(district_id),
  crop_name VARCHAR(100) NOT NULL,
  season VARCHAR(20) NOT NULL,
  geometry_geojson JSONB NOT NULL,
  area_ha NUMERIC(14,3) CHECK (area_ha >= 0),
  confidence NUMERIC(4,3) CHECK (confidence BETWEEN 0 AND 1),
  ndvi NUMERIC(5,3) CHECK (ndvi BETWEEN -1 AND 1),
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','published','rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agro_samples_training ON agro_field_samples(district_id, season, verification_status, feature_status);
CREATE INDEX IF NOT EXISTS idx_agro_grid_run_status ON agro_grid_predictions(run_id, verification_status);
CREATE INDEX IF NOT EXISTS idx_agro_grid_district_season ON agro_grid_predictions(district_id, season, verification_status);

COMMIT;
