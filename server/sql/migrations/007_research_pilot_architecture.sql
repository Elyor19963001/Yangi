BEGIN;

ALTER TABLE study_participants
  ADD COLUMN IF NOT EXISTS pilot_status VARCHAR(24) NOT NULL DEFAULT 'screened',
  ADD COLUMN IF NOT EXISTS pilot_cohort VARCHAR(40),
  ADD COLUMN IF NOT EXISTS assignment_group VARCHAR(20),
  ADD COLUMN IF NOT EXISTS assignment_source VARCHAR(40),
  ADD COLUMN IF NOT EXISTS assignment_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eligible_for_analysis BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS data_quality_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS withdrawal_reason VARCHAR(300),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'study_participants_pilot_status_check') THEN
    ALTER TABLE study_participants ADD CONSTRAINT study_participants_pilot_status_check
      CHECK (pilot_status IN ('screened','eligible','enrolled','randomized','active','completed','withdrawn','excluded'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'study_participants_assignment_group_check') THEN
    ALTER TABLE study_participants ADD CONSTRAINT study_participants_assignment_group_check
      CHECK (assignment_group IS NULL OR assignment_group IN ('control','treatment'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'study_participants_assignment_source_check') THEN
    ALTER TABLE study_participants ADD CONSTRAINT study_participants_assignment_source_check
      CHECK (assignment_source IS NULL OR assignment_source IN ('external_randomization','legacy_import'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'study_participants_data_quality_status_check') THEN
    ALTER TABLE study_participants ADD CONSTRAINT study_participants_data_quality_status_check
      CHECK (data_quality_status IN ('pending','reviewed','clean','flagged','excluded'));
  END IF;
END $$;

ALTER TABLE survey_responses
  ADD COLUMN IF NOT EXISTS record_origin VARCHAR(16) NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS dataset_status VARCHAR(20) NOT NULL DEFAULT 'eligible';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_responses_record_origin_check') THEN
    ALTER TABLE survey_responses ADD CONSTRAINT survey_responses_record_origin_check
      CHECK (record_origin IN ('legacy','demo','pilot'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_responses_dataset_status_check') THEN
    ALTER TABLE survey_responses ADD CONSTRAINT survey_responses_dataset_status_check
      CHECK (dataset_status IN ('eligible','review','excluded'));
  END IF;
END $$;

-- Demo/legacy va real pilot bir xil study_id + wave bo‘yicha bir-birini bosib ketmasin.
ALTER TABLE survey_responses DROP CONSTRAINT IF EXISTS survey_responses_study_id_wave_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_study_wave_origin
  ON survey_responses(study_id, wave, record_origin);

ALTER TABLE user_activity
  ADD COLUMN IF NOT EXISTS record_origin VARCHAR(16) NOT NULL DEFAULT 'legacy';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_activity_record_origin_check') THEN
    ALTER TABLE user_activity ADD CONSTRAINT user_activity_record_origin_check
      CHECK (record_origin IN ('legacy','demo','pilot'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS research_audit_log (
  audit_id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  study_id UUID,
  action_type VARCHAR(80) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_participants_pilot_status
  ON study_participants(pilot_status, assignment_group, eligible_for_analysis);
CREATE INDEX IF NOT EXISTS idx_survey_origin_wave
  ON survey_responses(record_origin, wave, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_origin_time
  ON user_activity(record_origin, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_research_audit_study_time
  ON research_audit_log(study_id, created_at DESC);

CREATE OR REPLACE VIEW research_panel_pseudonymous AS
SELECT
  sp.study_id,
  sp.pilot_status,
  sp.pilot_cohort,
  sp.assignment_group,
  sp.assignment_source,
  sp.assignment_at,
  sp.eligible_for_analysis,
  sp.data_quality_status,
  sp.consent_research,
  sp.research_consented_at,
  sp.consent_withdrawn_at,
  sr.response_id,
  sr.wave,
  sr.record_origin,
  sr.dataset_status,
  sr.district_id,
  sr.age_group,
  sr.gender,
  sr.education_level,
  sr.household_size,
  sr.employment_status,
  sr.monthly_household_income_uzs,
  sr.internet_access,
  sr.internet_type,
  sr.monthly_internet_cost_uzs,
  sr.internet_quality,
  sr.smartphone_access,
  sr.computer_access,
  sr.digital_skills,
  sr.egov_use,
  sr.digital_payment_use,
  sr.ecommerce_use,
  sr.online_selling_use,
  sr.price_knowledge,
  sr.financial_services_use,
  sr.platform_usage_frequency,
  sr.nps,
  sr.submitted_at,
  sr.updated_at
FROM study_participants sp
LEFT JOIN survey_responses sr ON sr.study_id = sp.study_id;

COMMIT;
