# 🔒 Pyra Workspace 3.0 — API Security & Completeness Review

**Date:** 2026-02-15  
**Repo:** github.com/Engmohammedabdo/pyra-workspace3  
**Reviewer:** Bayra (Automated Security Audit)  
**Total Endpoints:** 40 route handlers across 24 route files

---

## Summary Scorecard

| # | Area | Score | Status |
|---|------|-------|--------|
| 1 | Auth Guards | 8/10 | 🟢 Good |
| 2 | Input Validation | 7/10 | 🟡 Fair |
| 3 | Response Format | 8/10 | 🟢 Good |
| 4 | HTTP Methods | 9/10 | 🟢 Excellent |
| 5 | Error Handling | 8/10 | 🟢 Good |
| 6 | File Operations Security | 7/10 | 🟡 Fair |
| 7 | SQL/Query Safety | 8/10 | 🟢 Good |
| 8 | Missing Endpoints | 6/10 | 🟡 Fair |
| 9 | Rate Limiting | 2/10 | 🔴 Critical |
| 10 | CORS/Headers | 8/10 | 🟢 Good |
| | **Overall** | **7.1/10** | 🟡 |

---

## 1. Auth Guards — 8/10 🟢

### ✅ What's Done Right
- **Two-tier auth:** `getApiAuth()` (any authenticated user) and `getApiAdmin()` (admin only) consistently applied
- **Middleware protection:** `middleware.ts` blocks unauthenticated API calls (except `/api/health` and `/api/auth/*`)
- **Role-based access:** Admin-only endpoints (users CRUD, clients, settings, trash, activity) properly guarded
- **Ownership checks:** Notifications verify `recipient_username`, comments check author before delete

### ⚠️ Issues Found

| Endpoint | Issue | Severity |
|----------|-------|----------|
| `GET /api/shares/download/[token]` | **Intentionally public** (no auth) — correct for share links, but no rate limiting | Low |
| `GET /api/health` | Public — correct | None |
| `POST /api/auth/logout` | No auth check — anyone can call it (harmless but sloppy) | Low |
| `GET /api/auth/session` | No `getApiAuth()` — uses raw Supabase check, inconsistent pattern | Low |
| **Middleware gap** | `/api/shares/download/*` bypasses middleware auth (starts with `/api` but needs to be public) — works because the route itself handles token validation | Info |

### 🔍 Detail
The middleware exempts `/api/auth` and `/api/health` but NOT `/api/shares/download`. This means middleware blocks unauthenticated share downloads — **potential bug!** The share download endpoint will never be reached by unauthenticated users unless the middleware session refresh happens to pass through.

**Recommendation:** Add `/api/shares/download` to `publicRoutes` in middleware.

---

## 2. Input Validation — 7/10 🟡

### ✅ Strengths
- Required field checks on all POST/PATCH endpoints
- Type checking (e.g., `typeof file_id !== 'string'`)
- Enum validation for statuses (`approved`, `revision_requested`, etc.)
- Pagination limits capped (`Math.min(100, ...)`, `Math.min(200, ...)`)
- File size limit: 100MB enforced on upload
- Batch delete capped at 50 items
- Password minimum length: 6 characters
- Duplicate checks (email, username, existing approvals)

### ⚠️ Issues Found

| Endpoint | Issue | Severity |
|----------|-------|----------|
| `GET /api/clients` | Search param injected directly into `.or()` filter: `name.ilike.%${search}%` — potential PostgREST filter injection | **Medium** |
| `GET /api/projects` | Same issue with `search` param in `.or()` | **Medium** |
| `GET /api/users` | Same issue with `search` param in `.or()` | **Medium** |
| `GET /api/activity` | `targetPath` used in `.ilike('target_path', \`%${targetPath}%\`)` — same risk | **Medium** |
| `POST /api/shares` | `expires_in_hours` not validated as positive number, `max_downloads` not bounded | Low |
| `POST /api/comments` | `attachments` array contents not validated (could contain anything) | Medium |
| `POST /api/projects/[id]/files` | `file_type` not validated against allowed types | Low |
| `PATCH /api/teams/[id]` | `permissions` object not schema-validated | Low |
| **All endpoints** | No request body size limit (beyond Next.js defaults) | Low |
| `POST /api/users` | Username regex not enforced — only length ≥ 3, could contain spaces/special chars | Low |

**Critical:** The `.or()` filter injection allows a malicious user to craft search strings like `%,id.eq.1` that could alter the PostgREST query semantics. While Supabase client somewhat escapes this, it's not guaranteed.

**Recommendation:** Sanitize all user inputs used in `.ilike()` and `.or()` by escaping `%`, `_`, and `,` characters.

---

## 3. Response Format — 8/10 🟢

### ✅ Strengths
- Consistent `{ data, error, meta }` format via `apiSuccess()`, `apiError()` helpers
- Proper HTTP status codes: 200, 201, 400, 401, 403, 404, 410, 422, 500
- Null fields included (error: null on success, data: null on error)

### ⚠️ Issues Found

