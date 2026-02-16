# Phase 10: Full Project Audit Report — Pyra Workspace 3.0

**Date:** 2026-02-16
**Audited by:** 5 parallel AI agents (Admin API, Portal API, Frontend, Security, Components)
**Scope:** All 162+ TypeScript files, 50+ API routes, 29 pages, 26 DB tables

---

## Executive Summary

| Severity | Count |
|----------|-------|
| CRITICAL | **35** |
| WARNING | **72** |
| INFO | **30** |
| **TOTAL** | **137** |

### Top 8 Systemic Issues (Blocking)

1. **Quotes module entirely non-functional** — 4 route files reference non-existent columns (`team_id`, `project_name`, `estimate_date`, `expiry_date`, `terms_conditions`)
2. **Share links module entirely non-functional** — Creation and download use wrong column names (`password_hash`, `download_count`, `max_downloads`)
3. **Client notifications universally broken** — Every INSERT into `pyra_client_notifications` is missing required NOT NULL `title` column (5+ routes)
4. **Portal session column mismatch** — `lib/portal/auth.ts` uses `token` but schema has `token_hash` (breaks all portal authentication)
5. **PostgREST `.or()` filter injection** — 4 portal routes interpolate unsanitized `client.company` into filter strings
6. **User creation broken** — INSERT uses non-existent `auth_user_id` column, missing NOT NULL `password_hash`
7. **Project creation broken** — Missing NOT NULL `storage_path` in INSERT
8. **Admin login has zero rate limiting** — Unlimited brute-force attacks possible

---

## 1. DATABASE SCHEMA MISMATCHES

### 1.1 Non-Existent Columns Referenced in Code

| File | Column Used | Actual Column | Table |
|------|------------|---------------|-------|
| `api/quotes/route.ts` | `project_name` | `title` | pyra_quotes |
| `api/quotes/route.ts` | `team_id` | _(none)_ | pyra_quotes |
| `api/quotes/route.ts` | `estimate_date` | _(none)_ | pyra_quotes |
| `api/quotes/route.ts` | `expiry_date` | _(none)_ | pyra_quotes |
| `api/quotes/route.ts` | `terms_conditions` | `terms` | pyra_quotes |
| `api/quotes/[id]/route.ts` | Same 5 columns | Same | pyra_quotes |
| `api/quotes/[id]/duplicate/route.ts` | Same 5 columns | Same | pyra_quotes |
| `api/shares/route.ts` | `password_hash` | _(none)_ | pyra_share_links |
| `api/shares/route.ts` | `max_downloads` | `max_access` | pyra_share_links |
| `api/shares/route.ts` | `download_count` | `access_count` | pyra_share_links |
| `api/shares/download/[token]/route.ts` | Same 3 columns | Same | pyra_share_links |
| `api/users/route.ts` | `auth_user_id` | _(none — use pyra_auth_mapping)_ | pyra_users |
| `api/comments/route.ts` | `parent_id` | _(none)_ | pyra_client_comments |
| `api/comments/route.ts` | `attachments` | _(none)_ | pyra_client_comments |
| `api/comments/[id]/route.ts` | `parent_id` | _(none)_ | pyra_client_comments |
| `api/trash/route.ts` | `deleted_at` | `created_at` | pyra_trash |
| `lib/portal/auth.ts` | `token` | `token_hash` | pyra_sessions |
| `portal/projects/[id]/comments/route.ts` | `author_id`, `mentions`, `parent_id`, `attachments` | _(none)_ | pyra_client_comments |
| `portal/quotes/route.ts` | `project_name`, `estimate_date`, `expiry_date` | _(none)_ | pyra_quotes |

### 1.2 Missing NOT NULL Columns in INSERTs

