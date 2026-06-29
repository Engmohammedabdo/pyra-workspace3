# Employee Documents Vault — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private per-employee document vault — HR uploads/manages documents with expiry tracking, employees view/download their own, and a daily cron raises 30-day + 7-day expiry alerts that also surface on the HR Overview dashboard.

**Architecture:** Reuse the existing `pyra-private` Supabase bucket + 1h signed-URL pattern (from lead attachments) for storage; a configurable `pyra_document_types` catalogue (leave-types CRUD pattern); React Query hooks for all data; a cron (`getExternalAuth` + service-role) for expiry notifications; and an extension of the existing `deriveAlerts` HR-Overview helper for the dashboard banner.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase (Postgres + private Storage + service-role), `@tanstack/react-query`, Tailwind + shadcn/ui, Vitest.

## Global Constraints

- Package manager: **pnpm** only. Each task ends green: **`pnpm run check`** + **`pnpm build`** must pass before commit; tasks adding pure logic also run **`pnpm test`**.
- **Data layer:** React Query hooks via `fetchAPI`/`mutateAPI` from `@/hooks/api-helpers` — NEVER raw `fetch()` in components, **except** the multipart upload mutation (FormData needs a browser-set boundary — documented exemption).
- **`fetchAPI` already unwraps `.data`** — never double-unwrap.
- **Storage security (LOCKED):** bucket `'pyra-private'`; path 100% server-controlled = `employee-documents/{username}/{Date.now()}-{generateId('doc').slice(4)}{ext}` — `file.name` NEVER used. Extension from validated MIME via `MIME_TO_EXT`; **hard-error on a MIME miss**. Serve only via `createSignedUrl(path, 3600)`. SVG rejected. Max 20 MB/file. Orphan-cleanup on insert failure. Upload route rate-limited.
- **Auth:** `requireApiPermission(...)` + `isApiError(auth)` early-return; `getApiAuth` where own-scope needed; service-role client (`createServiceRoleClient()`) AFTER the permission gate for documents tables. Cron uses `getExternalAuth`.
- **RBAC:** `documents.view` (in `BASE_EMPLOYEE`, own-scope) + `documents.manage` (admin/HR). Admin holds `*`.
- **RTL:** logical classes only (`ms-/me-/ps-/pe-/start-/end-/text-start/text-end`) — never `ml-/mr-/pl-/pr-/left-/right-/text-left/text-right`. **Dark mode:** pair every light color.
- **Activity:** `logActivity(username, displayName, actionType, path, metadata, ip?)` with `actionType = `${ENTITY_TYPES.DOCUMENT}_${ACTIVITY_ACTIONS.X}`` + `metadata.source`. **Notifications:** `notify(supabase, {...})` with `from: { username: 'system' }` for cron.
- Status strings from `lib/constants/statuses` if any; pages <300 lines (split into components). Arabic UI, English code. `'use client'` for interactive components.
- **Commits:** end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch `feat/employee-documents`.

---

# PHASE 1 — Plumbing

### Task 1: RBAC permissions

**Files:** Modify `lib/auth/rbac.ts`

**Interfaces:** Produces `PERMISSIONS.DOCUMENTS_VIEW = 'documents.view'`, `PERMISSIONS.DOCUMENTS_MANAGE = 'documents.manage'`; a `documents` `PERMISSION_MODULES` group; `documents.view` added to `BASE_EMPLOYEE`.

- [ ] **Step 1: Add permission keys.** In the `PERMISSIONS` object add:
```ts
  DOCUMENTS_VIEW: 'documents.view',
  DOCUMENTS_MANAGE: 'documents.manage',
```
- [ ] **Step 2: Add the module group** to `PERMISSION_MODULES` (near the `hr` group):
```ts
  {
    key: 'documents',
    label: 'Employee Documents',
    labelAr: 'وثائق الموظفين',
    permissions: [
      { key: 'documents.view', label: 'View Own Documents', labelAr: 'عرض وثائقي' },
      { key: 'documents.manage', label: 'Manage Documents', labelAr: 'إدارة وثائق الموظفين' },
    ],
  },
```
- [ ] **Step 3: Add `documents.view` to `BASE_EMPLOYEE`** (self-service, own-scope — every internal user). Add `'documents.view',` to the `BASE_EMPLOYEE` array. Do NOT add `documents.manage`.
- [ ] **Step 4: Verify.** `pnpm run check` — PASS.
- [ ] **Step 5: Commit.** `git add lib/auth/rbac.ts && git commit -m "feat(documents): add documents.view/manage permissions"` (+ trailer).

### Task 2: Migration 021 — `pyra_document_types` + `pyra_employee_documents`

**Files:** Create `supabase/migrations/021_pyra_employee_documents.sql`

