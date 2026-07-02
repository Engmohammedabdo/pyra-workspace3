-- ────────────────────────────────────────────────────────────────────────────
-- Migration 030 — Lead soft-archive (CRM audit remediation, Batch 4)
--
-- Adds a soft-archive flag to pyra_sales_leads so the CRM `leads.delete`
-- permission has a real feature behind it (previously the permission was
-- defined + grantable but no route implemented it, and useArchiveLead's DELETE
-- 405'd). Archived leads are hidden from the pipeline / list by default
-- (GET /api/crm/leads filters archived_at IS NULL) but remain reachable by
-- direct URL so they can be viewed and un-archived.
--
-- Idempotent (IF NOT EXISTS). Risk tier 1 (additive, nullable, no backfill).
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE pyra_sales_leads ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;
ALTER TABLE pyra_sales_leads ADD COLUMN IF NOT EXISTS archived_by varchar NULL;
CREATE INDEX IF NOT EXISTS idx_pyra_sales_leads_archived_at ON pyra_sales_leads (archived_at);

-- -- DOWN (informational only — forward-only migration system):
-- -- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS archived_at;
-- -- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS archived_by;
-- -- DROP INDEX IF EXISTS idx_pyra_sales_leads_archived_at;
