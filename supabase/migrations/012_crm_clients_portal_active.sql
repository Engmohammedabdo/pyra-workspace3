-- ============================================================
-- 012_crm_clients_portal_active.sql
-- ============================================================
-- Phase 9 prep — adds the `portal_active` flag on pyra_clients so the
-- Active Customer Page's "Portal Access" toggle has somewhere to write
-- without creating/destroying the row each time (per Q9-2 decision δ).
--
-- Rationale:
--   The Phase 9 PRD §05 line 369 calls for a "Portal Access toggle (calls
--   a new tiny endpoint to set/unset pyra_clients linkage)". A naive
--   implementation creates/destroys the pyra_clients row, but that
--   conflicts with the convert-to-customer endpoint (PRD §03 line 349)
--   which is also documented to CREATE the row. Splitting the concerns
--   keeps history intact:
--     - convert-to-customer  → CREATE pyra_clients row + set portal_active per request body
--     - portal-access toggle → flip pyra_clients.portal_active ONLY (no row create/destroy)
--
-- Backward compat:
--   - Default true keeps every existing client portal-active by default
--     (no behavioural change for converted-and-already-onboarded clients).
--   - Portal middleware (lib/portal/auth.ts) will gate login on this flag
--     in a follow-up code change inside this same Phase 9 step (commit 2).
--
-- Idempotent — safe to re-run.

ALTER TABLE pyra_clients
  ADD COLUMN IF NOT EXISTS portal_active BOOLEAN NOT NULL DEFAULT true;

-- Partial index — only index rows that are portal-active. Most queries
-- (login, portal listing) filter `WHERE portal_active = true`, so the
-- partial form is tighter on disk + faster to scan.
CREATE INDEX IF NOT EXISTS idx_clients_portal_active
  ON pyra_clients(portal_active)
  WHERE portal_active = true;

-- ============================================================
-- Verification (run after migration):
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'pyra_clients' AND column_name = 'portal_active';
-- Expected: { column_name: 'portal_active', data_type: 'boolean',
--             is_nullable: 'NO', column_default: 'true' }
-- ============================================================