- [ ] **Step 1: Write the migration.**
```sql
-- ============================================================
-- 021_pyra_employee_documents.sql
-- Employee Documents Vault: configurable types + per-employee docs.
-- Additive, idempotent. Storage in the pyra-private bucket.
-- ============================================================

CREATE TABLE IF NOT EXISTS pyra_document_types (
  id              varchar(20) PRIMARY KEY,
  name            varchar(100) NOT NULL,
  name_ar         varchar(100) NOT NULL,
  requires_expiry boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pyra_employee_documents (
  id                   varchar(20) PRIMARY KEY,
  employee_username    varchar NOT NULL,
  type_id              varchar(20) NOT NULL REFERENCES pyra_document_types(id),
  label                text,
  storage_path         text NOT NULL,
  mime_type            varchar(100) NOT NULL,
  size_bytes           integer NOT NULL CHECK (size_bytes > 0),
  expiry_date          date,
  expiry_alert_30_sent boolean NOT NULL DEFAULT false,
  expiry_alert_7_sent  boolean NOT NULL DEFAULT false,
  uploaded_by          varchar NOT NULL,
  uploaded_at          timestamptz NOT NULL DEFAULT now(),
  notes                text,
  metadata             jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_emp_docs_user      ON pyra_employee_documents (employee_username, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_emp_docs_type      ON pyra_employee_documents (type_id);
CREATE INDEX IF NOT EXISTS idx_emp_docs_expiry    ON pyra_employee_documents (expiry_date)
  WHERE expiry_date IS NOT NULL AND (expiry_alert_30_sent = false OR expiry_alert_7_sent = false);

INSERT INTO pyra_document_types (id, name, name_ar, requires_expiry, sort_order) VALUES
  ('dt_contract',  'Employment Contract', 'عقد عمل',        false, 0),
  ('dt_eid',       'Emirates ID',         'هوية إماراتية',  true,  1),
  ('dt_passport',  'Passport',            'جواز سفر',       true,  2),
  ('dt_visa',      'Residence/Visa',      'إقامة · تأشيرة', true,  3),
  ('dt_cert',      'Certificate',         'شهادة',          false, 4),
  ('dt_other',     'Other',               'أخرى',           false, 5)
ON CONFLICT (id) DO NOTHING;

-- Verification:
--   SELECT count(*) FROM pyra_document_types;  -- expect >= 6
--   SELECT column_name FROM information_schema.columns WHERE table_name='pyra_employee_documents';
```
- [ ] **Step 2: Apply** via pg/query (source the key from `.env.local` if `$SUPABASE_SERVICE_ROLE_KEY` is unset):
```bash
KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | sed -E 's/^[^=]+=//; s/^"//; s/"$//')
curl -s -X POST "https://pyraworkspacedb.pyramedia.cloud/pg/query" -H "Content-Type: application/json" -H "apikey: $KEY" \
  --data-binary @<(python -c "import json,sys; print(json.dumps({'query': open('supabase/migrations/021_pyra_employee_documents.sql').read()}))")
```
  (If the heredoc/process-substitution is awkward, paste the SQL into a `{"query": "..."}` body directly. Use `PYTHONUTF8=1` if Arabic seed text mojibakes.)
- [ ] **Step 3: Verify** both tables + seed rows exist (run the verification queries; expect ≥6 type rows + the documents columns).
- [ ] **Step 4: Record.** `pnpm db:record 021_pyra_employee_documents --by=claude --notes="employee documents vault"`.
- [ ] **Step 5: Commit.** `git add supabase/migrations/021_pyra_employee_documents.sql && git commit -m "feat(documents): migration 021 — document types + employee documents"` (+ trailer).

### Task 3: Types + activity/notification constants

**Files:** Modify `types/database.ts`, `lib/api/activity.ts`, `lib/notifications/notify.ts`

**Interfaces:** Produces `PyraDocumentType`, `PyraEmployeeDocument`; `ENTITY_TYPES.DOCUMENT = 'document'`; `NotificationType` widened with `'document_expiring_soon' | 'document_expired'`.

- [ ] **Step 1: Add types** to `types/database.ts`:
```ts
export interface PyraDocumentType {
  id: string;
  name: string;
  name_ar: string;
  requires_expiry: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface PyraEmployeeDocument {
  id: string;
  employee_username: string;
  type_id: string;
  label: string | null;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  expiry_date: string | null;
  expiry_alert_30_sent: boolean;
  expiry_alert_7_sent: boolean;
  uploaded_by: string;
  uploaded_at: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  // joined / derived (not columns):
  type_name_ar?: string;
  employee_display_name?: string;
  signed_url?: string;
}
```
- [ ] **Step 2: Add `ENTITY_TYPES.DOCUMENT`.** In `lib/api/activity.ts`, in the `ENTITY_TYPES` object (after `TASK: 'task',`) add `DOCUMENT: 'document',`.
- [ ] **Step 3: Widen `NotificationType`.** In `lib/notifications/notify.ts`, in the `NotificationType` union (before `| 'system'`) add:
```ts
  | 'document_expiring_soon'
  | 'document_expired'
```
- [ ] **Step 4: Verify + commit.** `pnpm run check`; `git add types/database.ts lib/api/activity.ts lib/notifications/notify.ts && git commit -m "feat(documents): types + DOCUMENT entity + notification types"` (+ trailer).

### Task 4: Expiry-tier helper (pure, tested)

**Files:** Create `lib/hr/document-expiry.ts`, Test `__tests__/document-expiry.test.ts`

**Interfaces:** Produces `classifyExpiry(expiryDate: string | null, todayKey: string): 'expired' | 'expiring_7' | 'expiring_30' | 'ok' | 'none'` and `EXPIRY_BADGE: Record<...,{labelAr,className}>`.

