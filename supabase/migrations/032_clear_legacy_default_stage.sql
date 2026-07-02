-- 032_clear_legacy_default_stage.sql
-- ---------------------------------------------------------------------------
-- Clear the stray is_default flag on legacy stage_* rows.
--
-- The pipeline-stages table carried TWO is_default=true rows: legacy
-- `stage_new` (sort_order 0) AND the canonical CRM `stg_new_inquiry`
-- (sort_order 1). The WhatsApp chat create-lead dialog fetched the legacy
-- stages endpoint and did `.find(is_default)` — which deterministically
-- returned `stage_new`, a stage the CRM pipeline board silently drops (only
-- stg_* columns render). Result: a lead created from chat became invisible on
-- the board / funnel / KPIs.
--
-- The app-side fix repoints the dialog at /api/crm/pipeline-stages (stg_* only)
-- and hardens the legacy POST to coerce non-stg_ stages to stg_new_inquiry.
-- This migration removes the data-level foot-gun so `.find(is_default)` over
-- any full stage list returns exactly one row (stg_new_inquiry).
--
-- Idempotent. Risk tier 2 (touches existing data) — but only flips a boolean
-- flag on legacy rows that no live lead sits on (all 221 leads are on stg_*).
-- ---------------------------------------------------------------------------

UPDATE pyra_sales_pipeline_stages
SET is_default = false
WHERE id LIKE 'stage_%'
  AND is_default = true;

-- Defensive: guarantee the canonical CRM new-inquiry stage is the default.
UPDATE pyra_sales_pipeline_stages
SET is_default = true
WHERE id = 'stg_new_inquiry'
  AND is_default = false;

-- ---------------------------------------------------------------------------
-- -- DOWN (informational only — forward-only migration policy):
-- -- UPDATE pyra_sales_pipeline_stages SET is_default = true WHERE id = 'stage_new';
-- ---------------------------------------------------------------------------
