-- ────────────────────────────────────────────────────────────────────────────
-- Migration 061 — Withhold salary / bank / ID columns from `authenticated`
--
-- Phase:        Audit Gap #3 — read-side hardening (2026-08-08)
-- Author:       elharm
-- Date:         2026-08-08
-- Reversible:   YES (single re-GRANT, inline in DOWN)
-- Touches data: NO (privilege change only)
-- Risk tier:    2 (changes production access — ORDERING below is mandatory)
--
-- Purpose:
--   059 and 060 closed every WRITE path to admin. Reading stayed open: any
--   logged-in account could still GET /rest/v1/pyra_users?select=salary and
--   receive every employee's pay, bank details and Emirates ID. Proven live
--   from a plain sales session — 15 rows, salaries included.
--
--   A full `REVOKE SELECT ON pyra_users` would have meant migrating ~55 read
--   sites across ~30 files, including 18 that fail SILENTLY (a null row reads
--   as "user not found", i.e. a mass logout that looks like an outage, not an
--   error). Measured, not guessed.
--
--   Instead this withholds only the 9 sensitive columns and leaves the other
--   29 readable. That took 6 code changes instead of ~55, and touches zero
--   silent-failure paths.
--
-- ⚠️ THE TRAP — column REVOKE alone is a silent no-op ⚠️
--   This does NOTHING, and reports success:
--       REVOKE SELECT (salary) ON pyra_users FROM authenticated;
--   A table-wide GRANT already exists and a column-level REVOKE cannot subtract
--   from it. Verified empirically: after running exactly that, a read of
--   salary_breakdown still returned the value.
--   The table grant must be dropped FIRST, then the safe columns granted back.
--   That is the order below. Do not "simplify" it.
--
-- ⚠️ ORDERING — DEPLOY THE CODE FIRST, THEN RUN THIS ⚠️
--   Six reads name a withheld column (or use select('*')) and break instantly:
--     lib/api/auth.ts                    getApiAuth        select('*')  ← every request
--     lib/auth/guards.ts                 loadUserWithRole  select('*')  ← every page
--     app/api/profile/route.ts     GET   own profile       select('*')
--     app/api/users/route.ts       GET   admin list        salary, national_id…
--     app/api/users/[username]     GET   admin detail      salary, bank_details…
--     app/api/users/[username]     PATCH before-values     salary, hourly_rate…
--   All six now use createServiceRoleClient() behind the gate they already had.
--   The first two are the whole reason a naive revoke looks like a total
--   outage: without them the app 401s every request and loops every page back
--   to /login. That code MUST be live before this runs.
--
-- Verified safe, so NOT changed:
--   * count(*) still works with column-level grants only (tested) — the two
--     `select('*', { count, head: true })` calls in app/api/roles/[id] need no
--     edit.
--   * No PostgREST embedded join anywhere selects a withheld column — checked
--     across app/, lib/, components/, hooks/.
--   * /api/auth/login reads only role, role_id, username, display_name, status,
--     extra_permissions — all granted below, so login is untouched.
--
-- Idempotency contract:
--   REVOKE then GRANT of a fixed column list is naturally idempotent.
--
-- Pre-flight checklist (per docs/MIGRATIONS.md §4):
--   [x] Accompanying code deployed and verified live
--   [x] pnpm run check + pnpm build clean
--   [ ] Re-run scripts/_exploit-probe.ts AFTER — attack A must now be denied
--   [ ] Confirm: login, own profile, admin user list, admin user detail
-- ────────────────────────────────────────────────────────────────────────────


-- ─── UP ─────────────────────────────────────────────────────────────────────

-- Step 1 — drop the table-wide grant. Column grants cannot subtract from it.
REVOKE SELECT ON public.pyra_users FROM authenticated;

-- Step 2 — hand back the 29 non-sensitive columns.
-- WITHHELD (9): password_hash, two_factor_secret, salary, salary_breakdown,
--               hourly_rate, commission_rate, bank_details, national_id,
--               date_of_birth.
-- salary_currency IS granted: it is 'AED'/'EGP', carries no amount, and the
-- payroll UI reads it for formatting.
GRANT SELECT (
  id,
  username,
  role,
  display_name,
  permissions,
  extra_permissions,
  role_id,
  status,
  created_at,
  two_factor_enabled,
  phone,
  job_title,
  avatar_url,
  bio,
  email,
  employment_type,
  work_location,
  payment_type,
  hire_date,
  department,
  manager_username,
  work_schedule_id,
  salary_currency,
  onboarding_id,
  deactivated_at,
  preferred_language,
  last_working_day,
  attendance_tracking_started_on,
  attendance_tracking_start_source
) ON public.pyra_users TO authenticated;


-- ─── DOWN (informational — NOT executed by any tool) ───────────────────────
--
-- -- GRANT SELECT ON public.pyra_users TO authenticated;
--
-- That single statement restores the table-wide grant and supersedes the column
-- grants above. Use it only to unblock an outage; the correct forward fix for a
-- missed read is to route it through createServiceRoleClient() behind its
-- existing permission gate.
