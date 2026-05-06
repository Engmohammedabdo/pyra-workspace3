-- =============================================
-- Migration 006: CRM Phase 1 — extend pyra_sales_leads
-- PRD ref: CRM-PRD/02-DATABASE-AND-MIGRATION.md crm_001_extend_sales_leads.sql
-- Tier: 1 (additive only — IF NOT EXISTS, defaults applied)
-- Reversible: YES (DOWN section at bottom)
-- =============================================

-- UP
ALTER TABLE pyra_sales_leads
  ADD COLUMN IF NOT EXISTS lead_type varchar(10) DEFAULT 'b2b'
    CHECK (lead_type IN ('b2b', 'b2c')),
  ADD COLUMN IF NOT EXISTS industry varchar(100),
  ADD COLUMN IF NOT EXISTS deal_type varchar(50),
  -- deal_type values (enforced in app, not DB):
  --   web_design | social_media_retainer | branding | payer_ai
  --   video_production | performance_ads | hybrid_package | other
  ADD COLUMN IF NOT EXISTS expected_value numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_value_currency varchar(3) DEFAULT 'AED',
  ADD COLUMN IF NOT EXISTS billing_cycle varchar(20) DEFAULT 'one_time',
  -- billing_cycle: one_time | monthly | quarterly | annual
  ADD COLUMN IF NOT EXISTS win_probability integer DEFAULT 0
    CHECK (win_probability >= 0 AND win_probability <= 100),
  -- Per Q-BIZ-001: hybrid model — auto-default by stage, override allowed.
  ADD COLUMN IF NOT EXISTS win_probability_overridden boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS lost_reason text,
  ADD COLUMN IF NOT EXISTS contact_person varchar(200),
  ADD COLUMN IF NOT EXISTS contact_role varchar(100),
  ADD COLUMN IF NOT EXISTS company_size varchar(50),
  ADD COLUMN IF NOT EXISTS decision_maker varchar(200),
  ADD COLUMN IF NOT EXISTS budget_range varchar(100),
  ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_leads_lead_type      ON pyra_sales_leads(lead_type);
CREATE INDEX IF NOT EXISTS idx_leads_deal_type      ON pyra_sales_leads(deal_type);
CREATE INDEX IF NOT EXISTS idx_leads_converted      ON pyra_sales_leads(is_converted, stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_stage ON pyra_sales_leads(assigned_to, stage_id);

-- DOWN (rollback — only if Phase 1 must be reverted)
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS lead_type;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS industry;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS deal_type;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS expected_value;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS expected_value_currency;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS billing_cycle;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS win_probability;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS win_probability_overridden;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS lost_reason;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS contact_person;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS contact_role;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS company_size;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS decision_maker;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS budget_range;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS custom_fields;
-- DROP INDEX IF EXISTS idx_leads_lead_type;
-- DROP INDEX IF EXISTS idx_leads_deal_type;
-- DROP INDEX IF EXISTS idx_leads_converted;
-- DROP INDEX IF EXISTS idx_leads_assigned_stage;
