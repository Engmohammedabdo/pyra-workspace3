# Phase 4 Architecture Review — Client Portal Features

**Reviewer:** Code Architecture Reviewer (Claude)  
**Date:** 2026-02-15  
**Commit:** `a89e823`  
**Scope:** 11 API routes + 7 portal pages  

---

## Overall Score: 7.2 / 10

A solid Phase 4 with consistent patterns, proper auth checks, and good Arabic RTL UX. However, there are **2 critical data-shape mismatches** that will cause runtime failures, excessive `select('*')` usage, duplicated code across pages, and missing rate limiting on sensitive endpoints.

---

## Category Scores

| Category | Score | Notes |
|---|---|---|
| **TypeScript Quality** | 8/10 | Zero `any` types — excellent. Some `Record<string, unknown>` where proper interfaces would be better |
| **API Design** | 7/10 | Consistent response helpers, good HTTP status codes. `select('*')` overuse, no pagination |
| **Component Architecture** | 6/10 | Pages are monolithic (300-577 lines). Heavy code duplication across files/project-detail pages |
| **Query Patterns** | 7/10 | Proper company-scoped isolation. N+1 in dashboard. No pagination on lists |
| **Consistency** | 8/10 | Same auth pattern, same response helpers, same error handling across all routes |

---

## 🔴 Critical Issues (Must Fix Before Phase 5)

### 1. Dashboard Data Shape Mismatch — Page Will Not Render Stats

**File:** `app/portal/(main)/page.tsx:33-38` vs `app/api/portal/dashboard/route.ts:86-93`

The API returns snake_case keys:
```ts
// API returns:
{ active_projects, pending_approvals, unread_notifications, recent_projects, recent_notifications }
```

But the page expects camelCase nested under `stats`:
```ts
// Page expects:
{ stats: { activeProjects, pendingApprovals, unreadNotifications, totalFiles } }
```

**Impact:** Dashboard stats will always show 0. `totalFiles` is never returned by the API at all.

**Fix:** Either transform the API response to match the page interface, or update the page to use the API's actual response shape.

---

### 2. Files Page Expects Nested `project.files` — API Returns Flat Projects

**File:** `app/portal/(main)/files/page.tsx:118-130` vs `app/api/portal/projects/route.ts:26`

The Files page fetches `/api/portal/projects` and expects each project to have a `files` array:
```ts
if (project.files) {
  for (const file of project.files) { ... }
}
```

But the projects API returns `select('*')` which gives flat project rows — no nested `files`. The `allFiles` array will always be empty.

**Impact:** Files page shows "لا توجد ملفات" permanently regardless of actual data.

**Fix:** Either create a dedicated `/api/portal/files` endpoint that returns files with project info, or modify `/api/portal/projects` to include files via join/subquery.

---

### 3. Password Change Uses service_role signInWithPassword — Session Leak

**File:** `app/api/portal/profile/password/route.ts:57-67`

```ts
const { error: signInError } = await supabase.auth.signInWithPassword({
  email: fullClient.email,
  password: current_password,
});
// ...
await supabase.auth.signOut();
```

Using `signInWithPassword` on a **service_role client** creates a Supabase Auth session server-side that contaminates the service client's auth state. The `signOut()` call also happens on the service_role client, which may interfere with other concurrent requests.

**Impact:** Potential auth state corruption under concurrent requests.

**Fix:** Use a separate Supabase client instance (non-service-role) for password verification, or verify password via the Supabase admin API / bcrypt comparison instead.

---

## 🟡 Warnings (Should Fix Soon)

### 4. Excessive `select('*')` — Leaks All Columns

**Files:**
- `app/api/portal/dashboard/route.ts:70,78` — recent_projects and recent_notifications return ALL columns
- `app/api/portal/projects/route.ts:26` — returns all project columns
- `app/api/portal/projects/[id]/route.ts:37,53,62,81,89` — project, files, file_index, approvals, comments
- `app/api/portal/notifications/route.ts:27` — all notification columns

**Issue:** Returns potentially sensitive internal fields (e.g., `created_by`, internal metadata). Also transfers unnecessary data over the network.

**Fix:** Use explicit column selections like `select('id, name, status, description, updated_at')`.

---

### 5. N+1 Query Pattern in Dashboard

**File:** `app/api/portal/dashboard/route.ts:35-60`

The pending approvals count requires 3 sequential queries:
1. Get project IDs → 2. Get file IDs → 3. Count approvals

This could be a single query with joins or an RPC function.

**Fix:** Create a Supabase RPC function:
```sql
CREATE FUNCTION get_pending_approvals_count(company text) RETURNS integer ...
```

---

### 6. No Rate Limiting on Portal Profile/Password Endpoints

**File:** `app/api/portal/profile/password/route.ts` — No rate limiter

The login route correctly uses `loginLimiter`, but the password change endpoint has no rate limiting. An attacker with a valid session could brute-force current passwords.

**Fix:** Add rate limiter similar to login route.

---

### 7. No Pagination on List Endpoints

**Files:**
- `app/api/portal/projects/route.ts` — Returns ALL projects, no limit
- `app/api/portal/notifications/route.ts:34` — Hard limit of 50, no offset/cursor

**Issue:** Projects endpoint could return hundreds of rows for active clients.

**Fix:** Add `?page=1&per_page=20` or cursor-based pagination.

---

### 8. Massive Code Duplication

**Files:**
- `statusConfig` is duplicated identically in 3 files:
  - `app/portal/(main)/page.tsx:53-72`
  - `app/portal/(main)/projects/page.tsx:34-53`
  - `app/portal/(main)/projects/[id]/page.tsx:62-81`