- [ ] **Step 1: Write the failing test** `__tests__/document-expiry.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { classifyExpiry } from '@/lib/hr/document-expiry';

describe('classifyExpiry', () => {
  const today = '2026-06-29';
  it('none when no expiry date', () => expect(classifyExpiry(null, today)).toBe('none'));
  it('expired when past', () => expect(classifyExpiry('2026-06-28', today)).toBe('expired'));
  it('expiring_7 within 7 days', () => expect(classifyExpiry('2026-07-03', today)).toBe('expiring_7'));
  it('expiring_30 within 30 days', () => expect(classifyExpiry('2026-07-20', today)).toBe('expiring_30'));
  it('ok beyond 30 days', () => expect(classifyExpiry('2026-09-01', today)).toBe('ok'));
  it('today counts as expiring_7', () => expect(classifyExpiry('2026-06-29', today)).toBe('expiring_7'));
});
```
- [ ] **Step 2: Run → FAIL.** `pnpm test document-expiry` — FAIL (module not found).
- [ ] **Step 3: Implement** `lib/hr/document-expiry.ts`:
```ts
export type ExpiryTier = 'expired' | 'expiring_7' | 'expiring_30' | 'ok' | 'none';

/** todayKey + expiryDate are 'YYYY-MM-DD' (Dubai day). Pure string-date math. */
export function classifyExpiry(expiryDate: string | null, todayKey: string): ExpiryTier {
  if (!expiryDate) return 'none';
  const exp = Date.parse(expiryDate + 'T00:00:00Z');
  const today = Date.parse(todayKey + 'T00:00:00Z');
  if (Number.isNaN(exp) || Number.isNaN(today)) return 'none';
  const days = Math.round((exp - today) / 86_400_000);
  if (days < 0) return 'expired';
  if (days <= 7) return 'expiring_7';
  if (days <= 30) return 'expiring_30';
  return 'ok';
}

export const EXPIRY_BADGE: Record<ExpiryTier, { labelAr: string; className: string }> = {
  expired:     { labelAr: 'منتهية',        className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  expiring_7:  { labelAr: 'تنتهي خلال أيام', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  expiring_30: { labelAr: 'تنتهي قريباً',    className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' },
  ok:          { labelAr: 'سارية',          className: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  none:        { labelAr: 'دائمة',          className: 'bg-gray-500/10 text-gray-500 dark:text-gray-400' },
};
```
- [ ] **Step 4: Run → PASS.** `pnpm test document-expiry`.
- [ ] **Step 5: Verify + commit.** `pnpm run check`; `git add lib/hr/document-expiry.ts __tests__/document-expiry.test.ts && git commit -m "feat(documents): tested expiry-tier classifier"` (+ trailer).

---

# PHASE 2 — Document-types catalogue

### Task 5: Document-types API

**Files:** Create `app/api/hr/document-types/route.ts`, `app/api/hr/document-types/[id]/route.ts`

**Interfaces:** Produces `GET/POST /api/hr/document-types`, `PATCH/DELETE /api/hr/document-types/[id]`. GET gated `documents.view`; writes gated `documents.manage`. DELETE = soft (`is_active=false`).

- [ ] **Step 1: `route.ts`** (mirrors `app/api/dashboard/leave-types/route.ts`):
```ts
import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';

export async function GET() {
  try {
    const auth = await requireApiPermission('documents.view');
    if (isApiError(auth)) return auth;
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('pyra_document_types').select('*')
      .eq('is_active', true).order('sort_order', { ascending: true });
    if (error) return apiServerError(error.message);
    return apiSuccess(data);
  } catch (err) { console.error('GET /api/hr/document-types', err); return apiServerError(); }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('documents.manage');
    if (isApiError(auth)) return auth;
    const body = await req.json();
    const { name, name_ar, requires_expiry, sort_order } = body;
    if (!name || !name_ar) return apiValidationError('الاسم والاسم العربي مطلوبان');
    const supabase = createServiceRoleClient();
    const id = generateId('dt');
    const { data, error } = await supabase.from('pyra_document_types').insert({
      id, name, name_ar, requires_expiry: requires_expiry ?? false,
      is_active: true, sort_order: sort_order ?? 0,
    }).select().single();
    if (error) return apiServerError(error.message);
    logActivity(auth.pyraUser.username, auth.pyraUser.display_name,
      `${ENTITY_TYPES.DOCUMENT}_${ACTIVITY_ACTIONS.CREATE}`, '/dashboard/hr/documents',
      { source: 'document_type_created', name });
    return apiSuccess(data, undefined, 201);
  } catch (err) { console.error('POST /api/hr/document-types', err); return apiServerError(); }
}
```
  *Implementer:* confirm `ACTIVITY_ACTIONS.CREATE` exists (read `lib/api/activity.ts`); if the member differs use the real one.
- [ ] **Step 2: `[id]/route.ts`** PATCH (allowlist `name`,`name_ar`,`requires_expiry`,`sort_order`,`is_active`) + DELETE (soft: `.update({ is_active: false })`). Mirror `app/api/dashboard/leave-types/[id]/route.ts` exactly (params is `Promise<{id}>`, `PGRST116 → apiNotFound`), gated `documents.manage`.
- [ ] **Step 3: Verify + commit.** `pnpm run check` + `pnpm build`; commit `feat(documents): document-types catalogue API`.

### Task 6: `useDocumentTypes` hook

**Files:** Create `hooks/useDocumentTypes.ts`

**Interfaces:** Produces `useDocumentTypes()`, `useCreateDocumentType()`, `useUpdateDocumentType()`, `useDeleteDocumentType()` (typed `PyraDocumentType`).

- [ ] **Step 1: Write the hook** (React Query — the new-feature standard):
```ts
'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';
import type { PyraDocumentType } from '@/types/database';

const KEY = ['document-types'];
export function useDocumentTypes() {
  return useQuery<PyraDocumentType[]>({ queryKey: KEY, queryFn: () => fetchAPI('/api/hr/document-types'), staleTime: 300_000 });
}
function inval(qc: ReturnType<typeof useQueryClient>) { qc.invalidateQueries({ queryKey: KEY }); }
export function useCreateDocumentType() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Partial<PyraDocumentType>) => mutateAPI('/api/hr/document-types', 'POST', b), onSuccess: () => inval(qc) });
}
export function useUpdateDocumentType() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...b }: { id: string } & Partial<PyraDocumentType>) => mutateAPI(`/api/hr/document-types/${id}`, 'PATCH', b), onSuccess: () => inval(qc) });
}
export function useDeleteDocumentType() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => mutateAPI(`/api/hr/document-types/${id}`, 'DELETE'), onSuccess: () => inval(qc) });
}
```
- [ ] **Step 2: Verify + commit.** `pnpm run check`; commit `feat(documents): useDocumentTypes hook`.