| Endpoint | Issue | Severity |
|----------|-------|----------|
| `POST /api/auth/login` | Returns `{ success, user }` — **NOT** the standard `{ data, error, meta }` format | Medium |
| `POST /api/auth/logout` | Returns `{ success: true }` — inconsistent | Medium |
| `GET /api/auth/session` | Returns `{ authenticated, user, profile }` — inconsistent | Medium |
| `GET /api/health` | Returns `{ status, timestamp, version }` — acceptable for health checks | None |
| `GET /api/files/download/[...path]` | Returns raw binary — correct for file streaming | None |

**3 of 4 auth endpoints use non-standard format.** Since these are used by the frontend login flow, this may be intentional but breaks consistency.

---

## 4. HTTP Methods — 9/10 🟢

### ✅ All correct:
- **GET** for reads/listing — ✅
- **POST** for creation — ✅
- **PATCH** for partial updates — ✅ (not PUT — good choice)
- **DELETE** for removal — ✅

### ⚠️ Minor Issues

| Endpoint | Issue | Severity |
|----------|-------|----------|
| `POST /api/trash/[id]` | Uses POST for restore — semantically could be PATCH | Nitpick |
| `POST /api/files/delete-batch` | Uses POST for batch delete — acceptable pattern | None |
| `POST /api/notifications/read-all` | Uses POST for bulk update — could be PATCH | Nitpick |

---

## 5. Error Handling — 8/10 🟢

### ✅ Strengths
- Every handler wrapped in try/catch
- Errors logged to `console.error()` with context
- Generic `apiServerError()` returned to clients (no stack traces leaked)
- Database errors caught and translated to user-friendly Arabic messages
- Non-critical failures handled gracefully (e.g., auth deletion failure after client deletion)

### ⚠️ Issues Found

| Issue | Detail | Severity |
|-------|--------|----------|
| Supabase error messages leaked | `POST /api/clients`: `authError.message` forwarded to client | Medium |
| Auth error forwarded | `POST /api/auth/login`: `error.message` from Supabase Auth sent to client | Medium |
| Password update error | `POST /api/users/[username]/password`: `updateError.message` sent to client | Medium |
| `console.error` in production | All errors logged with full objects — could contain sensitive data in logs | Low |
| No request ID tracking | No correlation ID for debugging distributed issues | Low |

**Recommendation:** Never forward raw Supabase/auth error messages to clients. Map them to generic messages.

---

## 6. File Operations Security — 7/10 🟡

### ✅ Strengths
- **Path traversal prevention:** `sanitizePath()` strips `..`, leading slashes, null bytes, and special characters
- **File name sanitization:** `sanitizeFileName()` replaces dangerous chars, caps at 255 chars
- **Upload size limit:** 100MB per file enforced
- **Batch delete limit:** 50 files max
- **Soft delete:** Files moved to `.trash/` with auto-purge after 30 days
- **Content-Disposition:** Proper `attachment`/`inline` headers
- **X-Content-Type-Options: nosniff** on downloads

### ⚠️ Issues Found

| Issue | Detail | Severity |
|-------|--------|----------|
| **No file type validation** | Any file type can be uploaded — no allowlist/blocklist for extensions or MIME types | **High** |
| **No antivirus scanning** | Uploaded files not scanned for malware | Medium |
| **Path traversal incomplete** | `sanitizePath` strips `..` but doesn't handle URL-encoded variants (`%2e%2e`) — though URL decoding likely happens before | Low |
| **No per-user storage quota** | Any authenticated user can upload unlimited files up to 100MB each | Medium |
| **Share link password weakness** | Uses base64 encoding (NOT hashing) — trivially reversible | **High** |
| **Folder creation unbounded** | No limit on folder depth or count | Low |
| **File overwrite** | `upsert: true` on upload — existing files silently overwritten | Medium |

**Critical:** Share link passwords stored as base64 is NOT a hash. Anyone with DB read access can decode all share passwords. Use bcrypt or argon2.

---

## 7. SQL/Query Safety — 8/10 🟢

### ✅ Strengths
- **No raw SQL** — all queries through Supabase JS client
- **Parameterized by design** — Supabase client handles escaping for `.eq()`, `.in()`, etc.
- **Service role client** used only where needed (file storage, admin user management)
- **Regular client** (with RLS) used for most operations

### ⚠️ Issues Found