- `approvalStatusConfig` is duplicated in 2 files:
  - `app/portal/(main)/projects/[id]/page.tsx:83-95`
  - `app/portal/(main)/files/page.tsx:57-69`
- `getFileIcon()` is duplicated identically in 2 files:
  - `app/portal/(main)/projects/[id]/page.tsx:97-110`
  - `app/portal/(main)/files/page.tsx:80-93`
- Revision dialog JSX + logic is duplicated between:
  - `app/portal/(main)/projects/[id]/page.tsx`
  - `app/portal/(main)/files/page.tsx`

**Fix:** Extract to shared modules:
```
lib/portal/constants.ts    → statusConfig, approvalStatusConfig
lib/portal/helpers.ts      → getFileIcon, getNotificationIcon
components/portal/revision-dialog.tsx
```

---

### 9. `Record<string, unknown>` Instead of Proper Types

**File:** `app/api/portal/projects/[id]/route.ts:58,77`

```ts
let fileIndexData: Record<string, unknown>[] = [];
let fileApprovals: Record<string, unknown>[] = [];
```

These should use the `PyraFileIndex` and `PyraFileApproval` types from `types/database.ts`.

---

### 10. CLIENT_SAFE_FIELDS Duplicated

**Files:**
- `lib/portal/auth.ts:13` — defines `CLIENT_SAFE_FIELDS`
- `app/api/portal/profile/route.ts:12` — defines identical `CLIENT_SAFE_FIELDS`
- `app/api/portal/auth/login/route.ts:13` — defines identical `CLIENT_SAFE_FIELDS`

**Fix:** Export from `lib/portal/auth.ts` and import elsewhere.

---

### 11. Silent Error Swallowing in Pages

**Files:** All 7 portal pages use `catch { // silently fail }` for data fetching.

While skeleton/empty states are shown, the user gets no indication of network errors vs empty data. Consider adding error state with a retry button.

---

### 12. No Input Sanitization on Search Parameters

**File:** `app/api/portal/projects/route.ts:31`

```ts
query = query.ilike('name', `%${search}%`);
```

The `search` parameter is used directly in the query. While Supabase parameterizes queries (preventing SQL injection), the `%` wildcard characters in the search string itself are not escaped, allowing pattern injection.

**Fix:** Escape `%` and `_` characters in the search string before interpolation.

---

## ✅ Good Practices Found

1. **Zero `any` types** across all 11 API routes and 7 pages — excellent TypeScript discipline
2. **Consistent auth pattern** — every API route starts with `getPortalSession()` check → `apiUnauthorized()` 
3. **Proper data isolation** — all project queries scoped by `client_company`, notifications by `client_id`
4. **Ownership verification** on file operations — file → project → company chain validation
5. **Consistent API response helpers** — all routes use `apiSuccess`, `apiError`, `apiUnauthorized`, etc.
6. **Safe field selection in profile** — `CLIENT_SAFE_FIELDS` explicitly excludes `password_hash`
7. **Proper HTTP status codes** — 201 for creation, 401/403/404/422 used correctly
8. **Arabic-first UX** — all UI text in Arabic, RTL-aware layout with `start`/`end` instead of `left`/`right`
9. **Responsive design** — mobile card layout + desktop table layout in files page
10. **Loading skeletons** — every page has proper skeleton states
11. **Optimistic UI updates** — notifications page updates state immediately without refetch
12. **JSDoc comments** on all API routes documenting purpose, params, and flow
13. **Email uniqueness check** in profile update with proper conflict handling
14. **Proper cookie security** — httpOnly, secure in production, sameSite: 'lax'

---

## 📋 Recommendations for Phase 5

### Architecture
1. **Extract shared portal constants/helpers** into `lib/portal/` — eliminate the duplication identified above
2. **Create a `usePortalFetch` hook** that handles auth errors (401 → redirect to login), loading states, and error states consistently
3. **Add portal API middleware** using Next.js middleware to validate session at the edge, reducing per-route boilerplate
4. **Implement SWR or React Query** for data fetching — provides caching, revalidation, and error retry

### API Quality
5. **Add pagination** to projects and notifications endpoints (`?page=1&limit=20`)
6. **Replace `select('*')` with explicit columns** in all portal API routes
7. **Create dedicated files endpoint** (`/api/portal/files`) instead of relying on nested data
8. **Add rate limiting** to password change and profile update endpoints
9. **Add input length validation** — comment text, profile fields (prevent 1MB text in comment body)

### Database
10. **Create Supabase RPC for dashboard stats** — single function call vs 6 sequential queries
11. **Add database indexes** for common query patterns: `pyra_projects(client_company)`, `pyra_client_notifications(client_id, is_read)`

### Component Architecture
12. **Break down page components** — extract `FileCard`, `CommentThread`, `NotificationItem` as reusable components
13. **Create `RevisionDialog` component** shared between files and project-detail pages
14. **Add error boundaries** around portal pages

### Security
15. **Fix the signInWithPassword session leak** in password change (Critical #3)
16. **Add CSRF protection** for state-changing operations (POST/PATCH)
17. **Add audit logging** for file approvals and password changes

---

## Summary

Phase 4 delivers a functional client portal with consistent patterns and good TypeScript discipline. The **2 critical data-shape mismatches** (dashboard stats + files page) will cause visible runtime failures and must be fixed immediately. The password change auth flow should also be refactored for safety. Beyond those, the main improvements are around code deduplication, pagination, and breaking down monolithic page components. The architecture is on a solid foundation — Phase 5 should focus on extracting shared code and adding the data-fetching layer (SWR/React Query) before the codebase grows further.
