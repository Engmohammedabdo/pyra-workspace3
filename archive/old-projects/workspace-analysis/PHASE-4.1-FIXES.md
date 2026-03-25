# Phase 4.1 — Critical & High-Priority Fixes

> **Priority:** Must complete ALL before proceeding to Phase 5
> **Estimated effort:** 1-2 hours
> **Commit message:** `fix: Phase 4.1 — security fixes + broken pages + code dedup`

---

## 🔴 CRITICAL FIXES (4)

### Fix 1: Data Isolation Bypass — Remove `company` from Profile Update
**File:** `app/api/portal/profile/route.ts`
**Problem:** PATCH endpoint allows clients to change their `company` field. Since ALL data queries filter by `client_company`, a client can set their company to another client's company and access ALL their data (projects, files, approvals, comments).
**Fix:**
```diff
// PATCH handler — remove 'company' from destructured body
- const { name, email, phone, company } = body;
+ const { name, email, phone } = body;
+ // SECURITY: company is NOT updatable from portal — admin-only field

// Remove the entire company update block:
- if (company !== undefined) {
-   if (!company.trim()) {
-     return apiValidationError('اسم الشركة مطلوب');
-   }
-   updates.company = company.trim();
- }
```

### Fix 2: Dashboard Data Shape Mismatch — Stats Always Show 0
**File:** `app/portal/(main)/page.tsx` AND `app/api/portal/dashboard/route.ts`
**Problem:** API returns snake_case flat object (`active_projects`, `pending_approvals`, `unread_notifications`), but the page expects camelCase nested under `stats` key (`stats.activeProjects`, `stats.totalFiles`). Also `totalFiles` is never returned by API.
**Fix (choose ONE approach):**

