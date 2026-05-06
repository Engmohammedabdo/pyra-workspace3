-- =============================================
-- Migration 011: CRM catch-up remap
-- Tier: 2 (touches existing data) — explicit approval received 2026-05-06.
-- Reversible: YES via legacy_stage_id (same pattern as migration 010).
--
-- Why this exists:
--   Migration 010 moved the original 21 leads to stg_new_inquiry. Between
--   then and now (the Phase 1-6 build window), Sayed created 5 more leads
--   via the LEGACY /dashboard/sales/leads module — those came in with the
--   old stage_* taxonomy. This catch-up brings them into stg_* so they
--   show up on the new CRM pipeline at deploy time.
--
--   Same logic as migration 010, applied idempotently. Going forward, the
--   drift will keep happening as long as the legacy module is live —
--   Phase 12 (sunset old /dashboard/sales/* surfaces) is the durable fix.
-- =============================================

-- UP

-- Step 1: snapshot any leftover legacy stage_id into legacy_stage_id
UPDATE pyra_sales_leads
SET legacy_stage_id = stage_id
WHERE legacy_stage_id IS NULL
  AND stage_id LIKE 'stage_%';

-- Step 2: pending leads with a legacy stage_id → stg_new_inquiry
UPDATE pyra_sales_leads
SET stage_id = 'stg_new_inquiry'
WHERE (is_converted = false OR is_converted IS NULL)
  AND stage_id NOT LIKE 'stg_%';

-- Step 3: defensive — already-converted leads with legacy stage_id → stg_closed_won
UPDATE pyra_sales_leads
SET stage_id = 'stg_closed_won'
WHERE is_converted = true
  AND stage_id NOT LIKE 'stg_%';

-- DOWN
-- UPDATE pyra_sales_leads SET stage_id = legacy_stage_id WHERE legacy_stage_id IS NOT NULL;
