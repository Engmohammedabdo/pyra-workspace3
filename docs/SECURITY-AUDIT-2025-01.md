# Phase 14.3 — Pyra Workspace Security Audit

**Date:** 2026-05-15
**Auditor:** Claude (Phase 14.3 Investigator)
**Scope:** Read-only audit, 10 dimensions, no code changes
**Codebase HEAD at audit time:** `676d2ab chore(crm): close Phase 14.2 — DB migrations strategy complete`
**Deliverable status:** This document is the **closure artifact** of Phase 14.3. No code was modified during this audit; findings are categorized for future action.

---

## Executive Summary

Overall posture is **strong** — the architectural foundations are well-built: a single source of truth for permissions (`buildUserPermissions`), centralized `requireApiPermission` gates, robust CSRF middleware with explicit bypass documentation, defense-in-depth uploads (5+ layers on lead attachments), PII-redacted observability, and proper Stripe webhook signature verification.

**Top 3 concerns:**
1. **PostgREST `.or()` injection in 3 legacy sales-leads routes** (P1 — search param flows raw into filter strings while a parallel CRM route already escapes correctly).
2. **WhatsApp webhook uses string equality for shared-secret comparison** (P1 — timing-attack vulnerable; the rest of the codebase uses `timingSafeEqual`).
3. **Password length requirements are inconsistent across 7 surfaces** (P1 — same system has 6, 8, and 12-char minimums depending on which UI you use).

**Top 3 strengths:**
1. RBAC build pipeline (`buildUserPermissions` + central `requireApiPermission`) — single source of truth, prevents drift.
2. Phase 14.1 observability PII redaction layer (5 layers, depth-limited, header-fragment allowlist).
3. Stripe webhook signature is verified BEFORE any DB write (no race conditions).

**Recommended priorities for the next session:** Fix the legacy sales-leads `.or()` injection (Section 1), switch the WhatsApp webhook to `crypto.timingSafeEqual` (Section 10), and unify the password-min-length constant (Section 9).

**Finding tally:** 0 🔴 P0 · 8 🟠 P1 · 10 🟡 P2 · 16 🟢 PASS · 1 ⚠️ UNKNOWN

---

## Findings by dimension

### 1. SQL injection paths

