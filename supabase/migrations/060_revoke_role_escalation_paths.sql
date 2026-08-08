-- ────────────────────────────────────────────────────────────────────────────
-- Migration 060 — Close the role-escalation paths left open by 059
--
-- Phase:        Audit Gap #3 — write-side hardening, part 2 (2026-08-08)
-- Author:       elharm
-- Date:         2026-08-08
-- Reversible:   YES (re-GRANT hints inline in DOWN)
-- Touches data: NO (privilege change only)
-- Risk tier:    2 (changes production access — ORDERING below is mandatory)
--
-- Purpose:
--   Migration 059 revoked writes on pyra_users, which closed
--   "PATCH my own row, set role='admin'". It did NOT close the same escalation
--   one table over. Verified live today, AFTER 059 was applied:
--
--     pyra_users          authenticated → SELECT only            (059 closed this)
--     pyra_roles          authenticated → SELECT,INSERT,UPDATE,DELETE,TRUNCATE
--     pyra_auth_mapping   authenticated → SELECT,INSERT,UPDATE,DELETE,TRUNCATE
--     pyra_salary_history authenticated → SELECT,INSERT,UPDATE,DELETE,TRUNCATE
--
--   All three have RLS OFF and zero policies, so the grant is the only gate.
--
--   The escalation: lib/auth/rbac.ts:911 returns the ['*'] superuser permission
--   set when a user's DB role row contains '*'. Any logged-in account could
--   therefore PATCH pyra_roles and become a full admin in one request — no
--   password, no approval, no trace in pyra_activity_log. Worse, youssef,
--   cosette and test.sales all share ONE role row ("Sales"), so a single write
--   promotes all three at once.
--
--   Proven live 2026-08-08 from a plain sales session (test.sales): a PATCH on
--   the live "Sales" role returned HTTP 200. The probe wrote the row's existing
--   colour back to itself — permissions were never modified, verified after.
--
--   pyra_auth_mapping maps usernames ↔ Supabase Auth user ids; write access is
--   an identity-confusion path. pyra_salary_history is the audit trail for
--   every salary change — write access lets the evidence be forged or erased.
--
-- Scope of each revoke, and why they differ:
--   pyra_roles          → writes only. SELECT must stay: getApiAuth() and
--                         loadUserWithRole() embed pyra_roles on every request
--                         (`pyra_roles!left(...)`), which requires SELECT for
--                         the calling role.
--   pyra_auth_mapping   → writes only. resolveAuthUserId() reads it; leaving
--                         SELECT costs nothing (it holds no sensitive values).
--   pyra_salary_history → ALL privileges. Verified: zero read sites in the
--                         entire codebase (`grep "from('pyra_salary_history')"`
--                         returns one INSERT and no SELECT), and it holds
--                         old/new salary figures — so it is both safe and
--                         valuable to close completely.
--
-- ⚠️ ORDERING — DEPLOY THE CODE FIRST, THEN RUN THIS ⚠️
--   Three pyra_roles writes were on the user-session client and would break
--   instantly: app/api/roles POST, and app/api/roles/[id] PATCH + DELETE. They
--   now use createServiceRoleClient(). That code must be live in production
--   BEFORE this migration runs. Never the reverse.
--   (pyra_auth_mapping and pyra_salary_history writes were already on the
--   service role — no code change was needed for those two.)
--
-- Idempotency contract:
--   REVOKE is naturally idempotent — re-running is a no-op and never errors.
--
-- Pre-flight checklist (per docs/MIGRATIONS.md §4):
--   [x] Accompanying code deployed and verified live
--   [x] pnpm run check + pnpm build clean
--   [ ] Re-run scripts/_role-escalation-probe.ts AFTER — the PATCH must now 403
--   [ ] Confirm an admin can still create / edit / delete a role in the UI
-- ────────────────────────────────────────────────────────────────────────────


-- ─── UP ─────────────────────────────────────────────────────────────────────

-- The escalation path: a role row carrying '*' is a superuser grant.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.pyra_roles FROM authenticated;

-- Identity mapping: writes here let one account be pointed at another identity.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.pyra_auth_mapping FROM authenticated;

-- Salary audit trail: no reader anywhere in the app, and it holds pay figures.
REVOKE ALL ON public.pyra_salary_history FROM authenticated;


-- ─── DOWN (informational — NOT executed by any tool) ───────────────────────
--
-- -- GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.pyra_roles TO authenticated;
-- -- GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.pyra_auth_mapping TO authenticated;
-- -- GRANT ALL ON public.pyra_salary_history TO authenticated;
--
-- The correct forward fix for a missed write is to route it through
-- createServiceRoleClient() behind its existing permission gate, NOT to re-grant.
