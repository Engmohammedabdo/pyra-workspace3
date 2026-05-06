-- =============================================
-- Migration 010: CRM Phase 2 — remap legacy stage_* leads to new stg_* stages
-- PRD ref: CRM-PRD/02-DATABASE-AND-MIGRATION.md crm_003_remap_leads.sql
--          (simplified per Q-DB-002 ANSWER in CRM-PRD/06-OPEN-QUESTIONS.md)
-- Tier: 1 (deterministic, no guessing — preserves originals in legacy_stage_id)
-- Reversible: YES (full rollback at bottom)
--
-- Strategy (Abdou's lock-in):
--   - Move ALL existing leads to stg_new_inquiry
--   - EXCEPT: leads with is_converted=true → stg_closed_won
--   - Sales reps manually re-stage their own leads after launch
--
-- This eliminates the highest-risk migration in the project. There is no
-- mapping discovery, no guessing. Legacy stage_* values are preserved in
-- the new legacy_stage_id column for full rollback safety.
-- =============================================

-- UP

-- Step 1: Add backup column to preserve original stage_id (for rollback)
ALTER TABLE pyra_sales_leads
  ADD COLUMN IF NOT EXISTS legacy_stage_id varchar(50);

UPDATE pyra_sales_leads
SET legacy_stage_id = stage_id
WHERE legacy_stage_id IS NULL;

-- Step 2: Already-converted leads → closed_won
UPDATE pyra_sales_leads
SET stage_id = 'stg_closed_won'
WHERE is_converted = true
  AND (stage_id IS NULL OR stage_id NOT LIKE 'stg_%');

-- Step 3: All other leads → new_inquiry (sales reps will re-stage manually)
UPDATE pyra_sales_leads
SET stage_id = 'stg_new_inquiry'
WHERE (is_converted = false OR is_converted IS NULL)
  AND (stage_id IS NULL OR stage_id NOT LIKE 'stg_%');

-- DOWN (full rollback if ever needed)
-- UPDATE pyra_sales_leads SET stage_id = legacy_stage_id WHERE legacy_stage_id IS NOT NULL;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS legacy_stage_id;