### Task 7: Document-types settings UI

**Files:** Create `app/dashboard/hr/documents/settings/page.tsx`, `app/dashboard/hr/documents/settings/document-types-client.tsx`

- [ ] **Step 1: Server page** (guard `documents.manage`, mirror `app/dashboard/leave/settings/page.tsx`):
```tsx
import { requirePermission } from '@/lib/auth/guards';
import DocumentTypesClient from './document-types-client';
export const metadata = { title: 'أنواع الوثائق' };
export default async function Page() {
  await requirePermission('documents.manage');
  return <DocumentTypesClient />;
}
```
- [ ] **Step 2: Client** — Dialog-based CRUD over `useDocumentTypes`/`useCreateDocumentType`/`useUpdateDocumentType`/`useDeleteDocumentType`. Fields: name, name_ar, `requires_expiry` Switch, sort_order. List rows with edit/delete (delete = soft, confirm dialog). `Skeleton` while loading, `EmptyState` when empty (mirror the structure in `app/dashboard/leave/settings/leave-settings-client.tsx` — but use the React Query hooks, not manual `useState`+`fetchAPI`). `toast` on success/error. RTL + dark. <300 lines.
- [ ] **Step 3: Verify + commit.** `pnpm run check` + `pnpm build`; commit `feat(documents): document-types settings UI`.

---

# PHASE 3 — HR documents API (private storage)

### Task 8: HR documents list + upload

**Files:** Create `app/api/hr/documents/route.ts`

**Interfaces:** Produces `GET /api/hr/documents` (filters: `employee_username?`, `type_id?`; returns rows + inline signed URLs + joined `type_name_ar`/`employee_display_name`) and `POST /api/hr/documents` (multipart upload). Both gated `documents.manage`, service-role.

- [ ] **Step 1: Constants + imports** (top of file):
```ts
import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import { apiSuccess, apiError, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { uploadLimiter, checkRateLimit } from '@/lib/utils/rate-limit';
import { buildQueryString } from '@/hooks/api-helpers'; // not needed server-side; omit if unused

const DOC_BUCKET = 'pyra-private';
const SIGNED_URL_TTL = 3600;
const MAX_DOC_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_DOC_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
};
```
- [ ] **Step 2: GET** — list with optional filters + inline signed URLs (mirror the lead-attachments GET; add joins for `type_name_ar` and `employee_display_name`):
```ts
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('documents.manage');
    if (isApiError(auth)) return auth;
    const supabase = createServiceRoleClient();
    const { searchParams } = new URL(request.url);
    let q = supabase.from('pyra_employee_documents')
      .select('id, employee_username, type_id, label, storage_path, mime_type, size_bytes, expiry_date, expiry_alert_30_sent, expiry_alert_7_sent, uploaded_by, uploaded_at, notes, metadata')
      .order('uploaded_at', { ascending: false });
    const emp = searchParams.get('employee_username');
    const type = searchParams.get('type_id');
    if (emp) q = q.eq('employee_username', emp);
    if (type) q = q.eq('type_id', type);
    const { data, error } = await q;
    if (error) { logError({ error, request, metadata: { source: 'hr_documents_list' } }); return apiServerError(); }
    // join names (small tables) + signed URLs
    const [{ data: types }, { data: users }] = await Promise.all([
      supabase.from('pyra_document_types').select('id, name_ar'),
      supabase.from('pyra_users').select('username, display_name'),
    ]);
    const typeMap = new Map((types ?? []).map((t) => [t.id, t.name_ar]));
    const userMap = new Map((users ?? []).map((u) => [u.username, u.display_name]));
    const documents = await Promise.all((data ?? []).map(async (row) => {
      const { data: u } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(row.storage_path, SIGNED_URL_TTL);
      return { ...row, type_name_ar: typeMap.get(row.type_id) ?? row.type_id,
        employee_display_name: userMap.get(row.employee_username) ?? row.employee_username,
        signed_url: u?.signedUrl ?? '' };
    }));
    return apiSuccess({ documents });
  } catch (err) { logError({ error: err, request, metadata: { source: 'hr_documents_list' } }); return apiServerError(); }
}
```
- [ ] **Step 3: POST** — multipart upload (mirror the lead-attachments POST flow exactly, adapted): rate-limit → `documents.manage` → service-role → parse `file`/`employee_username`/`type_id`/`label`/`expiry_date`/`notes` → validate (`employee_username`, `type_id`, file present, `size>0`, `size<=MAX_DOC_SIZE` else 413, MIME in `ALLOWED_DOC_MIME` else 415) → `canonicalExt = MIME_TO_EXT[file.type]` (hard-error on miss) → `storagePath = `employee-documents/${employee_username}/${Date.now()}-${generateId('doc').slice(4)}${canonicalExt}`` → `supabase.storage.from(DOC_BUCKET).upload(...)` → DB insert (`id: generateId('doc')`, all fields, `uploaded_by: auth.pyraUser.username`) → **orphan cleanup** (`void ...remove([storagePath])` on insert failure) → signed URL for response → `logActivity(... `${ENTITY_TYPES.DOCUMENT}_${ACTIVITY_ACTIONS.CREATE}` ..., { source: 'document_uploaded', employee_username, type_id })` → `apiSuccess({ document: {...inserted, signed_url} }, undefined, 201)`. Use the verbatim flow from the storage pattern card (Section 3) as the template.
- [ ] **Step 4: Verify + commit.** `pnpm run check` + `pnpm build`; commit `feat(documents): HR documents list + upload API`.

