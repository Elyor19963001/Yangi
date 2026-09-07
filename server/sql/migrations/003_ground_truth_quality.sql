BEGIN;

ALTER TABLE agro_field_samples ADD COLUMN IF NOT EXISTS area_ha NUMERIC(14,3);
ALTER TABLE agro_field_samples ADD COLUMN IF NOT EXISTS source_method VARCHAR(30) NOT NULL DEFAULT 'map_digitized';
ALTER TABLE agro_field_samples ADD COLUMN IF NOT EXISTS gps_accuracy_m NUMERIC(10,2);
ALTER TABLE agro_field_samples ADD COLUMN IF NOT EXISTS verification_notes VARCHAR(700);
ALTER TABLE agro_field_samples ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_agro_samples_crop_quality
  ON agro_field_samples(district_id, season, crop_name, verification_status, feature_status);

COMMIT;