| File | Missing Column | Table |
|------|---------------|-------|
| `api/approvals/route.ts` | `client_id` (NOT NULL) | pyra_file_approvals |
| `api/approvals/[id]/route.ts` | `title` (NOT NULL) | pyra_client_notifications |
| `api/approvals/route.ts` | `title` (NOT NULL) | pyra_client_notifications |
| `api/comments/route.ts` | `title` (NOT NULL) | pyra_client_notifications |
| `api/quotes/[id]/send/route.ts` | `title` (NOT NULL) | pyra_client_notifications |
| `api/projects/route.ts` | `storage_path` (NOT NULL) | pyra_projects |
| `api/users/route.ts` | `password_hash` (NOT NULL) | pyra_users |
| `api/shares/route.ts` | `file_name` (NOT NULL) | pyra_share_links |
| `api/shares/route.ts` | `created_by_display` (NOT NULL) | pyra_share_links |
| `portal/files/[id]/approve/route.ts` | `client_id` (NOT NULL) | pyra_file_approvals |
| `portal/files/[id]/revision/route.ts` | `client_id` (NOT NULL) | pyra_file_approvals |

---

## 2. SECURITY ISSUES

### 2.1 CRITICAL Security

| # | File | Issue |
|---|------|-------|
| S1 | `api/auth/login/route.ts` | **No rate limiting on admin login** — unlimited brute-force possible |
| S2 | `middleware.ts:62-71` | **CSRF bypass** — missing Origin header allowed through (should reject) |
| S3 | `next.config.ts:46` | **CSP allows `unsafe-eval` + `unsafe-inline`** — XSS protection ineffective |
| S4 | `portal/auth/forgot-password/route.ts` | **Reset tokens stored plaintext** (session tokens use SHA-256, but reset tokens don't) |
| S5 | `api/files/route.ts:104` | **`application/octet-stream` bypasses MIME whitelist** — any file uploadable |

### 2.2 WARNING Security

| # | File | Issue |
|---|------|-------|
| S6 | `portal/dashboard/route.ts`, `portal/files/route.ts`, `portal/projects/route.ts` | **PostgREST `.or()` filter injection** via unsanitized `client.company` (cross-tenant data leak) |
| S7 | `api/dashboard/route.ts:148` | **Unescaped permission paths in `.or()` LIKE** filter |
| S8 | `api/auth/login/route.ts` | **Account enumeration** — raw Supabase error messages exposed |
| S9 | `api/shares/[id]/route.ts` | **No ownership check** — any user can deactivate any share link |
| S10 | `portal/profile/route.ts` | **Email change bypasses verification** — account takeover vector |
| S11 | `api/files/route.ts:84-93` | **Extension blocklist missing** `.php`, `.asp`, `.py`, `.jsp`, etc. |
| S12 | `api/files/route.ts:55` | **SVG files allowed** — can contain inline JavaScript (XSS) |
| S13 | `api/files/route.ts:44` | **HTML files allowed** — can contain JavaScript (XSS) |
| S14 | `shares/download/[token]/route.ts:77` | **Share password in URL query param** — leaked in logs/referrer |
| S15 | `lib/utils/rate-limit.ts` | **IP spoofing via `x-forwarded-for`** — rate limits bypassable |
| S16 | `lib/utils/rate-limit.ts` | **In-memory rate limiter** — resets on restart, no multi-instance |
| S17 | `middleware.ts:78-79` | **Broad `/api/portal` prefix exemption** — new routes auto-public |
| S18 | `portal/profile/password/route.ts` | **Legacy bcrypt clients can't change password** — no `auth_user_id` guard |

---

## 3. ADMIN API ROUTE ISSUES

### 3.1 Supabase Client Misuse (WARNING — 12 routes)

The following routes use `createServerSupabaseClient()` (RLS-restricted) for admin write operations instead of `createServiceRoleClient()`:

| Route | Operations |
|-------|-----------|
| `api/notifications/route.ts` POST | INSERT notifications |
| `api/projects/[id]/route.ts` PATCH/DELETE | UPDATE/DELETE projects |
| `api/reviews/[id]/route.ts` PATCH/DELETE | UPDATE/DELETE reviews |
| `api/reviews/route.ts` POST | INSERT reviews |
| `api/settings/route.ts` PATCH | UPSERT settings |
| `api/teams/[id]/members/route.ts` POST/DELETE | INSERT/DELETE members |
| `api/teams/[id]/route.ts` PATCH/DELETE | UPDATE/DELETE teams |
| `api/teams/route.ts` POST | INSERT teams |
| `api/trash/[id]/route.ts` POST/DELETE | Restore/purge operations |
| `api/users/[username]/route.ts` PATCH/DELETE | UPDATE/DELETE users |

### 3.2 Other Admin API Issues

| # | Severity | File | Issue |
|---|----------|------|-------|
| A1 | CRITICAL | `api/approvals/[id]/route.ts` | Notification recipient always falls through to hardcoded `'admin'` |
| A2 | WARNING | `api/clients/[id]/route.ts` | PATCH/DELETE call auth API without null-checking `auth_user_id` |
| A3 | WARNING | `api/files/[...path]/route.ts` | Non-atomic file index delete+insert on rename |
| A4 | WARNING | `api/settings/route.ts` | `value` stored as `String()` but column is `jsonb` |
| A5 | WARNING | `api/quotes/[id]/route.ts` | DELETE returns success for non-existent IDs (no 404) |
| A6 | WARNING | `api/teams/[id]/members/route.ts` | No username existence validation before team add |
| A7 | WARNING | `api/shares/route.ts` | `expires_at` is NOT NULL but code allows null |

---

## 4. PORTAL API ROUTE ISSUES

| # | Severity | File | Issue |
|---|----------|------|-------|
| P1 | CRITICAL | `lib/portal/auth.ts:43-132` | Session INSERT/SELECT/DELETE use `token` instead of `token_hash` |
| P2 | WARNING | `portal/auth/forgot-password/route.ts` | Uses `pyra_sessions` instead of dedicated `pyra_client_password_resets` table |
| P3 | WARNING | `portal/auth/forgot-password/route.ts` | Reset token generated with `generateId` instead of `nanoid(32)` |
| P4 | WARNING | `portal/files/[id]/approve/route.ts` | Approval lookup not scoped by `client_id` (IDOR) |
| P5 | WARNING | `portal/files/[id]/revision/route.ts` | Same IDOR as P4 |
| P6 | WARNING | `portal/files/route.ts:98` | Internal `file_path` exposed to clients |
| P7 | WARNING | `portal/notifications/route.ts` | SELECT missing `title`, `target_project_id`, `target_file_id` |
| P8 | WARNING | `portal/projects/[id]/route.ts` | `is_read_by_client` marks read for ALL clients on shared projects |
| P9 | WARNING | `portal/quotes/[id]/route.ts` | `SELECT *` exposes `created_by` and internal fields |
| P10 | WARNING | `portal/quotes/[id]/sign/route.ts` | No size limit on `signature_data` (DoS risk) |

---

## 5. FRONTEND ↔ BACKEND MISMATCHES

| # | Severity | File | Issue |
|---|----------|------|-------|
| F1 | CRITICAL | `dashboard/notifications/page.tsx` | Query param `unread` should be `unread_only` — filter silently broken |
| F2 | CRITICAL | `dashboard/reviews/page.tsx` | PATCH sends empty body; API requires `{ resolved: boolean }` — toggle broken |
| F3 | WARNING | `dashboard/permissions/permissions-client.tsx` | Uses `prefix` param; API expects `path` — folder tree broken |
| F4 | WARNING | `portal/(auth)/login/page.tsx` | Redirects to `/portal/projects` instead of `/portal` dashboard |
| F5 | WARNING | `portal/(main)/quotes/page.tsx` | Hardcoded "AED" instead of using `detail.currency` |
| F6 | WARNING | `components/quotes/QuoteBuilder.tsx` | Hardcoded "AED" in totals display |
| F7 | WARNING | `portal/(auth)/reset-password/page.tsx` | HTML `minLength=6` but JS validates 12 chars |
| F8 | WARNING | `dashboard/activity/page.tsx` | No `res.ok` check; no error feedback |
| F9 | WARNING | `dashboard/page.tsx` | No error state displayed on API failure |

---

## 6. COMPONENTS & HOOKS ISSUES

| # | Severity | File | Issue |
|---|----------|------|-------|
| C1 | CRITICAL | `hooks/useNotifications.ts` | Silent error swallowing — no `res.ok` check, empty catch blocks |
| C2 | CRITICAL | `components/files/file-explorer.tsx:231` | `encodeURIComponent` on full path breaks nested file rename |
| C3 | CRITICAL | `components/files/file-explorer.tsx:253` | Same encoding issue for delete |
| C4 | CRITICAL | `lib/api/auth.ts:29` | `user.email!` non-null assertion without null check |
| C5 | CRITICAL | `lib/auth/guards.ts:38,74` | Same `user.email!` non-null assertion (2 locations) |
| C6 | WARNING | `hooks/useNotifications.ts` | Optimistic `markRead` without rollback on failure |
| C7 | WARNING | `hooks/useNotifications.ts` | 30s polling continues when tab is hidden |
| C8 | WARNING | `components/quotes/QuoteBuilder.tsx:315` | Array index as React key in services table |
| C9 | WARNING | `components/quotes/QuoteBuilder.tsx` | Uses `alert()` instead of `toast` (3 locations) |
| C10 | WARNING | `lib/utils/password.ts` | Synchronous `scryptSync` blocks event loop |
| C11 | WARNING | `lib/utils/password.ts` | Two hashing systems (scrypt + bcryptjs) — no migration path |
| C12 | WARNING | `lib/utils/quote-number.ts` | Race condition in quote number generation |
| C13 | WARNING | `lib/portal/auth.ts` | Expired sessions never cleaned up from DB |
| C14 | WARNING | `types/database.ts` | `PyraClient` missing `password_hash`, `status` fields |
| C15 | WARNING | `types/database.ts` | `ApiResponse` type doesn't match actual response shape |

---

## 7. TYPE SAFETY

| Check | Result |
|-------|--------|
| `strict: true` in tsconfig | YES |
| `any` types found | **0** (excellent) |
| `@ts-ignore` found | **0** |
| `@ts-nocheck` found | **0** |
| `!` non-null assertions | 4 locations (auth.ts, guards.ts, server.ts) |
| `noUncheckedIndexedAccess` | NOT enabled |

---

## 8. FILE-BY-FILE STATUS

### Admin API Routes (43 files)

| File | Status |
|------|--------|
| `api/activity/route.ts` | Clean |
| `api/approvals/[id]/route.ts` | CRITICAL — missing `title` in notifications, wrong recipient |
| `api/approvals/route.ts` | CRITICAL — missing `client_id` and `title` |
| `api/auth/login/route.ts` | WARNING — no rate limiting, account enumeration |
| `api/auth/logout/route.ts` | INFO — no auth check |
| `api/auth/session/route.ts` | INFO — inconsistent response format |
| `api/clients/[id]/route.ts` | WARNING — null `auth_user_id` crash |
| `api/clients/route.ts` | Clean |
| `api/comments/[id]/route.ts` | CRITICAL — `parent_id` doesn't exist |
| `api/comments/route.ts` | CRITICAL — `parent_id`, `attachments` don't exist |
| `api/dashboard/route.ts` | WARNING — unescaped paths in `.or()` |
| `api/files/[...path]/route.ts` | WARNING — non-atomic rename |
| `api/files/delete-batch/route.ts` | INFO — rate limit before auth |
| `api/files/download/[...path]/route.ts` | Clean |
| `api/files/folders/route.ts` | Clean |
| `api/files/route.ts` | CRITICAL — octet-stream bypass; WARNING — missing extensions |
| `api/files/search/route.ts` | Clean |
| `api/health/route.ts` | Clean |
| `api/notifications/[id]/route.ts` | Clean |
| `api/notifications/read-all/route.ts` | Clean |
| `api/notifications/route.ts` | WARNING — server client for writes |
| `api/projects/[id]/files/route.ts` | Clean |
| `api/projects/[id]/route.ts` | WARNING — server client for writes |
| `api/projects/route.ts` | CRITICAL — missing `storage_path` |
| `api/quotes/[id]/duplicate/route.ts` | CRITICAL — 5 non-existent columns |
| `api/quotes/[id]/route.ts` | CRITICAL — 4 non-existent columns in QUOTE_FIELDS |
| `api/quotes/[id]/send/route.ts` | CRITICAL — missing `title` in notification |
| `api/quotes/route.ts` | CRITICAL — non-existent columns in FIELDS and INSERT |
| `api/reviews/[id]/route.ts` | WARNING — server client for writes |
| `api/reviews/route.ts` | WARNING — server client for writes |
| `api/settings/route.ts` | WARNING — server client, jsonb value issue |
| `api/shares/[id]/route.ts` | WARNING — no ownership check |
| `api/shares/download/[token]/route.ts` | CRITICAL — 3 non-existent columns |
| `api/shares/route.ts` | CRITICAL — 3 wrong columns, 2 missing NOT NULLs |
| `api/teams/[id]/members/route.ts` | WARNING — no username validation |
| `api/teams/[id]/route.ts` | WARNING — server client for writes |
| `api/teams/route.ts` | WARNING — server client for writes |
| `api/trash/[id]/route.ts` | WARNING — server client for writes |
| `api/trash/route.ts` | CRITICAL — `deleted_at` doesn't exist |
| `api/users/[username]/password/route.ts` | Clean |
| `api/users/[username]/route.ts` | WARNING — server client for writes |
| `api/users/lite/route.ts` | Clean |
| `api/users/route.ts` | CRITICAL — `auth_user_id` column doesn't exist, missing `password_hash` |

### Portal API Routes (20 files)

| File | Status |
|------|--------|
| `portal/auth/forgot-password/route.ts` | WARNING — wrong table, plaintext token |
| `portal/auth/login/route.ts` | WARNING — service role for signIn |
| `portal/auth/logout/route.ts` | Clean |
| `portal/auth/reset-password/route.ts` | CRITICAL — wrong column `token` vs `token_hash` |
| `portal/auth/session/route.ts` | Clean |
| `portal/dashboard/route.ts` | CRITICAL — `.or()` injection |
| `portal/files/[id]/approve/route.ts` | CRITICAL — missing `client_id`; WARNING — IDOR |
| `portal/files/[id]/download/route.ts` | Clean |
| `portal/files/[id]/revision/route.ts` | CRITICAL — missing `client_id`; WARNING — IDOR |
| `portal/files/route.ts` | CRITICAL — `.or()` injection |
| `portal/notifications/[id]/route.ts` | WARNING — missing columns in SELECT |
| `portal/notifications/route.ts` | WARNING — missing columns in SELECT |
| `portal/profile/password/route.ts` | WARNING — no legacy client guard |
| `portal/profile/route.ts` | WARNING — email change without verification |
| `portal/projects/[id]/comments/route.ts` | CRITICAL — 4 non-existent columns |
| `portal/projects/[id]/route.ts` | WARNING — read tracking, path exposure |
| `portal/projects/route.ts` | CRITICAL — `.or()` injection |
| `portal/quotes/[id]/route.ts` | WARNING — SELECT * exposes internals |
| `portal/quotes/[id]/sign/route.ts` | WARNING — no size limit on signature |
| `portal/quotes/route.ts` | WARNING — non-existent columns in SELECT |

### Frontend Pages (26 pages)

| File | Status |
|------|--------|
| `(auth)/login/page.tsx` | Clean |
| `dashboard/page.tsx` | WARNING — no error state |
| `dashboard/activity/page.tsx` | WARNING — no res.ok check |
| `dashboard/clients/` | Clean |
| `dashboard/files/` | Clean |
| `dashboard/notifications/page.tsx` | CRITICAL — wrong query param |
| `dashboard/permissions/` | WARNING — wrong API param |
| `dashboard/projects/page.tsx` | WARNING — undefined in company filter |
| `dashboard/quotes/` | Clean |
| `dashboard/reviews/page.tsx` | CRITICAL — empty PATCH body |
| `dashboard/settings/` | Clean |
| `dashboard/teams/page.tsx` | Clean |
| `dashboard/trash/page.tsx` | Clean |
| `dashboard/users/` | Clean |
| `portal/(auth)/login/page.tsx` | WARNING — wrong redirect target |
| `portal/(auth)/forgot-password/page.tsx` | Clean |
| `portal/(auth)/reset-password/page.tsx` | WARNING — minLength mismatch |
| `portal/(main)/page.tsx` | Clean |
| `portal/(main)/files/page.tsx` | Clean |
| `portal/(main)/notifications/page.tsx` | Clean |
| `portal/(main)/profile/page.tsx` | INFO — minLength mismatch |
| `portal/(main)/projects/` | Clean |
| `portal/(main)/quotes/page.tsx` | WARNING — hardcoded currency |

---

## 9. RECOMMENDED FIX PRIORITY

### Priority 1 — BLOCKING (Features completely broken)

1. **Fix `pyra_quotes` column names** — Replace `project_name`→`title`, remove `team_id`/`estimate_date`/`expiry_date`, `terms_conditions`→`terms` across 4 route files + 2 portal routes
2. **Fix `pyra_share_links` column names** — Replace `password_hash`→remove, `max_downloads`→`max_access`, `download_count`→`access_count`; add missing `file_name`, `created_by_display`
3. **Fix `pyra_client_notifications` INSERTs** — Add required `title` field to all 5+ INSERT locations
4. **Fix `lib/portal/auth.ts` session column** — `token`→`token_hash` (or verify actual DB column name)
5. **Fix `pyra_users` INSERT** — Remove `auth_user_id`, add `password_hash`
6. **Fix `pyra_projects` INSERT** — Add `storage_path`
7. **Fix `pyra_trash` ordering** — `deleted_at`→`created_at`
8. **Fix `pyra_client_comments` columns** — Remove `parent_id`, `attachments`, `author_id`, `mentions`
9. **Fix frontend reviews toggle** — Send `{ resolved: boolean }` in PATCH body
10. **Fix notifications filter** — Change query param `unread`→`unread_only`

### Priority 2 — SECURITY (Vulnerability fixes)

1. Add rate limiting to `api/auth/login/route.ts`
2. Fix CSRF: reject requests with missing Origin header
3. Fix PostgREST `.or()` injection in 4 portal routes
4. Hash reset tokens before storing (like session tokens)
5. Block `application/octet-stream` MIME type bypass
6. Add `.php`, `.asp`, `.py`, `.jsp` to extension blocklist
7. Fix email change to require verification
8. Add ownership check to share link deactivation
9. Scope file approval lookups by `client_id` (IDOR fix)

### Priority 3 — RELIABILITY (Correct but fragile)

1. Switch 12 admin routes from server client to service role client for writes
2. Fix `encodeURIComponent` path encoding in file-explorer.tsx
3. Add null guard for `auth_user_id` in clients PATCH/DELETE
4. Add null guard for legacy bcrypt clients in password routes
5. Fix notifications hook error swallowing
6. Add `res.ok` checks across frontend pages
7. Fix permissions page `prefix`→`path` param
8. Replace synchronous `scryptSync` with async `scrypt`

### Priority 4 — QUALITY (Nice to fix)

1. Replace `alert()` with `toast` in QuoteBuilder
2. Fix array index React keys in QuoteBuilder services
3. Use `detail.currency` instead of hardcoded "AED"
4. Add pagination limits to portal projects/files queries
5. Add session cleanup cron for expired `pyra_sessions`
6. Fix HTML `minLength` mismatches with JS validation
7. Improve CSP (remove `unsafe-eval`/`unsafe-inline`)
8. Add accessibility attributes to file grid items
9. Add error reporting integration (Sentry, etc.)
10. Document password hashing migration path (scrypt vs bcrypt)

---

## 10. KNOWN SECURITY ISSUES — STATUS

| Issue | Status |
|-------|--------|
| Base64 passwords in share links | FIXED (now uses scrypt) |
| SQL injection in `.or()` search filters | PARTIALLY FIXED (admin routes fixed, portal routes still vulnerable) |
| Rate limiting on admin login | NOT FIXED |
| Password reset token length | FIXED (uses nanoid(32)) |
| Reset token log leak | FIXED (no console.log of tokens) |
| Reset token plaintext storage | NOT FIXED (tokens not hashed) |
| `any` types in codebase | CLEAN (0 found) |
| TypeScript strict mode | ENABLED |

---

_End of Phase 10 Audit Report_