### Task 9: HR document update / delete / signed-url

**Files:** Create `app/api/hr/documents/[id]/route.ts`, `app/api/hr/documents/[id]/signed-url/route.ts`

- [ ] **Step 1: `[id]/route.ts` PATCH** (`documents.manage`) — allowlist `label`, `expiry_date`, `notes`, `type_id`. **If `expiry_date` is in the body, also reset both alert flags** (`expiry_alert_30_sent: false, expiry_alert_7_sent: false`). `PGRST116 → apiNotFound`. `logActivity(... ACTIVITY_ACTIONS.UPDATE ..., { source: 'document_updated', id })`.
- [ ] **Step 2: `[id]/route.ts` DELETE** (`documents.manage`) — fetch row, best-effort `supabase.storage.from('pyra-private').remove([row.storage_path])` (log warning, continue), then DB delete, `logActivity(... ACTIVITY_ACTIONS.DELETE ..., { source: 'document_deleted', id })`. (No double-eq needed — HR scope is all employees; the id alone is the key. Confirm `apiNotFound` import.)
- [ ] **Step 3: `[id]/signed-url/route.ts` GET** (`documents.manage`) — fetch `storage_path` by id, return a fresh `createSignedUrl(path, 3600)` as `apiSuccess({ signed_url })`.
- [ ] **Step 4: Verify + commit.** `pnpm run check` + `pnpm build`; commit `feat(documents): HR document update/delete/signed-url API`.

---

# PHASE 4 — Employee self-service API + hooks

### Task 10: Employee my-documents API

**Files:** Create `app/api/my-documents/route.ts`, `app/api/my-documents/[id]/signed-url/route.ts`

**Interfaces:** Produces `GET /api/my-documents` (own docs + inline signed URLs + `type_name_ar`) and `GET /api/my-documents/[id]/signed-url` (own doc only). Gated `documents.view`, scoped to `auth.pyraUser.username`.

- [ ] **Step 1: `route.ts` GET** — `requireApiPermission('documents.view')`; service-role; `WHERE employee_username = auth.pyraUser.username`; join `type_name_ar`; inline signed URLs (same Promise.all pattern). Return `apiSuccess({ documents })`.
- [ ] **Step 2: `[id]/signed-url/route.ts` GET** — `documents.view`; fetch the doc by id; **ownership check** (`row.employee_username === auth.pyraUser.username` else `apiForbidden`); return fresh signed URL.
- [ ] **Step 3: Verify + commit.** `pnpm run check` + `pnpm build`; commit `feat(documents): employee my-documents API`.

### Task 11: Document hooks (HR + employee)

**Files:** Create `hooks/useEmployeeDocuments.ts`, `hooks/useMyDocuments.ts`

**Interfaces:** Produces (HR) `useEmployeeDocuments(params?)`, `useEmployeeDocumentsByUser(username)`, `useUploadEmployeeDocument()`, `useUpdateEmployeeDocument()`, `useDeleteEmployeeDocument()`; (employee) `useMyDocuments()`. Upload uses raw `fetch` FormData (the documented exemption); others use `fetchAPI`/`mutateAPI`.