#### [🟠 P1] Raw user input in PostgREST `.or()` filter — 3 legacy sales-leads routes
- **Confidence:** 92
- **Evidence:**
  - `app/api/dashboard/sales/leads/route.ts:45` — `` query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`); ``
  - `app/api/dashboard/sales/leads/route.ts:87` — same pattern in `countQuery.or(...)`
  - `app/api/dashboard/sales/leads/export/route.ts:47` — same pattern in CSV export
- **Risk:** A sales agent (authenticated) can inject PostgREST filter operators via the `search` query param. They can't drop tables (PostgREST will reject DDL), but they CAN exfiltrate cross-agent data by writing `name.ilike.x,assigned_to.neq.themselves` or any other filter terminator. Authenticated lateral movement across all leads, bypassing the `assigned_to = self` agent scope. Logs in `pyra_error_logs` will show the malformed query but the damage already happened.
- **Recommended fix:** Wrap the input via `` escapePostgrestValue(`%${escapeLike(search)}%`) `` exactly as the new CRM route already does at `app/api/crm/leads/route.ts:88-89`. Mirror that pattern into all three locations.
- **Fix time:** S (30-90 min — 3 sites, 1 file each, plus regression test on each)

#### [🟢 PASS] Phase 14.2 migration scripts use correct SQL escaping
- **Confidence:** 90
- **Evidence:** `scripts/db-record-migration.ts:167-173` — `escapeSqlString` doubles single quotes (Postgres convention). Inputs are validated to known shapes (`version` regex-matched at line 80, `checksum` is hex from SHA-256, `by`/`notes` are CLI-controlled).
- **Risk:** None practical — scripts run locally by Abdou, no user input path.

#### [🟢 PASS] No `supabase.rpc()` user-input injection
- **Confidence:** 85
- **Evidence:** Only 2 RPC calls in production code: `app/api/shares/download/[token]/route.ts:105` (passes server-validated token id) and `lib/auth/permissions.ts:10` (passes file path checked elsewhere). Both bind parameters via Supabase's object syntax — not string concat.

#### [🟡 P2] Search input partial sanitization in WhatsApp conversations
- **Confidence:** 75
- **Evidence:** `app/api/dashboard/sales/whatsapp/conversations/route.ts:107-109` — `` const safeSearch = search.replace(/[,().%*]/g, ''); `` then `` query.or(`contact_name.ilike.%${safeSearch}%,contact_phone.ilike.%${safeSearch}%`) ``.
- **Risk:** Strips commas / parens / wildcards but does NOT strip `.` (PostgREST filter separator) — could allow `name.eq.foo.assigned_to.neq.x` style injection through the dot. Less severe than legacy sales-leads because no `eq`/`neq` operator is reachable without a `.` but defense-in-depth recommends switching to `escapePostgrestValue`.
- **Recommended fix:** Replace the regex strip with the standard `escapePostgrestValue(escapeLike(...))` pattern.
- **Fix time:** XS (< 30 min)

#### [🟢 PASS] `pg/query` endpoint is admin/server-only
- **Confidence:** 95
- **Evidence:** Only callers are server-side scripts in `scripts/` that read service-role key from `.env.local`. Not exposed via any app route. The Kong/Supabase endpoint itself requires the service-role key in the `apikey` header.

---

### 2. XSS vectors

#### [🟠 P1] Markdown rendered via `dangerouslySetInnerHTML` with no sanitizer (task description)
- **Confidence:** 88
- **Evidence:** `components/boards/task-sheet.tsx:565-575` — Task descriptions are markdown-converted via inline `.replace()` regexes and injected into the DOM with `dangerouslySetInnerHTML`. NO sanitization applied to raw text. The `[text](url)` substitution at line 573 produces `<a href="$2" target="_blank">...` — the user-supplied `$2` capture group flows directly into an `href` attribute.
- **Risk:** Any user who can edit a task description can inject XSS:
  - `[click](javascript:alert(1))` → executes on click.
  - `**foo**<img src=x onerror=alert(1)>` → the raw HTML between the regex matches is preserved and rendered.
  - Specifically: text NOT matched by the 4 replace patterns is preserved verbatim and rendered as HTML.
- **Recommended fix:** Either (a) switch to JSX rendering using `<InlineMarkdown>` from `file-preview.tsx:1463` (which IS safe — uses JSX text + bounded regex pieces); or (b) sanitize the output with DOMPurify (NOT currently installed). Block `javascript:` and `data:` href schemes explicitly.
- **Fix time:** M (90 min - 4 hours — needs to preserve the markdown features users rely on)

#### [🟢 PASS] DOCX viewer sanitizes mammoth output
- **Confidence:** 90
- **Evidence:** `components/files/docx-viewer.tsx:11-23` — Strips `<script>`, `<style>`, `<iframe>`, `<form>`, `<input>` tags, `on*` event handlers, and `javascript:`/`data:` URIs from href/src before injecting via `dangerouslySetInnerHTML`. Comprehensive regex-based sanitizer.

#### [🟢 PASS] Shiki syntax highlighter output is trusted-source
- **Confidence:** 85
- **Evidence:** `components/files/file-preview.tsx:827` — Shiki's HTML output is well-formed by construction (no user-controlled tags). The library escapes input characters during tokenization.

#### [🟢 PASS] Service worker registration script is static
- **Confidence:** 95
- **Evidence:** `app/layout.tsx:90-100` — `dangerouslySetInnerHTML` contains a hardcoded literal string (not user data).

#### [🟢 PASS] Error log stack traces render via JSX (auto-escaped)
- **Confidence:** 95
- **Evidence:** `app/dashboard/admin/error-logs/error-logs-client.tsx:458-462` — `{log.stack_trace}` inside `<pre>` — React auto-escapes. No XSS surface even though PII-redacted strings flow through.

#### [🟢 PASS] All `target="_blank"` audited carry `rel="noopener noreferrer"`
- **Confidence:** 80
- **Evidence:** Sampled 6+ instances (`message-bubble.tsx`, `approvals-client.tsx`, `follow-ups-client.tsx`, `pipeline-card.tsx`, `lead-attachments-tab.tsx`, `dashboard-deals-at-risk.tsx`, `board-view-client.tsx`, `file-preview.tsx`) — every external link includes the rel. One internal `<Link target="_blank">` to dashboard URLs (no leak risk since same origin).

#### [🟢 PASS] Lead attachment uploads explicitly reject SVG
- **Confidence:** 95
- **Evidence:** `app/api/crm/leads/[id]/attachments/route.ts:57-64` — Image MIME allowlist is `image/jpeg|png|webp|heic|heif` only. SVG would carry script-execution risk if embedded as `<img>` or rendered inline.

---

### 3. CSRF protection

#### [🟢 PASS] All state-change requests gated by Origin/Referer host comparison
- **Confidence:** 92
- **Evidence:** `middleware.ts:100-132` — For all `/api/*` POST/PATCH/PUT/DELETE requests, the middleware compares `Origin` (with `Referer` fallback) host against the app's host. If neither header is present OR they don't match, returns 403. Bypasses are documented:
  - `/api/stripe/webhook` (signature-verified — see Section 10)
  - `/api/external/*` (x-api-key auth)
  - `/api/cron/*` (x-api-key auth)
- **Note:** GET requests are not subject to CSRF (the middleware only blocks the 4 state-change methods explicitly). This is correct — GET is idempotent by HTTP semantics.

#### [🟢 PASS] Phase 14.1 client-error beacon bypasses ONLY Supabase-Auth check, NOT CSRF
- **Confidence:** 95
- **Evidence:** `middleware.ts:154` adds `/api/observability` to the auth-gate exemption list. But the CSRF block above (lines 92-98) does NOT include `/api/observability` — meaning the route IS protected against cross-origin attacks. Verified the route at `app/api/observability/log-client-error/route.ts:36-49` has its own auth gate (dashboard OR portal session required). Good defense-in-depth.

---

### 4. Rate limiting

#### [🟠 P1] No rate limit on POST `/api/crm/leads` (CRM lead creation)
- **Confidence:** 90
- **Evidence:** `app/api/crm/leads/route.ts:166-334` — POST handler has no `checkRateLimit()` call. Any authenticated sales_agent or admin can create unlimited leads. Same for legacy `/api/dashboard/sales/leads` POST.
- **Risk:** Authenticated abuse — agent could spam-create leads to inflate metrics or fill storage with garbage data. Also a stepping stone if combined with the search injection in Section 1 (mass-scrape after polluting the DB). Lower priority because the actor must be authenticated.
- **Recommended fix:** Add `checkRateLimit(apiWriteLimiter, request)` at the top of the POST handler.
- **Fix time:** XS (< 30 min)

#### [🟡 P2] No rate limit on `/api/auth/two-factor` POST/PATCH/DELETE
- **Confidence:** 80
- **Evidence:** `app/api/auth/two-factor/route.ts` — None of the 3 handlers call `checkRateLimit`. An attacker who got partial 2FA bypass could brute-force the 6-digit TOTP code (~1M combinations). At 30/min via `apiWriteLimiter` that's still ~9 hours, but unbounded means it's seconds.
- **Risk:** Brute-force 2FA codes during the 30-second TOTP window.
- **Recommended fix:** Add `apiWriteLimiter` on POST/DELETE; tighter `loginLimiter`-style (5/15min/IP) on PATCH (verify).
- **Fix time:** XS (< 30 min)

#### [🟡 P2] In-memory rate limiter per-process / non-shared
- **Confidence:** 95
- **Evidence:** `lib/utils/rate-limit.ts:21` — `const limiters = new Map<string, Map<string, RateLimitEntry>>();` is module-level state. Documented in the file header (lines 6-8). Phase 14.2 production runs single-instance on Coolify per docs/MIGRATIONS.md.
- **Risk:** If Coolify scales horizontally (or restarts mid-attack), the limiter resets. Status: acceptable for v1, becomes critical on horizontal scaling.
- **Recommended fix:** v1.1 backlog — switch to Redis-based limiter using ioredis or upstash/ratelimit.
- **Fix time:** L (4+ hours — Redis provisioning + library swap + testing across all limiter callers)

#### [🟢 PASS] Critical auth endpoints all have rate limits
- **Confidence:** 95
- **Evidence:**
  - Admin login: `loginLimiter` 5/15min/IP — `app/api/auth/login/route.ts:32`
  - Portal login: `loginLimiter` 5/15min/IP — `app/api/portal/auth/login/route.ts:56`
  - Forgot password: `forgotPasswordLimiter` 3/email/hour — `app/api/portal/auth/forgot-password/route.ts:52`
  - Reset password: `resetPasswordLimiter` 5/15min/IP — `app/api/portal/auth/reset-password/route.ts:42`
  - User pw change: `userPasswordChangeLimiter` 5/15min/IP — `app/api/users/[username]/password/route.ts:26`
  - Profile pw change: same limiter — `app/api/profile/password/route.ts:17`
  - File uploads: `uploadLimiter` 20/min/IP — `app/api/files/upload-url/route.ts:48`, `app/api/files/route.ts:290`, `app/api/crm/leads/[id]/attachments/route.ts:178`
  - Share verify/download: `shareDownloadLimiter` 30/min/IP

---

### 5. Secret management

#### [🟢 PASS] No service role key on client side
- **Confidence:** 98
- **Evidence:** Grepped all `components/` and `app/portal/` and client-marked files in `lib/` — only `pdf/*` files and `mentions.tsx` had `'use client'` directive, and none of them reference `SUPABASE_SERVICE_ROLE_KEY`. `createServiceRoleClient` is only imported by server routes.

#### [🟢 PASS] Stripe secret key resolved server-side via `getStripeClient()`
- **Confidence:** 95
- **Evidence:** `lib/stripe.ts` is server-side helper. Only `STRIPE_WEBHOOK_SECRET` and `STRIPE_SECRET_KEY` referenced in admin settings page UI as labels (line 87 in `settings-client.tsx`). The publishable key is `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (intentionally public).

#### [🟢 PASS] No hardcoded secrets in tracked files
- **Confidence:** 85
- **Evidence:** No literal `sk_live_`, `eyJ`-prefixed JWT, `Bearer `, etc., found outside of `.env.example` placeholders and `PRD-*.md` docs.

#### [🟢 PASS] ABDOU_USERNAME env var is non-sensitive
- **Confidence:** 95
- **Evidence:** `scripts/db-record-migration.ts:88-92` — documented as "non-sensitive username", fallback chain `process.env.ABDOU_USERNAME ?? 'system'`. No security material.

#### [🟢 PASS] Phase 14.2 scripts read service-role key from `.env.local` only
- **Confidence:** 95
- **Evidence:** `scripts/db-record-migration.ts:99-118` and `scripts/db-check-drift.ts:39-53` — Both explicitly read `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` file (not from CLI args or process.env). Refuse to start if missing or malformed. Matches the documented "service-role key is file-only" pattern.

---

### 6. Permission boundaries

#### [🟡 P2] `extra_permissions` field accepts any string without whitelist
- **Confidence:** 80
- **Evidence:** `app/api/users/route.ts:101-109` and `app/api/users/[username]/route.ts:138-146` — Validation is only "is an array of strings". No check against the PERMISSIONS constants. An admin (intentionally OR through compromised admin session) could grant `*` to any user, instantly making them super-admin.
- **Risk:** Admin foot-gun. If an admin's session is hijacked OR an admin makes a typo, an unintended user gets full wildcard access. Real attack scenario: phishing an admin → setting one specific employee's `extra_permissions` to `["*"]`.
- **Recommended fix:** Whitelist `extra_permissions` against `PERMISSIONS` constants; reject `*` and `*.*` unconditionally (those should be managed via `pyra_roles.permissions` for audit clarity).
- **Fix time:** S (30-90 min)

#### [🟢 PASS] Central `buildUserPermissions` is the single source of truth
- **Confidence:** 95
- **Evidence:** `lib/auth/rbac.ts:781-799` — All 3 permission-build entry points (API auth, server guards, login) call this helper. Wildcard cases short-circuit cleanly. BASE_EMPLOYEE inheritance is guaranteed.

#### [🟢 PASS] `canAccessLead()` correctly enforced on lead routes
- **Confidence:** 90
- **Evidence:** Used in 6+ critical lead-mutation routes: `/api/crm/leads/[id]/attachments/*`, `/move-stage`, `/link-client`, `/activities`, `/api/crm/follow-ups/*`. Plus list scoping via `getLeadScopeFilter` in `/api/crm/leads/route.ts:61-64`. Admin gets unrestricted access; agent gets `assigned_to=username` filter.

#### [🟢 PASS] Admin-only routes correctly require `users.manage`
- **Confidence:** 90
- **Evidence:** Sampled `/api/users` POST + PATCH + DELETE — all require `users.manage`. Same for settings, roles, teams, sessions.

#### [🟢 PASS] `createServiceRoleClient` call sites are auth-gated
- **Confidence:** 85
- **Evidence:** Sampled 10+ routes that use `createServiceRoleClient` — all sit AFTER `requireApiPermission(...)` or `getApiAuth()` gate. Pattern is consistent. Some (e.g., `/api/observability/log-client-error/route.ts`) check session presence before reaching the service-role section.

---

### 7. GDPR / Privacy

#### [🟠 P1] No data export endpoint for users (Right to Data Portability)
- **Confidence:** 90
- **Evidence:** No file in `app/api/users/[username]/export/` or similar. No `gdpr` directory. User cannot self-export their profile + activity + payroll + attendance data.
- **Risk:** GDPR Article 20 (Right to Data Portability) compliance gap. Pyramedia is UAE — UAE PDPL has similar requirements. Without an automated export, every request requires manual SQL export.
- **Recommended fix:** Add `/api/users/[username]/export` (authenticated, self-only OR users.manage) returning a JSON or ZIP containing all rows referencing the user across pyra_* tables.
- **Fix time:** M (90 min - 4 hours)

#### [🟠 P1] No soft-delete or self-erasure endpoint for clients (Right to Erasure)
- **Confidence:** 90
- **Evidence:** `app/api/users/[username]/route.ts:351` has hard-DELETE (cascade cleanup across 14 tables) but it's `users.manage`-only. Clients cannot self-delete from the portal. No `pyra_clients` DELETE endpoint exists in `app/api/clients/[id]/route.ts` for self-service.
- **Risk:** GDPR Article 17 (Right to Erasure). Currently admin must run manual SQL or call the existing user-delete endpoint. No portal flow to honor a client's deletion request.
- **Recommended fix:** Add portal endpoint `/api/portal/profile/delete-account` with email confirmation; mark client `is_active=false` + scrub PII (`name='[deleted]'`, `email='[deleted]'`, `phone=NULL`) while preserving FK integrity for invoices/payments.
- **Fix time:** M (90 min - 4 hours)

#### [🟡 P2] `pyra_error_logs` has no retention TTL or cleanup job
- **Confidence:** 92
- **Evidence:** Migration 015 documented as "append-mostly", no scheduled cleanup. Estimated ~14k rows/year at current scale (CRM-PROGRESS doc).
- **Risk:** PII (even after redaction, `user_id` is a username, `request_path` may carry IDs) accumulates indefinitely. GDPR Article 5(1)(e) — storage limitation.
- **Recommended fix:** Add a cron `/api/cron/error-logs-cleanup` that deletes rows older than e.g. 90 days. Configurable retention.
- **Fix time:** S (30-90 min)

#### [🟡 P2] PII redaction regex may miss UAE phone formats
- **Confidence:** 60
- **Evidence:** `lib/observability/log-error.ts:95` — `PHONE_RE = /(?<![a-zA-Z0-9])\+?\d{7,15}(?![a-zA-Z0-9])/g`. UAE phones are typically `+971 56 579 9505` or `0565799505` — both fit the 7-15 digit range. BUT phones written with parens `(056) 579-9505` would slip through because the regex stops at the first non-digit.
- **Risk:** Some PII shapes (especially space- or hyphen-separated phones, Arabic-numeral phones `٠٥٦٥٧٩٩٥٠٥`) bypass redaction.
- **Recommended fix:** Add a more permissive phone pre-pass that normalizes spaces/hyphens/parens before regex matching; add Arabic numeral handling.
- **Fix time:** S (30-90 min — careful regex work)

#### [🟢 PASS] `pyra_clients` activate-portal API requires admin
- **Confidence:** 90
- **Evidence:** Convert-to-customer and portal-access toggles all require admin via permission gates.

#### [🟢 PASS] Stripe data flow documented and minimal
- **Confidence:** 85
- **Evidence:** Stripe receives invoice amount + client metadata in `session.metadata` — necessary for contract execution. No PII sent unnecessarily.

---

### 8. Backup encryption

#### [🟡 P2] Local backups unencrypted at rest
- **Confidence:** 95
- **Evidence:** Documented in CLAUDE.md — Phase 14.2 backups land in `backups/` locally with no encryption configuration. Relies on filesystem encryption (BitLocker / FileVault) on the dev's machine.
- **Risk:** If the developer's laptop is stolen / not running disk encryption, the backup contains full DB snapshot including hashed passwords, 2FA secrets, error logs (PII even after redaction).
- **Recommended fix:** Encrypt backups with `gpg --symmetric` or `age` before storing locally. Document the recipient key.
- **Fix time:** S (30-90 min — backup wrapper script change)

#### [🟡 P2] No offsite backup configured
- **Confidence:** 95
- **Evidence:** v1.1 backlog item per CLAUDE.md. Currently relies on single-machine local backups.
- **Risk:** Total dev machine loss = no backups.
- **Recommended fix:** S3 + lifecycle policy. v1.1 backlog already.
- **Fix time:** M (90 min - 4 hours)

#### [🟢 PASS] Restore connection uses TLS
- **Confidence:** 80
- **Evidence:** docs/MIGRATIONS.md documents `psql "$SUPABASE_DB_URL"` with `sslmode=require` in the documented URL format.

#### [⚠️ UNKNOWN] Coolify-managed Postgres auto-backup encryption status
- **Confidence:** 30
- **Evidence:** Coolify backups (if enabled) are out of scope of this codebase audit. Documented in CLAUDE.md as "needs Abdou confirmation".
- **Recommended action:** Verify with Abdou whether Coolify backs up the Postgres instance and whether those backups are encrypted at rest.

---

### 9. Authentication strength

#### [🟠 P1] Inconsistent password length requirements across 7 surfaces
- **Confidence:** 95
- **Evidence:**
  - 6 chars: `app/api/clients/[id]/activate-portal/route.ts:30`, `app/api/clients/route.ts:212`, `app/dashboard/clients/clients-client.tsx:153`
  - 8 chars: `app/api/profile/password/route.ts:29`, `app/dashboard/profile/profile-client.tsx:385`
  - 12 chars: `app/api/users/route.ts:85`, `app/api/users/[username]/password/route.ts:39`, `app/api/portal/auth/reset-password/route.ts:59`, `app/api/portal/profile/password/route.ts:55`, `components/portal/profile/PasswordForm.tsx:72,81`
- **Risk:** Confusing UX + actually weakens security: an admin creating a new user requires 12 chars, but a user changing their own dashboard password only needs 8. Portal newly created clients only need 6 — same client can be reset to 12-char password later. Pre-existing AUDIT-REPORT-PHASE10.md flagged this.
- **Recommended fix:** Define `PASSWORD_MIN_LENGTH = 12` in `lib/constants/` and import everywhere. Update all 7 sites.
- **Fix time:** S (30-90 min)

#### [🟠 P1] 2FA `two_factor_secret` stored unencrypted in DB
- **Confidence:** 88
- **Evidence:** `app/api/auth/two-factor/route.ts:38,73,131-142` — Secret stored as raw text in `pyra_users.two_factor_secret`. Anyone with read access to `pyra_users` (including the service-role key) can compute valid TOTP codes for any user.
- **Risk:** A DB-read breach (e.g., service-role key leaked) gives the attacker not just password hashes (scrypt — slow to crack) but ALSO valid 2FA codes for any user. The 2FA setup is effectively useless against an insider/key-leak threat.
- **Recommended fix:** Encrypt `two_factor_secret` at the application layer using a separate `TWO_FACTOR_ENCRYPTION_KEY` env var (NaCl/age/AES-GCM). Application decrypts on demand. Service-role key alone (without the encryption key) cannot decrypt secrets.
- **Fix time:** M (90 min - 4 hours — schema update + key management + migration of existing rows)

#### [🟠 P1] 2FA enrolled but NOT enforced at login
- **Confidence:** 95
- **Evidence:** `app/api/auth/login/route.ts:44-66` — Login flow uses `signInWithPassword` only. Even if a user has `two_factor_enabled=true` in `pyra_users`, the login endpoint does NOT check this column or require a TOTP token. 2FA setup exists; login does not enforce it.
- **Risk:** Security theater — a user who thinks they have 2FA enabled gets ONLY password-based login. An attacker with the password alone can sign in fully without TOTP. Completely defeats the 2FA system.
- **Recommended fix:** After `signInWithPassword` succeeds, check `pyraUser.two_factor_enabled`. If true, return a partial-auth response that requires the client to submit a TOTP code in a follow-up request before issuing the session.
- **Fix time:** M (90 min - 4 hours — new endpoint OR multi-step login flow)

#### [🟡 P2] Dev-mode forgot-password leaks raw reset token
- **Confidence:** 90
- **Evidence:** `app/api/portal/auth/forgot-password/route.ts:134-140` — When `NODE_ENV !== 'production'`, the raw reset token is returned in the JSON response body. Useful for testing, but if NODE_ENV is misconfigured in production (e.g., not set, or set to 'development' by mistake), every forgot-password request leaks the raw token over HTTP.
- **Risk:** Misconfiguration → token leak. The token is then usable for 1 hour to reset the targeted email's password.
- **Recommended fix:** Replace the `NODE_ENV !== 'production'` check with an explicit `process.env.ENABLE_TEST_RESET_TOKEN === 'true'` flag that defaults to off. Or remove the leak entirely; rely on log inspection during dev.
- **Fix time:** XS (< 30 min)

#### [🟡 P2] No per-account lockout (only per-IP)
- **Confidence:** 85
- **Evidence:** `loginLimiter` keys on IP (`getClientIp(request)`). An attacker rotating through proxy IPs can attempt brute-force against a specific email without ever triggering the rate limit.
- **Risk:** Distributed brute-force on a known email.
- **Recommended fix:** Add a secondary limiter keyed on `email` with stricter limits (e.g., 10 failures per email per 24h).
- **Fix time:** S (30-90 min)

#### [🟢 PASS] Email enumeration prevention on forgot-password
- **Confidence:** 95
- **Evidence:** `app/api/portal/auth/forgot-password/route.ts:74-81` — Returns identical success message whether the email exists or not. Token only generated server-side when the client is real + active.

#### [🟢 PASS] Reset tokens are SHA-256-hashed before storage
- **Confidence:** 95
- **Evidence:** `app/api/portal/auth/forgot-password/route.ts:19-21` — Tokens never stored raw; only the hash sits in `pyra_sessions`.

#### [🟢 PASS] Portal session tokens use 48-byte cryptographic random + hashed
- **Confidence:** 95
- **Evidence:** `lib/portal/auth.ts:16-28` — `randomBytes(48).toString('base64url')` (effectively 256 bits of entropy), SHA-256 hash in DB, raw token only in cookie.

#### [🟢 PASS] Password hashes use scrypt with random salt
- **Confidence:** 95
- **Evidence:** `lib/utils/password.ts:10-29` — scrypt with 16-byte salt, 64-byte key length. `timingSafeEqual` for verification. Industry-best (or near-best — argon2 is theoretically better, but scrypt is fine).

---

### 10. Authorization edge cases

#### [🟠 P1] WhatsApp webhook uses string equality (timing attack vulnerable)
- **Confidence:** 95
- **Evidence:** `app/api/dashboard/sales/whatsapp/webhook/route.ts:51` — `if (!WEBHOOK_SECRET || providedKey !== WEBHOOK_SECRET)`. Plain JavaScript `!==` comparison; not constant-time. Compare with `lib/utils/password.ts:28` which correctly uses `timingSafeEqual`.
- **Risk:** Network-level timing attack to recover the webhook secret byte-by-byte. Practical exploit difficulty depends on network jitter, but the principled fix is trivial.
- **Recommended fix:** Replace with `crypto.timingSafeEqual(Buffer.from(providedKey), Buffer.from(WEBHOOK_SECRET))`. Guard for length mismatch (returns early to prevent the function throwing).
- **Fix time:** XS (< 30 min)

#### [🟡 P2] External-auth helper uses standard string comparison after hash lookup
- **Confidence:** 75
- **Evidence:** `lib/api/external-auth.ts:14-28` — Hashes the user-provided key, then does `.eq('key_hash', keyHash)`. Postgres equality is not constant-time but the input has already been hashed so timing leaks expose the hash digest only — much less useful than the raw key. Lower severity.
- **Risk:** Theoretical — exposed hash gives a target for offline brute-force, but the key namespace (SHA-256 of a server-generated random) is effectively unsearchable.
- **Recommended fix:** Acceptable as-is; lower-priority backlog.
- **Fix time:** S (30-90 min if implementing as defense-in-depth)

#### [🟢 PASS] Stripe webhook signature verified BEFORE any DB write
- **Confidence:** 95
- **Evidence:** `app/api/stripe/webhook/route.ts:24-39` — Verification happens at lines 24-39; first DB write (line 56) is after `event = stripe.webhooks.constructEvent(...)` succeeds. No race conditions.

#### [🟢 PASS] API keys table has expiry + active flags
- **Confidence:** 95
- **Evidence:** `lib/api/external-auth.ts:25,30-31` — Filters `is_active=true` AND checks `expires_at < now`. Table schema (DATABASE-SCHEMA.md:1681-1684) includes both.

#### [🟢 PASS] No custom JWT parsing
- **Confidence:** 95
- **Evidence:** All authentication flows through Supabase Auth (`supabase.auth.getUser()`). No custom Bearer-token decoding anywhere in the codebase.

#### [🟢 PASS] Phase 14.2 scripts handle service-role key cleanly
- **Confidence:** 95
- **Evidence:** Scripts read from `.env.local` only (refuses to read from process.env or CLI). Errors with helpful message if missing or malformed (length check).

#### [🟢 PASS] All cron endpoints bypass auth gate only because they have their own auth
- **Confidence:** 90
- **Evidence:** `middleware.ts:154` exempts `/api/cron/*` from the Supabase Auth check. Both cron routes (`follow-up-reminders` and `lead-idle-check`) call `getExternalAuth(request)` at the top of the handler and check `cron.*` permission. The exemption is necessary because n8n calls them with x-api-key, not a Supabase session.

---

## Risk Matrix

| Finding | Likelihood | Impact | Priority |
|---|---|---|---|
| Legacy sales-leads `.or()` injection | Med (auth'd user) | High (cross-agent data exfil) | 🟠 P1 |
| Task description XSS via markdown injection | Med (any auth'd user can edit a task description) | High (account takeover via stolen session) | 🟠 P1 |
| WhatsApp webhook timing attack | Low (requires network sniffing) | Med (cred recovery) | 🟠 P1 |
| Password min-length inconsistency | High (user confusion) | Med (weak portal pw acceptance) | 🟠 P1 |
| 2FA secret stored unencrypted | Low (requires DB breach) | High (defeats 2FA) | 🟠 P1 |
| 2FA not enforced at login | High (any user with 2FA) | High (false security) | 🟠 P1 |
| No GDPR data export | Med (UAE PDPL applicable) | Med (compliance gap) | 🟠 P1 |
| No client self-erasure | Med (compliance gap) | Med | 🟠 P1 |
| No rate limit on POST /api/crm/leads | Low (auth'd user) | Low (DoS / DB bloat) | 🟠 P1 |
| `extra_permissions` no whitelist | Low (requires admin) | High (silent priv. escalation) | 🟡 P2 |
| In-memory rate limiter | Low (single-instance now) | Med (on scale-out) | 🟡 P2 |
| `pyra_error_logs` no retention | Med | Low | 🟡 P2 |
| PII regex misses unusual phones | Med | Low | 🟡 P2 |
| Dev-mode pw-reset token leak | Low (config-dependent) | High (if exploited) | 🟡 P2 |
| Local backups unencrypted | Low | High | 🟡 P2 |
| WhatsApp conv search partial sanitize | Low | Low | 🟡 P2 |
| No 2FA rate limit | Low | Med | 🟡 P2 |
| No per-account login lockout | Low | Med | 🟡 P2 |

---

## Top 5 priorities for next session

1. **Fix legacy sales-leads PostgREST injection** — `app/api/dashboard/sales/leads/route.ts` (lines 45, 87) + `/leads/export/route.ts:47` + `/whatsapp/conversations/route.ts:107`. Use the CRM route's pattern: `` escapePostgrestValue(`%${escapeLike(search)}%`) ``. **Time: S.**

2. **Fix task-description XSS in `components/boards/task-sheet.tsx:565-575`** — replace the `dangerouslySetInnerHTML` markdown converter with the safe JSX-based `<InlineMarkdown>` pattern from `file-preview.tsx:1463-1480`. Block `javascript:` href schemes explicitly. **Time: M.**

3. **Switch WhatsApp webhook to `timingSafeEqual`** — `app/api/dashboard/sales/whatsapp/webhook/route.ts:51`. One-liner change. **Time: XS.**

4. **Unify password minimum to 12 chars** — create `lib/constants/auth.ts` with `PASSWORD_MIN_LENGTH = 12`, import into 7 surfaces listed in Section 9. **Time: S.**

5. **Enforce 2FA at login + encrypt secret at rest** — `app/api/auth/login/route.ts` needs a 2-step flow when `two_factor_enabled=true`. Encrypt `two_factor_secret` via `TWO_FACTOR_ENCRYPTION_KEY`. **Time: M.**

---

## Areas verified clean (high confidence)

- CSRF protection coverage for all state-change endpoints + documented bypasses (Section 3)
- Central permission-build pipeline + no role bypass paths (Section 6)
- Stripe webhook signature verification before DB writes (Section 10)
- DOCX viewer HTML sanitization (Section 2)
- File upload defense-in-depth (size, MIME, extension, server-controlled path, SVG rejection) (Section 2)
- Phase 14.1 observability redaction layer for common PII shapes (Section 7)
- Service-role key strictly server-side (Section 5)
- Password hashing (scrypt + 16-byte salt + timingSafeEqual) (Section 9)
- Portal session token cryptography (48-byte randomness + SHA-256 hash) (Section 9)
- Email enumeration prevention on forgot-password (Section 9)
- External API key model (active flag + expires_at) (Section 10)
- Phase 14.2 migration scripts (escape correctness, .env.local-only secret read) (Section 1, 5)
- No raw `supabase.rpc()` user-input injection paths (Section 1)
- No client-side service-role-key leaks (Section 5)
- Admin DELETE user has cascade cleanup + own-account guard (Section 6)
- Lead attachment routes correctly stack 5+ defense layers (rate, perm, scope, body, MIME, ext, count, path, upload, DB, audit) (Section 2)

---

## v1.1 backlog candidates

- Per-account login lockout (in addition to per-IP)
- 2FA brute-force rate limit
- Redis-based rate limiter for horizontal-scale safety
- `pyra_error_logs` retention cron + cleanup job
- PII redaction: handle Arabic numerals + space-separated UAE phones
- GDPR-compliant data export endpoint
- Portal client self-erasure endpoint
- Local backup encryption wrapper (`gpg --symmetric` or `age`)
- Offsite backup (S3 + lifecycle)
- `extra_permissions` whitelist + reject `*` patterns
- Coolify-Postgres auto-backup encryption confirmation (operational with Abdou)
- WhatsApp conversation search switch to `escapePostgrestValue`
- External-auth key-hash compare timing-safe upgrade
- Sales-leads permission rename (v1.1 backlog already)
- Switch dev-mode token-leak gate to explicit `ENABLE_TEST_RESET_TOKEN` env var

---

## Audit methodology + limitations

**What was audited:**
- Manual read + grep across all 250+ API routes
- `middleware.ts`, `lib/auth/*`, `lib/api/*`, `lib/portal/auth.ts`, `lib/observability/log-error.ts`, `lib/utils/path.ts`, `lib/utils/password.ts`, `lib/utils/rate-limit.ts`
- All migration files (focused on 015, 014, 013, plus survey of bootstrap)
- Phase 14.2 scripts (`scripts/db-record-migration.ts`, `db-check-drift.ts`)
- All `dangerouslySetInnerHTML` occurrences (4 found, all reviewed)
- All `.or()` PostgREST filter calls (21 found, 4 raw-injection, audited each)
- All `target="_blank"` patterns (15+ instances, sampled 8 for `rel` attribute)
- All `createServiceRoleClient` call sites (100+ found, sampled 12 to confirm auth-gate precedence)
- All `requireApiPermission`/`getApiAuth` patterns
- 2FA route, login route, password-reset routes, forgot-password route, all webhooks
- DB schema for `pyra_api_keys`, `pyra_error_logs`, `pyra_users`, `pyra_sessions`

**What was NOT audited (out of scope for static read-only audit):**
- Third-party libraries beyond surface inspection (jsPDF, mammoth, Stripe SDK, Supabase SDK, otplib)
- Runtime fuzzing / dynamic security testing (no penetration testing)
- RLS policy correctness at the Postgres level (only code-side enforcement was reviewed)
- Coolify deployment configuration security
- HTTP security headers (CSP, HSTS, X-Frame-Options) — no Next.js `headers()` config sampled in this audit
- TLS / cipher configuration at Kong layer
- Client-side bundle inspection for accidental key leaks
- The Evolution API webhook payload validation beyond the secret check
- WhatsApp business-hours auto-reply logic (security implications minimal)

**Confirmed:** Zero mutating DB queries were run during this audit. All reads were file-system grep + file reads; no `pg/query`, no Supabase mutations, no permission writes.