**Option A (Recommended — fix the page to match the API):**
Update the page component to use the actual API response shape:
- Change `data.stats.activeProjects` → `data.active_projects`
- Change `data.stats.pendingApprovals` → `data.pending_approvals`
- Change `data.stats.unreadNotifications` → `data.unread_notifications`
- Either add `total_files` to the API response (count from `pyra_project_files` for the client's company), or remove `totalFiles` from the dashboard

**Option B (fix the API to match the page):**
Transform the API response to match what the page expects:
```typescript
return apiSuccess({
  stats: {
    activeProjects: activeCount,
    pendingApprovals: pendingCount,
    unreadNotifications: unreadCount,
    totalFiles: totalFilesCount, // ADD this query
  },
  recent_projects: recentProjects,
  recent_notifications: recentNotifications,
});
```

### Fix 3: Files Page Broken — Always Shows Empty
**File:** `app/portal/(main)/files/page.tsx` AND potentially `app/api/portal/projects/route.ts`
**Problem:** Files page fetches `/api/portal/projects` and expects `project.files` nested array, but the API returns flat project rows without files. `allFiles` array is always empty → page permanently shows "لا توجد ملفات".
**Fix:** Create a dedicated portal files API endpoint:

Create **`app/api/portal/files/route.ts`**:
```typescript
// GET /api/portal/files — returns all files for client's projects
export async function GET(request: NextRequest) {
  const session = await getPortalSession(request);
  if (!session) return apiUnauthorized();

  const supabase = createServiceClient();
  const { data: client } = await supabase
    .from('pyra_clients')
    .select('company')
    .eq('id', session.clientId)
    .single();

  if (!client) return apiUnauthorized();

  // Get all project IDs for client's company
  const { data: projects } = await supabase
    .from('pyra_projects')
    .select('id, name, status')
    .eq('client_company', client.company);

  if (!projects?.length) return apiSuccess({ files: [] });

  const projectIds = projects.map(p => p.id);

  // Get all files for these projects
  const { data: files } = await supabase
    .from('pyra_project_files')
    .select('*')
    .in('project_id', projectIds)
    .order('created_at', { ascending: false });

  // Get approvals for these files
  const fileIds = (files || []).map(f => f.id);
  const { data: approvals } = await supabase
    .from('pyra_file_approvals')
    .select('*')
    .in('file_id', fileIds);

  // Enrich files with project name and approval status
  const enrichedFiles = (files || []).map(file => {
    const project = projects.find(p => p.id === file.project_id);
    const approval = (approvals || []).find(a => a.file_id === file.id);
    return {
      ...file,
      project_name: project?.name || '',
      project_status: project?.status || '',
      approval_status: approval?.status || null,
      approval_comment: approval?.comment || null,
    };
  });

  return apiSuccess({ files: enrichedFiles });
}
```

Then update `files/page.tsx` to fetch from `/api/portal/files` instead of `/api/portal/projects`.

### Fix 4: Password Change Session Leak
**File:** `app/api/portal/profile/password/route.ts`
**Problem:** Uses `signInWithPassword` on the service_role client to verify current password, creating server-side auth state that can corrupt concurrent requests. `signOut()` call also affects the service client.
**Fix:** Use a separate throwaway Supabase client for password verification:
```typescript
import { createClient } from '@supabase/supabase-js';

// Create a SEPARATE client just for password verification (not the service_role one)
const verifyClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const { error: signInError } = await verifyClient.auth.signInWithPassword({
  email: fullClient.email,
  password: current_password,
});

// Clean up the throwaway client's session
await verifyClient.auth.signOut();
```

---

## 🟠 HIGH-PRIORITY FIXES (6)

### Fix 5: Rate Limiting on Password Change
**File:** `app/api/portal/profile/password/route.ts`
**Fix:** Add rate limiter (same pattern as login):
```typescript
import { createRateLimiter, getClientIp } from '@/lib/utils/rate-limit';

const passwordChangeLimiter = createRateLimiter('portal-password-change', {
  maxRequests: 3,
  windowMs: 15 * 60 * 1000, // 3 attempts per 15 min
});

// At start of POST handler:
const clientIp = getClientIp(request);
const rateCheck = passwordChangeLimiter.check(clientIp);
if (rateCheck.limited) {
  return apiError('تجاوزت الحد المسموح. حاول بعد قليل', 429);
}
```

### Fix 6: LIKE Wildcard Escape in Search
**File:** `app/api/portal/projects/route.ts`
**Fix:** Add escape function:
```typescript
function escapeLikePattern(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

// In the query:
if (search) {
  query = query.ilike('name', `%${escapeLikePattern(search)}%`);
}
```

### Fix 7: Comment Text Max Length
**File:** `app/api/portal/projects/[id]/comments/route.ts`
**Fix:** Add validation after empty check:
```typescript
if (!text?.trim()) {
  return apiValidationError('نص التعليق مطلوب');
}
if (text.trim().length > 5000) {
  return apiValidationError('التعليق طويل جداً (الحد الأقصى 5000 حرف)');
}
```

### Fix 8: Minimum Password Length → 8 Characters
**File:** `app/api/portal/profile/password/route.ts`
**Fix:** Change `< 6` to `< 8`:
```diff
- if (new_password.length < 6) {
+ if (new_password.length < 8) {
    return apiValidationError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
  }
+ if (new_password.length > 128) {
+   return apiValidationError('كلمة المرور طويلة جداً');
+ }
```

### Fix 9: Invalidate Other Sessions on Password Change
**File:** `app/api/portal/profile/password/route.ts`
**Fix:** After successful password change, delete all other sessions:
```typescript
// After password update success:
await supabase
  .from('pyra_sessions')
  .delete()
  .eq('username', session.clientId)
  .neq('token', session.token);
```

### Fix 10: Path Traversal Check on File Download
**File:** `app/api/portal/files/[id]/download/route.ts`
**Fix:** Add validation before creating signed URL:
```typescript
if (projectFile.file_path.includes('..') || projectFile.file_path.startsWith('/')) {
  return apiForbidden('مسار الملف غير صالح');
}
```

---

## 🟡 CODE QUALITY FIXES (4)

### Fix 11: Extract Shared Constants & Helpers
Create `lib/portal/constants.ts`:
```typescript
export const statusConfig = { /* the status config object */ };
export const approvalStatusConfig = { /* the approval status config */ };
```

Create `lib/portal/helpers.ts`:
```typescript
export function getFileIcon(category: string) { /* ... */ }
export function getNotificationIcon(type: string) { /* ... */ }
```

Remove duplicates from:
- `app/portal/(main)/page.tsx`
- `app/portal/(main)/projects/page.tsx`
- `app/portal/(main)/projects/[id]/page.tsx`
- `app/portal/(main)/files/page.tsx`

### Fix 12: Extract Shared RevisionDialog Component
Create `components/portal/revision-dialog.tsx`:
- Extract the revision dialog JSX + state + handler from `projects/[id]/page.tsx`
- Import and use in both `projects/[id]/page.tsx` AND `files/page.tsx`

### Fix 13: Export CLIENT_SAFE_FIELDS Once
**File:** `lib/portal/auth.ts` already defines `CLIENT_SAFE_FIELDS`
**Fix:** Remove duplicate definitions from:
- `app/api/portal/profile/route.ts`
- `app/api/portal/auth/login/route.ts`
And import from `lib/portal/auth.ts` instead.

### Fix 14: Replace `select('*')` with Explicit Columns
Update ALL portal API routes to use explicit column selections:
- `app/api/portal/dashboard/route.ts` — recent_projects: `select('id, name, status, updated_at')`
- `app/api/portal/projects/route.ts` — `select('id, name, status, description, client_company, created_at, updated_at')`
- `app/api/portal/projects/[id]/route.ts` — explicit columns for project, files, approvals, comments
- `app/api/portal/notifications/route.ts` — `select('id, type, title, message, is_read, target_path, created_at')`

---

## ✅ VERIFICATION CHECKLIST

After all fixes, verify:
- [ ] `pnpm build` — 0 TypeScript errors
- [ ] Profile PATCH does NOT accept `company` field
- [ ] Dashboard stats render correctly (not all zeros)
- [ ] Files page shows files from client's projects
- [ ] Password change works without corrupting other sessions
- [ ] Password change rate-limited (test with 4+ rapid attempts)
- [ ] Search with `%` character doesn't break
- [ ] Comment with 10,000+ characters is rejected
- [ ] Password shorter than 8 chars is rejected
- [ ] File download rejects paths with `..`
- [ ] No duplicate code (statusConfig, getFileIcon, RevisionDialog, CLIENT_SAFE_FIELDS)
- [ ] No `select('*')` in any portal API route
- [ ] `git commit -m "fix: Phase 4.1 — security fixes + broken pages + code dedup"` + `git push origin main`

---

*Total: 4 critical + 6 high + 4 code quality = 14 fixes*
*Estimated time: 1-2 hours for Claude Code*