- [ ] **Step 1: `hooks/useEmployeeDocuments.ts`** (mirror the lead-attachments hook card — Section 6):
```ts
'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';
import type { PyraEmployeeDocument } from '@/types/database';

interface DocsResponse { documents: PyraEmployeeDocument[] }
export interface UploadDocInput {
  file: File; employee_username: string; type_id: string;
  label?: string; expiry_date?: string | null; notes?: string;
}

export function useEmployeeDocuments(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<DocsResponse>({ queryKey: ['employee-documents', params],
    queryFn: () => fetchAPI(`/api/hr/documents${qs}`), staleTime: 60_000 });
}
export function useEmployeeDocumentsByUser(username: string | undefined) {
  return useQuery<DocsResponse>({ queryKey: ['employee-documents', { employee_username: username }],
    queryFn: () => fetchAPI(`/api/hr/documents?employee_username=${username}`), enabled: !!username, staleTime: 60_000 });
}
export function useUploadEmployeeDocument() {
  const qc = useQueryClient();
  return useMutation<PyraEmployeeDocument, Error, UploadDocInput>({
    mutationFn: async ({ file, employee_username, type_id, label, expiry_date, notes }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('employee_username', employee_username);
      form.append('type_id', type_id);
      if (label) form.append('label', label);
      if (expiry_date) form.append('expiry_date', expiry_date);
      if (notes) form.append('notes', notes);
      const res = await fetch('/api/hr/documents', { method: 'POST', body: form });
      if (!res.ok) { let m = `Upload failed (${res.status})`; try { const b = await res.json(); if (typeof b?.error === 'string') m = b.error; } catch {} throw new Error(m); }
      return (await res.json()).data.document as PyraEmployeeDocument;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-documents'] }),
  });
}
export function useUpdateEmployeeDocument() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...patch }: { id: string } & Partial<PyraEmployeeDocument>) =>
    mutateAPI(`/api/hr/documents/${id}`, 'PATCH', patch), onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-documents'] }) });
}
export function useDeleteEmployeeDocument() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => mutateAPI(`/api/hr/documents/${id}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-documents'] }) });
}
```
- [ ] **Step 2: `hooks/useMyDocuments.ts`:**
```ts
'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';
import type { PyraEmployeeDocument } from '@/types/database';
export function useMyDocuments() {
  return useQuery<{ documents: PyraEmployeeDocument[] }>({ queryKey: ['my-documents'],
    queryFn: () => fetchAPI('/api/my-documents'), staleTime: 60_000 });
}
```
- [ ] **Step 3: Verify + commit.** `pnpm run check`; commit `feat(documents): employee-documents + my-documents hooks`.

---

# PHASE 5 — UI

### Task 12: HR documents page + upload dialog

**Files:** Create `app/dashboard/hr/documents/page.tsx`, `app/dashboard/hr/documents/documents-client.tsx`, `components/hr/documents/UploadDocumentDialog.tsx`, `components/hr/documents/DocumentRowActions.tsx`

- [ ] **Step 1: Server page** (`requirePermission('documents.manage')`, metadata "وثائق الموظفين"), renders `<DocumentsClient />`.
- [ ] **Step 2: `documents-client.tsx`** — `useEmployeeDocuments(filters)` → `DataTable` (`@/components/ui/data-table`) with columns: employee (`employee_display_name`), type (`type_name_ar`), label, expiry (badge via `classifyExpiry`+`EXPIRY_BADGE` using `dubaiDayKey()`), uploaded-by, actions (`DocumentRowActions`). Filters: employee `Select` (from `useUsers`, exclude clients), type `Select` (from `useDocumentTypes`), expiry-status `Select` (all/expiring/expired — client-side filter via `classifyExpiry`). "رفع وثيقة" button opens `UploadDocumentDialog`. Link to `/dashboard/hr/documents/settings`. `Skeleton`/`EmptyState`. RTL+dark. <300 lines.
- [ ] **Step 3: `UploadDocumentDialog.tsx`** — Dialog: employee `Select`, type `Select` (from `useDocumentTypes`; when the selected type's `requires_expiry` is true, make the expiry-date `Input type="date"` **required**), label `Input`, expiry-date `Input type="date"`, notes `Textarea`, file dropzone (`Input type="file"` accept `application/pdf,image/jpeg,image/png,image/webp`). Submit via `useUploadEmployeeDocument().mutate(input, { onSuccess: toast + close, onError: toast(e.message) })`. `h-11` touch targets. Client-side: reject >20 MB + non-allowed MIME before upload (server re-checks).
- [ ] **Step 4: `DocumentRowActions.tsx`** — download (opens `signed_url` in new tab), edit (small dialog: label/expiry/notes/type via `useUpdateEmployeeDocument`), delete (confirm dialog via `useDeleteEmployeeDocument`). `documents.manage` only (this whole page is manage-gated).
- [ ] **Step 5: Verify + commit.** `pnpm run check` + `pnpm build`; commit `feat(documents): HR documents page + upload dialog`.

### Task 13: Employee my-documents page

**Files:** Create `app/dashboard/my-documents/page.tsx`, `app/dashboard/my-documents/my-documents-client.tsx`

- [ ] **Step 1: Server page** (`requirePermission('documents.view')`, metadata "وثائقي"), renders `<MyDocumentsClient />`.
- [ ] **Step 2: Client** — `useMyDocuments()` → read-only card/list per doc: type, label, expiry badge (`classifyExpiry`+`EXPIRY_BADGE`), download button (opens `signed_url`). Inline notice card at top when any doc is `expiring_7`/`expiring_30`/`expired` (filter the list). `Skeleton`/`EmptyState`. No upload/edit/delete. RTL+dark. <300 lines.
- [ ] **Step 3: Verify + commit.** `pnpm run check` + `pnpm build`; commit `feat(documents): employee my-documents page`.

### Task 14: "وثائق" tab on the user-detail page

**Files:** Modify `app/dashboard/users/[username]/user-detail-client.tsx`, Create `components/hr/documents/UserDocumentsTab.tsx`

**Interfaces:** Consumes `useEmployeeDocumentsByUser(username)` + the HR row-actions.

- [ ] **Step 1: Add the tab trigger** — in `user-detail-client.tsx`, add `FileText` to the lucide import; add (after the "البيانات" `TabsTrigger`, inside `<TabsList>`):
```tsx
<TabsTrigger value="documents" className="gap-1.5 text-xs data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-600">
  <FileText className="h-3.5 w-3.5" />
  وثائق
</TabsTrigger>
```
- [ ] **Step 2: Add the tab content** — after the info `TabsContent`, before `</Tabs>`:
```tsx
<TabsContent value="documents" className="space-y-4">
  <UserDocumentsTab username={username} />
