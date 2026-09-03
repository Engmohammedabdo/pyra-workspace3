-- ────────────────────────────────────────────────────────────────────────────
-- Migration 064 — Campaign progress view
--
-- Phase:        lead-reactivation programme (2026-09-03)
-- Author:       claude
-- Date:         2026-09-03
-- Reversible:   YES (DROP VIEW — see DOWN)
-- Touches data: NO (read-only view over existing rows)
-- Risk tier:    1 (additive, no data written)
--
-- Purpose:
--   Migration 063 gave the sender the ability to end a contact in states the
--   dashboard has never heard of — `skipped` (on the suppression list),
--   `invalid` (no WhatsApp account) and `failed` — alongside `pending` and
--   `sent`. The campaigns page shows only `sent_count`, so a run where every
--   contact was skipped looks identical to a run that has not started. An
--   operator cannot tell "it sent nothing because they all opted out" from
--   "it sent nothing because it is stuck".
--
--   This view is the per-campaign breakdown behind that answer. It exists as
--   a VIEW rather than N count() round-trips because user-facing counts must
--   come from a database aggregate: PostgREST silently caps a plain select at
--   1000 rows, so counting contacts in JavaScript would quietly under-report
--   any campaign past its thousandth contact.
--
-- Access:
--   Service-role only, matching the Gap #3 doctrine used for pyra_agent_calls.
--   The API route already gates on `sales_whatsapp.view` and then reads with
--   the service role, so nothing needs the `authenticated` grant. Views are
--   security-DEFINER by default in Postgres, which makes an accidental
--   `authenticated` grant an RLS bypass — hence the explicit REVOKE.
--
-- Pre-flight checklist (per docs/MIGRATIONS.md §4):
--   [x] `pnpm db:check-drift` clean before writing (63 tracked)
--   [x] `pnpm db:backup pre-064` — blocked by the standing missing
--       SUPABASE_DB_URL. Proceeded: this migration writes no data and creates
--       no column; dropping the view restores the prior state exactly.
--   [x] CREATE OR REPLACE is inherently idempotent
--   [x] Verification queries ready (see below)
-- ────────────────────────────────────────────────────────────────────────────


-- ─── UP ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW pyra_whatsapp_campaign_progress AS
SELECT
  campaign_id,
  count(*)                                            AS total,
  count(*) FILTER (WHERE status = 'pending')          AS pending,
  count(*) FILTER (WHERE status = 'sent')             AS sent,
  count(*) FILTER (WHERE status = 'skipped')          AS skipped,
  count(*) FILTER (WHERE status = 'invalid')          AS invalid,
  count(*) FILTER (WHERE status = 'failed')           AS failed,
  count(*) FILTER (WHERE replied_at IS NOT NULL)      AS replied,
  max(sent_at)                                        AS last_sent_at
FROM pyra_whatsapp_campaign_contacts
GROUP BY campaign_id;

COMMENT ON VIEW pyra_whatsapp_campaign_progress IS
  'Per-campaign contact breakdown for the campaigns dashboard. Service-role only. skipped = on the suppression list; invalid = the number has no WhatsApp account; failed = Evolution rejected the send.';

-- Service-role only. Never grant to `authenticated`: a security-definer view
-- over a table that role cannot read is an RLS bypass.
REVOKE ALL ON pyra_whatsapp_campaign_progress FROM PUBLIC;
REVOKE ALL ON pyra_whatsapp_campaign_progress FROM anon;
REVOKE ALL ON pyra_whatsapp_campaign_progress FROM authenticated;


-- ─── VERIFICATION (run manually after apply) ───────────────────────────────

-- 1. The view exists and returns a row per campaign that has contacts:
--   SELECT * FROM pyra_whatsapp_campaign_progress ORDER BY campaign_id;
--   -- expect 0 rows today (no campaign has ever been created)
--
-- 2. The columns are the five terminal states plus pending:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'pyra_whatsapp_campaign_progress' ORDER BY ordinal_position;
--
-- 3. `authenticated` cannot read it (expect permission denied):
--   SET ROLE authenticated;
--   SELECT * FROM pyra_whatsapp_campaign_progress;
--   RESET ROLE;


-- ─── DOWN (informational — NOT executed by any tool) ───────────────────────

-- Forward-only. To revert, write a new migration containing:
-- -- DROP VIEW IF EXISTS pyra_whatsapp_campaign_progress;
