-- ────────────────────────────────────────────────────────────────────────────
-- Migration 059 — Revoke pyra_users writes from `authenticated`
--
-- Phase:        Audit Gap #3 — write-side hardening (2026-08-08)
-- Author:       elharm
-- Date:         2026-08-08
-- Reversible:   YES (re-GRANT hints inline in DOWN)
-- Touches data: NO (privilege change only — no rows read or written)
-- Risk tier:    2 (changes production access — see ORDERING below)
--
-- Purpose:
--   pyra_users has RLS OFF and grants `authenticated` full DML. Any logged-in
--   account (4 staff + 3 client contacts) can therefore hit the public
--   PostgREST API directly and (a) read every salary/bank_details/national_id
--   and (b) UPDATE their own `role` to 'admin' — full self-promotion, with no
--   trace in the app's audit log. Proven live 2026-08-08 from a plain
--   sales-role session (scripts/_exploit-probe.ts).
--
--   This migration closes the WRITE half — self-promotion and salary/role
--   tampering — by revoking INSERT/UPDATE/DELETE/TRUNCATE from `authenticated`.
--   SELECT is deliberately LEFT in place here: getApiAuth()/login and the
--   profile page still read pyra_users through the user session, and revoking
--   SELECT would 500 the whole app. Closing the READ half (attack A) is the
--   larger Gap #3 read-migration project, tracked separately.
--
--   service_role KEEPS full DML (it bypasses these grants), so every app write
--   path continues to work — but ONLY after the accompanying code change ships:
--   all pyra_users writes were moved to createServiceRoleClient() in
--   profile / profile-avatar / two-factor / roles-[id] / users-[username].
--
-- ⚠️ ORDERING — DEPLOY THE CODE FIRST, THEN RUN THIS ⚠️
--   The database is shared production. If this REVOKE runs while the OLD code
--   (user-session writes) is still live, profile edits, user management, role
--   deletion and 2FA break immediately. The code that routes those writes
--   through service_role MUST be deployed (pushed to main → Coolify) and
--   confirmed live BEFORE this migration is applied. Never the reverse.
--
-- Idempotency contract:
--   REVOKE is naturally idempotent — re-running on an already-revoked table is
--   a no-op and never errors.
--
-- Pre-flight checklist (per docs/MIGRATIONS.md §4):
--   [x] Accompanying code deployed and verified live
--   [x] `pnpm db:backup pre-059` BEFORE applying
--   [ ] Re-run scripts/_exploit-probe.ts AFTER — attack B must now be blocked
-- ────────────────────────────────────────────────────────────────────────────


-- ─── UP ─────────────────────────────────────────────────────────────────────

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.pyra_users FROM authenticated;

-- Note: SELECT and REFERENCES are intentionally NOT revoked here (see Purpose).


-- ─── DOWN (informational — NOT executed by any tool) ───────────────────────
--
-- To restore the previous (insecure) grant — only if a write path is found
-- that was missed and cannot be moved to service_role in time:
--
-- -- GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.pyra_users TO authenticated;
--
-- The correct forward fix for any missed write is to route it through
-- createServiceRoleClient() (with an explicit ownership / permission gate),
-- NOT to re-grant.
