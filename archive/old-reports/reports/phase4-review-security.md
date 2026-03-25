# Phase 4 Security Review — Pyra Workspace 3.0

**Reviewer:** AI Security Reviewer  
**Date:** 2026-02-15  
**Commit:** `a89e823` — Phase 4: Client Portal Features  
**Scope:** 11 portal API routes + portal UI pages  

---

## Security Score: 7/10

Phase 4 demonstrates **solid foundational security** — every API route checks sessions, data isolation by company is consistently applied, and password hashes are never returned. However, several **critical and high-risk** issues need fixing before Phase 5.

---

## Critical Vulnerabilities 🔴

### 1. Client Can Change Their Own `company` Field — Data Isolation Bypass
**File:** `app/api/portal/profile/route.ts:77-81`

The PATCH profile endpoint allows clients to update their `company` field. Since **all data isolation** (projects, files, approvals, comments) is based on `client_company === client.company`, a malicious client can change their company to match another client's company and **access all their projects, files, and data**.

```typescript
// VULNERABLE — line 77
if (company !== undefined) {
  if (!company.trim()) {
    return apiValidationError('اسم الشركة مطلوب');
  }
  updates.company = company.trim(); // ← Client can set ANY company name
}
```

**Proof of Concept:**
```bash
# Client from "CompanyA" changes their company to "CompanyB"
curl -X PATCH /api/portal/profile \
  -H "Cookie: pyra_portal_session=..." \
  -d '{"company": "CompanyB"}'

# Now all queries filter by "CompanyB" — full access to CompanyB's data
curl /api/portal/projects  # Returns CompanyB's projects
curl /api/portal/files/FILE_ID/download  # Downloads CompanyB's files
```

**Fix:**
```typescript
// Remove company from allowed update fields entirely:
export async function PATCH(request: NextRequest) {
  // ...
  const { name, email, phone } = body;  // Remove 'company'
  // Do NOT allow company updates from portal
}
```

---

### 2. `password_hash` Field Stores Auth User ID — Column Named Misleadingly but Used as Auth UID
**File:** `app/api/portal/profile/password/route.ts:47-48` and `app/api/portal/profile/route.ts:103`

The `password_hash` column actually stores the **Supabase Auth user UUID**. This UUID is fetched in the profile route and the password change route. While it's not returned to the client in GET responses (good), the field name creates dangerous confusion and the UUID is used directly in `updateUserById`.

If any future code accidentally returns `password_hash` thinking it's a hash (and thus safe to expose), it would leak the Supabase Auth UUID, enabling account takeover via admin API if combined with other vulnerabilities.

**Risk Level:** Critical (architectural — rename recommended before it causes a real leak).

**Fix:** Rename column to `auth_user_id` in database migration.

---

## High Risk 🟠

### 3. No Rate Limiting on Password Change
**File:** `app/api/portal/profile/password/route.ts`

The password change endpoint has **no rate limiting**. An attacker with a stolen session cookie can brute-force the current password.

Login has rate limiting (5/15min), forgot-password has rate limiting (3/hr), but password change does not.

**Fix:**
```typescript
import { createRateLimiter, getClientIp } from '@/lib/utils/rate-limit';

const passwordChangeLimiter = createRateLimiter('portal-password-change', {
  maxRequests: 3,
  windowMs: 15 * 60 * 1000,
});

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);
  const rateCheck = passwordChangeLimiter.check(clientIp);
  if (rateCheck.limited) {
    return apiError('تجاوزت الحد المسموح', 429);
  }
  // ... rest of handler
}
```

### 4. Search Parameter Passed Directly to `ilike` — Potential Supabase Pattern Injection
**File:** `app/api/portal/projects/route.ts:27`

```typescript
if (search) {
  query = query.ilike('name', `%${search}%`);
}
```

The `search` parameter is interpolated directly into the `ilike` pattern. While Supabase's JS client uses parameterized queries (preventing SQL injection), the `%` and `_` wildcard characters in `LIKE`/`ILIKE` patterns are **not escaped**. A user can craft patterns like `%` (match everything) or use `_` wildcards for pattern-based data enumeration.

This is **low-to-medium risk** because queries are already company-scoped, but it's still poor practice.

