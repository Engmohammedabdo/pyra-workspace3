-- =============================================
-- Migration 008: CRM Phase 1 — link pyra_contracts to pyra_sales_leads
-- PRD ref: CRM-PRD/02-DATABASE-AND-MIGRATION.md crm_004_link_contracts_to_leads.sql
-- Tier: 1 (additive — nullable column + safe backfill)
-- Reversible: YES
-- Notes:
--   - lead_id is NULLABLE; legacy contracts whose clients never had a lead
--     stay unlinked (expected — see PRD § Phase 5).
--   - ON DELETE SET NULL: deleting a lead never cascade-deletes contracts.
--     Contracts are financial records and must persist.
--   - Backfill only sets lead_id for converted leads (is_converted=true).
--     At baseline 0 leads are converted, so backfill is a no-op now;
--     left in for future runs / re-runs.
-- =============================================

-- UP
ALTER TABLE pyra_contracts
  ADD COLUMN IF NOT EXISTS lead_id varchar
    REFERENCES pyra_sales_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_lead ON pyra_contracts(lead_id);

UPDATE pyra_contracts c
SET lead_id = l.id
FROM pyra_sales_leads l
WHERE c.client_id = l.client_id
  AND l.is_converted = true
  AND c.lead_id IS NULL;

-- DOWN
-- ALTER TABLE pyra_contracts DROP CONSTRAINT IF EXISTS pyra_contracts_lead_id_fkey;
-- ALTER TABLE pyra_contracts DROP COLUMN IF EXISTS lead_id;
-- DROP INDEX IF EXISTS idx_contracts_lead;