</TabsContent>
```
  Gate the trigger+content render on the viewer having `documents.manage` (use the page's existing permission context / `usePermission` if present; otherwise render and rely on the API 403). Confirm how `username` is available in this client.
- [ ] **Step 3: `UserDocumentsTab.tsx`** — `useEmployeeDocumentsByUser(username)` → compact list (type, label, expiry badge, download, edit, delete via the same hooks) + an "رفع وثيقة" button reusing `UploadDocumentDialog` pre-filled with this `employee_username`. `EmptyState` when none.
- [ ] **Step 4: Verify + commit.** `pnpm run check` + `pnpm build`; commit `feat(documents): documents tab on user detail page`.

### Task 15: Sidebar + module guide

**Files:** Modify `components/layout/sidebar.tsx`, `lib/config/module-guide.ts`, `app/dashboard/guide/page.tsx`

- [ ] **Step 1: Sidebar** — in the HR (`الموارد البشرية`) group add (ensure `FileText`/`Files` icon imported):
```tsx
{ href: '/dashboard/hr/documents', label: 'وثائق الموظفين', labelEn: 'Employee Documents', icon: FileText, permission: 'documents.manage' },
{ href: '/dashboard/my-documents', label: 'وثائقي', labelEn: 'My Documents', icon: FileText, permission: 'documents.view' },
```
- [ ] **Step 2: Module guide** — add entries for `/dashboard/hr/documents` and `/dashboard/my-documents` in `lib/config/module-guide.ts` (6–10 Arabic tips each, mention expiry alerts + private/signed-URL security + admin-only management) + add both hrefs to the HR section in `app/dashboard/guide/page.tsx` SECTIONS.
- [ ] **Step 3: Verify + commit.** `pnpm run check` + `pnpm build`; commit `docs(documents): sidebar + module guide entries`.

---

# PHASE 6 — Expiry pipeline

### Task 16: Expiry-check cron

**Files:** Create `app/api/cron/document-expiry-check/route.ts`

**Interfaces:** Produces `POST /api/cron/document-expiry-check` — `getExternalAuth` + `cron.document-expiry-check` (or `*`). For each doc expiring ≤30d with `expiry_alert_30_sent=false`: notify employee + admins, set flag. For ≤7d with `expiry_alert_7_sent=false`: critical notify, set flag. Flags flip regardless of notify outcome.

- [ ] **Step 1: Implement** (mirror `app/api/cron/lead-idle-check/route.ts` + the cron pattern card):
```ts
import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notifications/notify';
import { logError } from '@/lib/observability/log-error';
import { dubaiDayKey } from '@/lib/utils/format';

export async function POST(request: NextRequest) {
  try {
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.document-expiry-check') && !perms.includes('*'))
      return apiError('المفتاح لا يملك صلاحية cron.document-expiry-check', 403);

    const supabase = createServiceRoleClient();
    const todayKey = dubaiDayKey();
    const in30 = dubaiDayKey(new Date(Date.now() + 30 * 86_400_000));
    const in7  = dubaiDayKey(new Date(Date.now() + 7  * 86_400_000));

    // admins to notify (HR side)
    const { data: admins } = await supabase.from('pyra_users').select('username').eq('role', 'admin');
    const adminUsernames = (admins ?? []).map((a) => a.username);
    // type names for messages
    const { data: types } = await supabase.from('pyra_document_types').select('id, name_ar');
    const typeMap = new Map((types ?? []).map((t) => [t.id, t.name_ar]));

    // candidate docs: expiring within 30 days, at least one flag unsent
    const { data: docs, error } = await supabase.from('pyra_employee_documents')
      .select('id, employee_username, type_id, expiry_date, expiry_alert_30_sent, expiry_alert_7_sent')
      .not('expiry_date', 'is', null)
      .gte('expiry_date', todayKey).lte('expiry_date', in30);
    if (error) { logError({ error, request, metadata: { source: 'cron', job: 'document-expiry-check', stage: 'select' } }); return apiServerError(); }

    let processed = 0;
    for (const d of (docs ?? [])) {
      try {
        const within7 = d.expiry_date! <= in7;
        const typeAr = typeMap.get(d.type_id) ?? 'وثيقة';
        if (within7 && !d.expiry_alert_7_sent) {
          await supabase.from('pyra_employee_documents').update({ expiry_alert_7_sent: true, expiry_alert_30_sent: true }).eq('id', d.id);
          await notify(supabase, { to: d.employee_username, type: 'document_expiring_soon',
            title: 'وثيقة تنتهي خلال أيام', message: `${typeAr} تنتهي بتاريخ ${d.expiry_date}`,
            link: '/dashboard/my-documents', entity: { type: 'document', id: d.id }, from: { username: 'system' } });
          processed++;
        } else if (!d.expiry_alert_30_sent) {
          await supabase.from('pyra_employee_documents').update({ expiry_alert_30_sent: true }).eq('id', d.id);
          await notify(supabase, { to: d.employee_username, type: 'document_expiring_soon',
            title: 'وثيقة تنتهي قريباً', message: `${typeAr} تنتهي بتاريخ ${d.expiry_date}`,
            link: '/dashboard/my-documents', entity: { type: 'document', id: d.id }, from: { username: 'system' } });
          processed++;
        }
      } catch (rowErr) { console.error(`[cron/document-expiry-check] doc=${d.id}`, rowErr); }
    }

    // grouped admin summary (one per admin) when anything is expiring
    if (processed > 0 && (docs ?? []).length > 0) {
      for (const admin of adminUsernames) {
        await notify(supabase, { to: admin, type: 'document_expiring_soon',
          title: `${(docs ?? []).length} وثيقة موظفين تنتهي قريباً`,
          message: 'راجع وثائق الموظفين المنتهية أو القريبة من الانتهاء',
          link: '/dashboard/hr/documents', entity: { type: 'document_summary', id: todayKey }, from: { username: 'system' } });
      }
    }
    return apiSuccess({ processed, scanned: (docs ?? []).length });
  } catch (err) {
    logError({ error: err, request, metadata: { source: 'cron', job: 'document-expiry-check' } });
    return apiServerError();
  }
}
```
- [ ] **Step 2: Grant the cron permission** to the n8n API key (skip if the key already holds `*`):
```bash
KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | sed -E 's/^[^=]+=//; s/^"//; s/"$//')
# Inspect first: SELECT name, permissions FROM pyra_api_keys;  — only append if the key lacks '*'.
```
  Document the n8n schedule (daily 08:00 Dubai → HTTP POST `/api/cron/document-expiry-check`) in the report.
- [ ] **Step 3: Verify + commit.** `pnpm run check` + `pnpm build`; commit `feat(documents): expiry-check cron`.

### Task 17: HR Overview alert integration

**Files:** Modify `lib/hr/overview-helpers.ts`, `app/api/hr/overview/route.ts`

- [ ] **Step 1: Extend `AlertInput` + `deriveAlerts`** in `lib/hr/overview-helpers.ts` — add to `AlertInput`: `docsExpiringSoon: number; docsExpired: number;`. Add to `deriveAlerts` body (after the `absentNoLeave` block, before the sort `return`):
```ts
if (input.docsExpired > 0) {
  alerts.push({ id: 'docs-expired', severity: 'critical',
    message: `${input.docsExpired} وثيقة منتهية الصلاحية`, href: '/dashboard/hr/documents' });
}
if (input.docsExpiringSoon > 0) {
  alerts.push({ id: 'docs-expiring-soon', severity: 'high',
    message: `${input.docsExpiringSoon} وثيقة تنتهي خلال 30 يوماً`, href: '/dashboard/hr/documents' });
}
```
- [ ] **Step 2: Update the helper test.** In `__tests__/hr-overview-helpers.test.ts`, update existing `deriveAlerts` calls to include `docsExpiringSoon: 0, docsExpired: 0`, and add a case asserting a `docs-expired` critical alert when `docsExpired > 0`.
- [ ] **Step 3: Feed the counts** in `app/api/hr/overview/route.ts` — before the `deriveAlerts(...)` call, add (using the existing `daysFromNow` helper + `todayKey`; **no `status` column — do not filter by status**):
```ts
const in30Days = daysFromNow(30);
const { data: expiredDocs, error: expErr } = await supabase
  .from('pyra_employee_documents').select('id').not('expiry_date', 'is', null).lt('expiry_date', todayKey);
