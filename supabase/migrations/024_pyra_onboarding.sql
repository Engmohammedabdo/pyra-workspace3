-- =============================================================
-- Migration 024: Employee Onboarding (Phase 1)
-- =============================================================
-- Adds the onboarding workflow tables + the 3 generated-document types.
-- Risk tier: 1 (additive — new tables + idempotent doc-type seeds).
-- Forward-only (Phase 14.2).
-- =============================================================

CREATE TABLE IF NOT EXISTS pyra_onboarding (
  id varchar(24) PRIMARY KEY,
  employee_username varchar NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'in_progress',
  offer_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_by varchar NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  notes text
);
CREATE INDEX IF NOT EXISTS idx_onboarding_employee ON pyra_onboarding(employee_username);
CREATE INDEX IF NOT EXISTS idx_onboarding_status ON pyra_onboarding(status);

CREATE TABLE IF NOT EXISTS pyra_onboarding_tasks (
  id varchar(24) PRIMARY KEY,
  onboarding_id varchar(24) NOT NULL REFERENCES pyra_onboarding(id) ON DELETE CASCADE,
  title_ar text NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  done_by varchar,
  sort_order int NOT NULL DEFAULT 0,
  notes text
);
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_onb ON pyra_onboarding_tasks(onboarding_id);

INSERT INTO pyra_document_types (id, name, name_ar, requires_expiry, is_active, sort_order)
VALUES
  ('dt_offer_letter', 'Offer Letter', 'عرض عمل', false, true, 10),
  ('dt_nda', 'NDA', 'اتفاقية سرية', false, true, 11),
  ('dt_asset_handover', 'Asset Handover', 'نموذج تسليم عهدة', false, true, 12)
ON CONFLICT (id) DO NOTHING;

-- -- DOWN (informational only):
-- -- DROP TABLE IF EXISTS pyra_onboarding_tasks; DROP TABLE IF EXISTS pyra_onboarding;
-- -- DELETE FROM pyra_document_types WHERE id IN ('dt_offer_letter','dt_nda','dt_asset_handover');