| Issue | Detail | Severity |
|-------|--------|----------|
| **PostgREST filter injection** | `.or()` and `.ilike()` with unsanitized user input (see Input Validation #2) | **Medium** |
| **Service role overuse** | `createServiceRoleClient()` in clients route — bypasses RLS entirely | Medium |
| **No RLS verification** | Can't confirm RLS policies are properly configured from API code alone | Info |
| **N+1 queries** | Batch delete processes files sequentially — could be optimized | Low (performance) |

---

## 8. Missing Endpoints — 6/10 🟡

### Present (✅)
- Auth (login/logout/session)
- Users CRUD + password change + lite list
- Clients CRUD
- Projects CRUD + file assignment
- Files (list, upload, download, rename, move, delete, batch delete, search, folders)
- Approvals (submit, list, review)
- Comments (CRUD, read status)
- Reviews (CRUD, resolve)
- Notifications (list, create, read, read-all, delete)
- Share links (create, list, deactivate, public download)
- Teams (CRUD + members)
- Trash (list, restore, purge)
- Settings (get/update)
- Activity log
- Dashboard stats
- Health check

### Missing (❌)

| Feature | Expected For Workspace/CRM | Priority |
|---------|---------------------------|----------|
| **Quotes/Invoicing API** | DB has `pyra_quotes` table but no API endpoints | High |
| **Bulk operations** | Only batch delete exists — no bulk move, bulk assign, bulk status update | Medium |
| **Audit log export** | Can list activity but can't export as CSV/PDF | Medium |
| **User sessions management** | No way to list/revoke active sessions | Medium |
| **Password reset flow** | No forgot-password/reset-token endpoint | High |
| **Two-factor authentication** | No 2FA setup/verify endpoints | Medium |
| **File versioning** | Upload overwrites — no version history | Medium |
| **Webhooks** | No webhook configuration for integrations | Low |
| **Search across entities** | Global search only covers files, not projects/clients/users | Low |
| **Client portal API** | Clients exist but no dedicated client-facing endpoints (separate from admin) | Medium |
| **Pagination on all lists** | Teams, shares, reviews lack pagination | Low |
| **File preview/thumbnail** | No thumbnail generation endpoint | Low |

---

## 9. Rate Limiting — 2/10 🔴

### ❌ Critical Gap

**There is NO rate limiting anywhere in the codebase.**

| Risk | Detail | Impact |
|------|--------|--------|
| **Brute force login** | `/api/auth/login` has no attempt limiting | **Critical** |
| **Share link password brute force** | `/api/shares/download/[token]?password=` — unlimited attempts | **Critical** |
| **File upload abuse** | Unlimited uploads, 100MB each | High |
| **API flooding** | Any authenticated user can spam all endpoints | High |
| **Search abuse** | `/api/files/search` with complex queries could be expensive | Medium |

**Recommendations:**
1. Add rate limiting middleware (e.g., `@upstash/ratelimit` with Redis, or in-memory)
2. Login: max 5 attempts per 15 minutes per IP
3. Share download: max 10 password attempts per token per hour
4. Upload: max 50 files per hour per user
5. General API: 100 requests per minute per user

---

## 10. CORS/Headers — 8/10 🟢

### ✅ Strengths (in `next.config.ts`)
- **X-Frame-Options: DENY** — prevents clickjacking
- **X-Content-Type-Options: nosniff** — prevents MIME sniffing
- **Referrer-Policy: strict-origin-when-cross-origin** — good default
- **Content-Security-Policy** — comprehensive CSP with proper sources
- **X-DNS-Prefetch-Control: on** — performance optimization

### ⚠️ Issues Found

| Issue | Detail | Severity |
|-------|--------|----------|
| **No explicit CORS config** | Relies on Next.js same-origin default — fine if API is same-domain only | Low |
| **CSP allows unsafe-eval** | `script-src 'self' 'unsafe-eval' 'unsafe-inline'` — weakens XSS protection significantly | **High** |
| **No Strict-Transport-Security** | Missing HSTS header for HTTPS enforcement | Medium |
| **No Permissions-Policy** | Missing camera/microphone/geolocation restrictions | Low |
| **No Cache-Control on API** | API responses not explicitly set to `no-store` (except file download) | Low |
| **Share downloads** | `Cache-Control: no-store` ✅ — correctly prevents caching of shared files | None |

**Recommendation:** Remove `unsafe-eval` and `unsafe-inline` from CSP if possible. Add `Strict-Transport-Security: max-age=31536000; includeSubDomains`.

---

## 🏗️ Architecture Observations

### Positive Patterns
1. **Clean separation:** Auth, response helpers, path utilities in dedicated files
2. **Activity logging:** Comprehensive audit trail on most operations
3. **Soft delete:** Trash system with auto-purge — professional approach
4. **Notification system:** Both internal and client-facing notifications
5. **Service role isolation:** Only used for storage and admin auth operations
6. **Arabic UI messages:** Proper i18n for error messages

### Concerns
1. **`password_hash` field in clients table** actually stores Supabase Auth user ID — misleading column name
2. **Sequential processing** in batch operations — should use `Promise.allSettled()`
3. **No transaction support** — multi-step operations (create user + auth + mapping) could leave orphans on partial failure
4. **Activity log inserts** are fire-and-forget (`await` but no error handling on failure)

---

## 🚨 Top 5 Priorities

1. **🔴 Add rate limiting** — especially login and share download (Critical)
2. **🔴 Fix share link password storage** — replace base64 with bcrypt (Critical)
3. **🟠 Sanitize search inputs** — escape PostgREST filter characters in `.or()` calls (High)
4. **🟠 Add file type validation** — allowlist/blocklist for uploads (High)
5. **🟠 Remove unsafe-eval from CSP** — strengthens XSS protection (High)

---

*Report generated from full source code analysis of all 24 route files in `app/api/`.*