if (expErr) throw new Error(`pyra_employee_documents (expired): ${expErr.message}`);
const { data: expiringDocs, error: expSoonErr } = await supabase
  .from('pyra_employee_documents').select('id').gte('expiry_date', todayKey).lte('expiry_date', in30Days);
if (expSoonErr) throw new Error(`pyra_employee_documents (expiring): ${expSoonErr.message}`);
```
  Then add to the `deriveAlerts({...})` call: `docsExpired: (expiredDocs ?? []).length, docsExpiringSoon: (expiringDocs ?? []).length,`.
  *Implementer:* confirm `daysFromNow` returns a `YYYY-MM-DD` string (read its definition ~line 30); if it returns a Date, format accordingly.
- [ ] **Step 4: Verify + commit.** `pnpm run check` + `pnpm build` + `pnpm test hr-overview-helpers`; commit `feat(documents): HR Overview document-expiry alerts`.

---

# PHASE 7 — Verification + docs

### Task 18: Full verification + docs

**Files:** Modify `CLAUDE.md`, `DATABASE-SCHEMA.md`, `docs/EMPLOYEE-SYSTEM.md`

- [ ] **Step 1: Full suite.** `pnpm run check` + `pnpm build` + `pnpm test` — all green. `pnpm lint` — confirm no NEW errors/warnings in the documents files.
- [ ] **Step 2: Per-audience smoke.** HR uploads a doc (expiry 25d out) → `signed_url` downloads the right file → cron POST → employee + admins notified → HR Overview shows the alert. Employee sees only own docs on `/dashboard/my-documents`; hitting `/api/hr/documents` as a non-manage user → 403. Confirm objects are NOT publicly reachable (only via signed URL); SVG + >20 MB rejected.
- [ ] **Step 3: Docs.** Add a "Employee Documents — Locked Decisions" section to `CLAUDE.md` (reuse pyra-private; configurable types; 30/7 alerts; HR-only upload; signed-URL-only; the invariants) + v1.1 backlog; add `pyra_document_types` + `pyra_employee_documents` to `DATABASE-SCHEMA.md`; add the Documents module + permissions + hooks to `docs/EMPLOYEE-SYSTEM.md`.
- [ ] **Step 4: Commit + push.** `git push -u origin feat/employee-documents`.

---

## Self-Review (plan vs spec)

**Spec coverage:** Configurable types → Tasks 2,5,6,7 ✓. HR upload/manage (private storage) → Tasks 8,9 ✓. Employee self-service → Tasks 10,11,13 ✓. Expiry pipeline (30/7 + HR Overview) → Tasks 4,16,17 ✓. Surfaces (HR list, /my-documents, user-detail tab) → Tasks 12,13,14 ✓. RBAC/plumbing → Tasks 1,3,15 ✓. Security (private bucket, signed URLs, MIME/size, orphan cleanup) → Tasks 8,9 (from the verbatim pattern card) ✓.

**Placeholder scan:** Pure logic (expiry classifier, deriveAlerts doc branches) ships real tests. The data/logic layer has full code; UI tasks give precise specs + the reusable pattern (DataTable / Dialog-CRUD / Tabs) since those patterns are documented and established. The few "confirm X" notes are codebase verifications (ACTIVITY_ACTIONS member names, `daysFromNow` return type, `username` availability in user-detail-client, whether the n8n key already holds `*`) — not deferred work.

**Type consistency:** `PyraEmployeeDocument`/`PyraDocumentType` defined in Task 3 and consumed by all hooks/routes/UI. `UploadDocInput` (Task 11) matches the POST body fields (Task 8). `classifyExpiry`/`EXPIRY_BADGE` (Task 4) reused by Tasks 12,13. `AlertInput` extension (Task 17) matches the overview route's `deriveAlerts` call. Bucket/TTL/MIME constants identical to the storage pattern card.

**Known implementer verifications (not placeholders):** `ACTIVITY_ACTIONS.{CREATE,UPDATE,DELETE}` exact member names; `daysFromNow` return shape; `requirePermission`/`isApiError` idioms (match siblings); how the user-detail client exposes `username` + the viewer's permission; whether the n8n cron key holds `*` (skip the grant if so).