**Fix:**
```typescript
function escapeLikePattern(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

if (search) {
  query = query.ilike('name', `%${escapeLikePattern(search)}%`);
}
```

### 5. No Input Length Limits on Comment Text
**File:** `app/api/portal/projects/[id]/comments/route.ts:50-63`

Comment text is only checked for being non-empty. There's no maximum length validation. A malicious client could insert megabytes of text per comment, causing storage bloat and potential rendering issues.

**Fix:**
```typescript
if (!text?.trim()) {
  return apiValidationError('نص التعليق مطلوب');
}
if (text.trim().length > 5000) {
  return apiValidationError('التعليق طويل جداً (الحد الأقصى 5000 حرف)');
}
```

### 6. No XSS Sanitization on Comment Text or Profile Fields
**Files:** 
- `app/api/portal/projects/[id]/comments/route.ts:63`
- `app/api/portal/profile/route.ts:70-81`

Comment text and profile fields (name, phone, company) are stored as-is. If these are rendered in the admin dashboard without proper escaping (via `dangerouslySetInnerHTML` or similar), stored XSS is possible.

React's JSX auto-escapes by default, which mitigates this **if** all rendering uses `{variable}` and never `dangerouslySetInnerHTML`. However, defense-in-depth recommends server-side sanitization.

**Fix:**
```typescript
import DOMPurify from 'isomorphic-dompurify';
// or simple strip: text.replace(/<[^>]*>/g, '')
```

---

## Medium Risk 🟡

### 7. Session Token Predictability — Custom ID Generator
**File:** `lib/portal/auth.ts:20`

Session tokens are generated via `generateId('ps')`. Without reviewing `generateId`, if it uses `nanoid` or `crypto.randomUUID`, it's fine. If it uses timestamp-based or sequential IDs, session tokens could be guessable.

**Recommendation:** Verify `generateId` uses cryptographically secure randomness (at least 128 bits of entropy).

### 8. Session Cookie Not Invalidated on Password Change
**File:** `app/api/portal/profile/password/route.ts`

After a successful password change, existing sessions are **not invalidated**. If an attacker has stolen a session, changing the password doesn't kick them out.

**Fix:** After password change, delete all sessions for the client except the current one:
```typescript
// After successful password change:
await supabase
  .from('pyra_sessions')
  .delete()
  .eq('username', client.id)
  .neq('token', currentSessionToken);
```

### 9. Portal Sessions Share `pyra_sessions` Table with Admin
**File:** `lib/portal/auth.ts:23-30`

Portal sessions and admin sessions use the same `pyra_sessions` table (admin stores username, portal stores clientId in the `username` field). While cookie names are different, this creates potential confusion and makes it harder to audit sessions separately.

**Recommendation:** Add a `session_type` column (`'admin'` | `'portal'`) for clear separation.

### 10. Minimum Password Length Only 6 Characters
**File:** `app/api/portal/profile/password/route.ts:28-30`

```typescript
if (new_password.length < 6) {
  return apiValidationError('...');
}
```

6 characters is below modern recommendations. NIST SP 800-63B recommends minimum 8 characters.

**Fix:** Change to `< 8` and add maximum length check (e.g., 128) to prevent bcrypt DoS.

### 11. `file_path` Used Directly in Supabase Storage — No Path Traversal Validation
**File:** `app/api/portal/files/[id]/download/route.ts:48-49`

```typescript
const { data: signedUrlData } = await supabase.storage
  .from('pyraai-workspace')
  .createSignedUrl(projectFile.file_path, 60 * 5);
```

The `file_path` comes from the database (not user input), so this is safe **as long as** file paths are validated when files are created. However, if an admin or other process inserts a malicious path like `../../secrets/config`, it could expose unintended files.

**Recommendation:** Validate that `file_path` doesn't contain `..` or start with `/`:
```typescript
if (projectFile.file_path.includes('..') || projectFile.file_path.startsWith('/')) {
  return apiForbidden('مسار الملف غير صالح');
}
```

### 12. In-Memory Rate Limiter Resets on Restart
**File:** `lib/utils/rate-limit.ts`

Rate limiting uses an in-memory `Map`. This resets on server restart/deploy and doesn't work across multiple instances. An attacker can bypass rate limiting by waiting for a deploy or targeting different instances.

**Recommendation:** Migrate to Redis-based rate limiting for production (acknowledged in code comments).

---

## Low Risk 🟢

### 13. Debug Token Leaked in Development Mode
**File:** `app/api/portal/auth/forgot-password/route.ts:96-101`

Reset tokens are returned in the response when `NODE_ENV !== 'production'`. This is standard dev practice but should be triple-checked before production deployment.

### 14. No CSRF Protection on Mutation Endpoints
Portal uses cookie-based auth with `sameSite: 'lax'`. While `lax` prevents CSRF on POST requests from cross-origin sites, it doesn't protect against same-site attacks or GET-based state changes. All mutations use POST/PATCH which is good, but explicit CSRF tokens would add defense-in-depth.

### 15. `signInWithPassword` Side Effect in Password Change
**File:** `app/api/portal/profile/password/route.ts:42-46`

The password change flow calls `supabase.auth.signInWithPassword()` to verify the current password, creating a Supabase Auth session as a side effect. While `signOut()` is called immediately after, there's a brief window where a Supabase Auth session exists. A cleaner approach would be to use bcrypt comparison directly.

### 16. No Pagination on Projects List
**File:** `app/api/portal/projects/route.ts`

The projects endpoint has no `limit` or pagination. For clients with hundreds of projects, this could cause performance issues.

---

## Security Best Practices Found ✅

1. **✅ Every API route checks `getPortalSession()`** — no unprotected endpoints
2. **✅ Company-scoped data isolation** on projects, files, approvals (via `client_company`)  
3. **✅ Client-scoped notifications** filtered by `client_id`
4. **✅ `password_hash` never returned** in API responses (explicit `CLIENT_SAFE_FIELDS`)
5. **✅ Rate limiting on login** (5/15min per IP) and forgot-password (3/hr per email)
6. **✅ Email enumeration prevention** — forgot-password always returns success
7. **✅ Session cookies are httpOnly, secure (in production), sameSite: lax**
8. **✅ Old password verified before change** via Supabase Auth
9. **✅ Consistent error response format** via `apiSuccess`/`apiError` helpers
10. **✅ Generic error messages** — no DB schema leaks in client-facing errors
11. **✅ Signed URLs for file downloads** with 5-minute expiry
12. **✅ File ownership verified** before download/approve/revision
13. **✅ Service role key only used server-side** — never exposed to client
14. **✅ Session expiry enforced** (30 days + checked on each request)
15. **✅ Inactive clients blocked** from login and session validation

---

## Recommended Fixes — Priority Order

| # | Severity | Issue | Effort |
|---|----------|-------|--------|
| 1 | 🔴 Critical | Remove `company` from PATCH /profile | 5 min |
| 2 | 🔴 Critical | Rename `password_hash` → `auth_user_id` | 30 min (migration) |
| 3 | 🟠 High | Add rate limiting to password change | 10 min |
| 4 | 🟠 High | Add max length on comment text | 5 min |
| 5 | 🟠 High | Sanitize comment text (strip HTML) | 15 min |
| 6 | 🟠 High | Escape LIKE wildcards in search | 5 min |
| 7 | 🟡 Medium | Invalidate sessions on password change | 15 min |
| 8 | 🟡 Medium | Increase minimum password length to 8 | 2 min |
| 9 | 🟡 Medium | Add path traversal check on file download | 5 min |
| 10 | 🟡 Medium | Add `session_type` column | 20 min (migration) |

### Quick Win — Fix #1 (Critical):
```diff
// app/api/portal/profile/route.ts — PATCH handler
- const { name, email, phone, company } = body;
+ const { name, email, phone } = body;
+ // NOTE: company is NOT updatable from portal — it's set by admin only

  // Remove the entire company update block (lines 77-81)
- if (company !== undefined) {
-   if (!company.trim()) {
-     return apiValidationError('اسم الشركة مطلوب');
-   }
-   updates.company = company.trim();
- }
```

---

## Summary

The Phase 4 implementation shows **strong security awareness** — consistent session checks, company-scoped queries, safe field selection, and rate limiting on auth endpoints. The **one critical vulnerability** (company field update) is a straightforward fix. The high-risk items are mostly missing validation/sanitization that should be added before Phase 5. Overall, the codebase is well-structured for security and the patterns are consistent across all 11 endpoints.
