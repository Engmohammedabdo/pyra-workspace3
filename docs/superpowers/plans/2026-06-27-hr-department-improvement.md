# HR Department Improvement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new admin-only HR Overview dashboard plus a React-Query/accessibility/visual uplift on the Attendance and Payroll pages, with shared plumbing (permissions, hooks, `date_of_birth` column, status constants).

**Architecture:** A single aggregator endpoint `GET /api/hr/overview` (service-role, `hr.view`-gated) feeds one `useHROverview()` hook that renders a dashboard built from existing primitives (`KpiCard`, Recharts wrappers, `EmptyState`, `Skeleton`). Attendance is *consolidated* onto real shared hooks (it is already React-Query-compliant) and gains an admin edit surface; Payroll is *migrated* off `useState`+`useEffect`+manual-fetch onto `useQuery`/`useMutation` hooks. Both pages get accessibility + a component split (<300 lines/file).

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase (Postgres + service-role), `@tanstack/react-query`, Tailwind + shadcn/ui, Recharts, framer-motion, lucide-react, Vitest + Testing Library.

## Global Constraints

- Package manager: **pnpm** only (NEVER npm).
- Every task ends green: **`pnpm run check`** (tsc --noEmit) + **`pnpm build`** must pass before commit. Tasks that add pure logic also run **`pnpm test`**.
- **Data layer:** React Query only. NEVER raw `fetch()` in components. Use `fetchAPI`/`mutateAPI` from `@/hooks/api-helpers` (note: `fetchAPI` already unwraps `.data` — never read `.data` again).
- **RTL:** use `ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e` — NEVER `ml-/mr-/pl-/pr-/left-/right-/text-left/text-right`. Exception: `left-1/2 -translate-x-1/2` centering.
- **Dark mode:** pair every light color (`bg-{c}-50` → `dark:bg-{c}-950/30`, `text-{c}-600` → `dark:text-{c}-400`, etc.). Safe without pair: `bg-{c}-500/10`, `text-{c}-500`, CSS vars.
- **Language:** code English, UI Arabic. `'use client'` for interactive components.
- **Status strings:** import from `@/lib/constants/statuses` — never hardcode.
- **API auth:** `requireApiPermission('x')` / `getApiAuth()` from `@/lib/api/auth`. Responses: `apiSuccess()`/`apiError()`/`apiServerError()` from `@/lib/api/response`.
- **Activity logging:** `logActivity()` from `@/lib/api/activity` on writes (fire-and-forget).
- **Service-role only tables** (audit Gap #3): `pyra_payroll_runs`, `pyra_payroll_items`, `pyra_employee_payments`, `pyra_attendance` reads in aggregate. Use `createServiceRoleClient()` AFTER the permission gate — never the session client for these.
- **`hr.view` is admin-only** in v1 (admin holds `*`). NOT in `BASE_EMPLOYEE`.
- **Migrations:** run via `pg/query` curl, verify, then `pnpm db:record` — never ask the user to run SQL.
- **Page size:** keep files <300 lines; split into focused sub-components.
- **Commits:** end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Work on branch `feat/hr-department-improvement`.

---

# PHASE 1 — Plumbing

Foundations every later phase consumes: permissions, the `date_of_birth` column, attendance status constants, and the real hooks. No user-visible behavior yet (except the new user-form field).

### Task 1: Add `hr.view` / `hr.manage` permissions

**Files:**
- Modify: `lib/auth/rbac.ts` (PERMISSIONS object near line 146; PERMISSION_MODULES array near line 614)

**Interfaces:**
- Produces: `PERMISSIONS.HR_VIEW = 'hr.view'`, `PERMISSIONS.HR_MANAGE = 'hr.manage'`; a new `PERMISSION_MODULES` group `key: 'hr'` so the strings appear in the user extra-permissions picker and roles UI.

- [ ] **Step 1: Add the permission keys.** In `lib/auth/rbac.ts`, inside the `PERMISSIONS` object, add next to the payroll keys:

```ts
  HR_VIEW: 'hr.view',
  HR_MANAGE: 'hr.manage',
```

- [ ] **Step 2: Add the permission module group.** In `PERMISSION_MODULES`, add (place it just before the `payroll` group):

```ts
  {
    key: 'hr',
    label: 'HR Overview',
    labelAr: 'لوحة الموارد البشرية',
    permissions: [
      { key: 'hr.view', label: 'View HR Dashboard', labelAr: 'عرض لوحة الموارد البشرية' },
      { key: 'hr.manage', label: 'Manage HR', labelAr: 'إدارة الموارد البشرية' },
    ],
  },
```

- [ ] **Step 3: Confirm NOT added to `BASE_EMPLOYEE`.** Open `lib/auth/rbac.ts` `BASE_EMPLOYEE` (near line 795) and verify `hr.view`/`hr.manage` are absent. They must remain admin-only (admin resolves via `*`).

- [ ] **Step 4: Verify.** Run `pnpm run check` — Expected: PASS (no type errors). The `ALLOWED_EXTRA_PERMISSIONS` set auto-includes the new keys via `Object.values(PERMISSIONS)`.

- [ ] **Step 5: Commit.**

```bash
git add lib/auth/rbac.ts
git commit -m "feat(hr): add hr.view/hr.manage permissions + module group"
```

### Task 2: Migration 020 — add `date_of_birth` to `pyra_users`

**Files:**
- Create: `supabase/migrations/020_pyra_users_date_of_birth.sql`

- [ ] **Step 1: Write the migration file.**

```sql
-- ============================================================
-- 020_pyra_users_date_of_birth.sql
-- ============================================================
-- HR bundle v1 — adds date_of_birth so the HR Overview
-- "Celebrations" widget can surface birthdays alongside work
-- anniversaries (derived from the existing hire_date column).
--
-- Risk tier 1 (additive, nullable, no backfill). Idempotent.
-- ============================================================

ALTER TABLE pyra_users
  ADD COLUMN IF NOT EXISTS date_of_birth date NULL;

-- ============================================================
-- Verification (run after migration):
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'pyra_users' AND column_name = 'date_of_birth';
-- Expected 1 row: date_of_birth | date | YES
-- ============================================================
```

- [ ] **Step 2: Apply the migration** via the project pg/query helper:

```bash
curl -X POST "https://pyraworkspacedb.pyramedia.cloud/pg/query" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"query": "ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS date_of_birth date NULL;"}'
```

- [ ] **Step 3: Verify the column exists.**

```bash
curl -X POST "https://pyraworkspacedb.pyramedia.cloud/pg/query" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"query": "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '"'"'pyra_users'"'"' AND column_name = '"'"'date_of_birth'"'"';"}'
```
Expected: one row `date_of_birth | date | YES`.

- [ ] **Step 4: Record the migration.**

```bash
pnpm db:record 020 --by=claude --notes="add date_of_birth to pyra_users (HR bundle)"
```

- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/020_pyra_users_date_of_birth.sql
git commit -m "feat(hr): migration 020 — date_of_birth on pyra_users"
```

### Task 3: Add `date_of_birth` to the `PyraUser` type

**Files:**
- Modify: `types/database.ts` (the `PyraUser` interface — add near `hire_date`)

**Interfaces:**
- Produces: `PyraUser.date_of_birth?: string | null`.

- [ ] **Step 1: Add the field.** In `types/database.ts`, in `interface PyraUser`, directly under the `hire_date?: string;` line add:

```ts
  date_of_birth?: string | null;   // YYYY-MM-DD — birthday for HR celebrations
```

- [ ] **Step 2: Verify.** `pnpm run check` — Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add types/database.ts
git commit -m "feat(hr): add date_of_birth to PyraUser type"
```

### Task 4: Wire `date_of_birth` into Users create/edit (API + form)

**Files:**
- Modify: `app/api/users/route.ts` (POST — accept `date_of_birth`)
- Modify: `app/api/users/[username]/route.ts` (PATCH — accept `date_of_birth`)
- Modify: `app/dashboard/users/users-client.tsx` (form state + a date `<Input type="date">` field, near the `hire_date` field)

**Interfaces:**
- Consumes: `PyraUser.date_of_birth` (Task 3).

- [ ] **Step 1: Accept it in POST.** In `app/api/users/route.ts`, find where the insert payload is built from the request body and add `date_of_birth: body.date_of_birth ?? null,` to the inserted columns (mirror how `hire_date` is handled).

- [ ] **Step 2: Accept it in PATCH.** In `app/api/users/[username]/route.ts`, in the update-data builder, add (mirroring `hire_date`):

```ts
if (body.date_of_birth !== undefined) updateData.date_of_birth = body.date_of_birth || null;
```

- [ ] **Step 3: Add the form field.** In `app/dashboard/users/users-client.tsx`: add `date_of_birth` to the create/edit form state (default `''`), and render a field next to `hire_date`:

```tsx
<div className="space-y-2">
  <Label htmlFor="date_of_birth">تاريخ الميلاد</Label>
  <Input
    id="date_of_birth"
    type="date"
    value={form.date_of_birth ?? ''}
    onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
  />
</div>
```
Include `date_of_birth` in the create + edit submit payloads and when pre-filling the edit form from the selected user.

- [ ] **Step 4: Verify.** `pnpm run check` + `pnpm build` — Expected: PASS.

- [ ] **Step 5: Manual smoke.** Edit a user, set a birthday, save, reopen — value persists.

- [ ] **Step 6: Commit.**

```bash
git add app/api/users/route.ts app/api/users/[username]/route.ts app/dashboard/users/users-client.tsx
git commit -m "feat(hr): manage date_of_birth in users create/edit"
```

### Task 5: Attendance status constants

**Files:**
- Modify: `lib/constants/statuses.ts` (add an `// ── Attendance ──` block)
- Test: `__tests__/attendance-status.test.ts`

**Interfaces:**
- Produces: `ATTENDANCE_STATUS`, `AttendanceStatus`, `ATTENDANCE_STATUS_LABELS`, `ATTENDANCE_STATUS_STYLES`.

- [ ] **Step 1: Write the failing test.** Create `__tests__/attendance-status.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ATTENDANCE_STATUS,
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_STYLES,
} from '@/lib/constants/statuses';

describe('attendance status constants', () => {
  it('has a label for every status value', () => {
    for (const v of Object.values(ATTENDANCE_STATUS)) {
      expect(ATTENDANCE_STATUS_LABELS[v]).toBeTruthy();
    }
  });
  it('has a style for every status value', () => {
    for (const v of Object.values(ATTENDANCE_STATUS)) {
      expect(ATTENDANCE_STATUS_STYLES[v]).toBeTruthy();
    }
  });
  it('includes the six known statuses', () => {
    expect(Object.values(ATTENDANCE_STATUS).sort()).toEqual(
      ['absent', 'early_leave', 'holiday', 'late', 'present', 'weekend'],
    );
  });
});
```

- [ ] **Step 2: Run it to confirm it fails.** `pnpm test attendance-status` — Expected: FAIL (import not found).

- [ ] **Step 3: Add the constants.** Append to `lib/constants/statuses.ts`:

```ts
// ── Attendance ──
export const ATTENDANCE_STATUS = {
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
  EARLY_LEAVE: 'early_leave',
  HOLIDAY: 'holiday',
  WEEKEND: 'weekend',
} as const;

export type AttendanceStatus = typeof ATTENDANCE_STATUS[keyof typeof ATTENDANCE_STATUS];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'حاضر',
  absent: 'غائب',
  late: 'متأخر',
  early_leave: 'انصراف مبكر',
  holiday: 'إجازة رسمية',
  weekend: 'عطلة',
};

export const ATTENDANCE_STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: 'bg-green-500/10 text-green-600 dark:text-green-400',
  absent: 'bg-red-500/10 text-red-600 dark:text-red-400',
  late: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  early_leave: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  holiday: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  weekend: 'bg-gray-500/10 text-gray-500 dark:text-gray-400',
};
```

- [ ] **Step 4: Run the test.** `pnpm test attendance-status` — Expected: PASS.

- [ ] **Step 5: Verify + commit.** `pnpm run check`, then:

```bash
git add lib/constants/statuses.ts __tests__/attendance-status.test.ts
git commit -m "feat(hr): centralize attendance status constants"
```

### Task 6: Real attendance + payroll + employee-payments hooks

**Files:**
- Rewrite: `hooks/useAttendance.ts` (replace mis-typed stub)
- Rewrite: `hooks/usePayroll.ts` (replace mis-typed stub)
- Create: `hooks/useEmployeePayments.ts`

**Interfaces:**
- Produces (attendance): `useAttendanceRecords(params?)`, `useAttendanceSummary(params?)`, `useClockIn()`, `useClockOut()`, `useUpsertAttendance()`, and types `AttendanceRecord`, `AttendanceSummary`.
- Produces (payroll): `usePayrollRuns(year)`, `usePayrollRun(id)`, `useCreatePayroll()`, `useUpdatePayroll()`, `useCalculatePayroll()`, `useMyPayslips()`, and types `PayrollRun`, `PayrollItem`.
- Produces (payments): `useEmployeePayments(params?)`, `useCreateEmployeePayment()`, `useUpdateEmployeePayment()`, type `EmployeePayment`.

- [ ] **Step 1: Rewrite `hooks/useAttendance.ts`** with real types + hooks:

```ts
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

export interface AttendanceRecord {
  id: string;
  username: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  total_hours: number;
  status: 'present' | 'absent' | 'late' | 'early_leave' | 'holiday' | 'weekend';
  notes: string | null;
  ip_address: string | null;
  created_at: string;
  display_name?: string;
}

export interface AttendanceSummary {
  present_days: number;
  late_days: number;
  absent_days: number;
  total_hours: number;
  avg_hours_per_day: number;
  expected_work_days: number;
}

export function useAttendanceRecords(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<AttendanceRecord[]>({
    queryKey: ['attendance-records', params],
    queryFn: () => fetchAPI(`/api/dashboard/attendance${qs}`),
    staleTime: 60_000,
  });
}

export function useAttendanceSummary(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<AttendanceSummary>({
    queryKey: ['attendance-summary', params],
    queryFn: () => fetchAPI(`/api/dashboard/attendance/summary${qs}`),
    staleTime: 60_000,
  });
}

function invalidateAttendance(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['attendance-records'] });
  qc.invalidateQueries({ queryKey: ['attendance-summary'] });
}

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => mutateAPI('/api/dashboard/attendance', 'POST', {}),
    onSuccess: () => invalidateAttendance(qc),
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => mutateAPI('/api/dashboard/attendance/clock-out', 'POST', {}),
    onSuccess: () => invalidateAttendance(qc),
  });
}

export interface UpsertAttendanceInput {
  username: string;
  date: string;
  clock_in?: string | null;
  clock_out?: string | null;
  status: AttendanceRecord['status'];
  notes?: string | null;
}

export function useUpsertAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertAttendanceInput) =>
      mutateAPI('/api/dashboard/attendance/admin', 'POST', input),
    onSuccess: () => invalidateAttendance(qc),
  });
}
```

- [ ] **Step 2: Rewrite `hooks/usePayroll.ts`** with real types + hooks:

```ts
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';

export interface PayrollItem {
  id: string;
  payroll_id: string;
  username: string;
  display_name?: string;
  department?: string | null;
  base_salary: number;
  task_payments: number;
  overtime_amount: number;
  bonus: number;
  deductions: number;
  deduction_details: Array<{ type: string; amount: number }>;
  net_pay: number;
  status: string;
}

export interface PayrollRun {
  id: string;
  month: number;
  year: number;
  status: string;
  total_amount: number;
  currency: string;
  employee_count: number;
  calculated_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  items?: PayrollItem[];
}

export function usePayrollRuns(year: string) {
  return useQuery<PayrollRun[]>({
    queryKey: ['payroll', year],
    queryFn: () => fetchAPI(`/api/dashboard/payroll?year=${year}`),
    staleTime: 60_000,
  });
}

export function usePayrollRun(id: string | undefined) {
  return useQuery<PayrollRun>({
    queryKey: ['payroll-run', id],
    queryFn: () => fetchAPI(`/api/dashboard/payroll/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useMyPayslips() {
  return useQuery({
    queryKey: ['my-payslips'],
    queryFn: () => fetchAPI('/api/dashboard/my-payslips'),
    staleTime: 60_000,
  });
}

function invalidatePayroll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['payroll'] });
}

export function useCreatePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { month: number; year: number; notes?: string }) =>
      mutateAPI('/api/dashboard/payroll', 'POST', input),
    onSuccess: () => invalidatePayroll(qc),
  });
}

export function useCalculatePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      mutateAPI(`/api/dashboard/payroll/${runId}/calculate`, 'POST', {}),
    onSuccess: (_d, runId) => {
      invalidatePayroll(qc);
      qc.invalidateQueries({ queryKey: ['payroll-run', runId] });
    },
  });
}

export function useUpdatePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, action }: { runId: string; action: 'approve' | 'pay' }) =>
      mutateAPI(`/api/dashboard/payroll/${runId}`, 'PATCH', { action }),
    onSuccess: () => invalidatePayroll(qc),
  });
}
```

- [ ] **Step 3: Create `hooks/useEmployeePayments.ts`:**

```ts
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

export interface EmployeePayment {
  id: string;
  username: string;
  display_name?: string;
  source_type: string;
  amount: number;
  currency: string;
  status: string;
  payroll_id: string | null;
  description: string | null;
  created_at: string;
}

export function useEmployeePayments(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<EmployeePayment[]>({
    queryKey: ['employee-payments', params],
    queryFn: () => fetchAPI(`/api/dashboard/employee-payments${qs}`),
    staleTime: 30_000,
  });
}

export function useCreateEmployeePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      username: string; source_type: string; description: string;
      amount: number; currency?: string;
    }) => mutateAPI('/api/dashboard/employee-payments', 'POST', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-payments'] }),
  });
}

export function useUpdateEmployeePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; status?: string; amount?: number; description?: string }) =>
      mutateAPI(`/api/dashboard/employee-payments/${id}`, 'PATCH', patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-payments'] }),
  });
}
```

- [ ] **Step 4: Verify.** `pnpm run check` — Expected: PASS. (These hooks compile standalone; consumers are wired in Phases 3–4. The `/api/dashboard/attendance/admin` route lands in Task 14 — the hook only references the URL string, so it compiles now.)

- [ ] **Step 5: Commit.**

```bash
git add hooks/useAttendance.ts hooks/usePayroll.ts hooks/useEmployeePayments.ts
git commit -m "feat(hr): real typed hooks for attendance, payroll, employee-payments"
```

---

# PHASE 2 — HR Overview dashboard

A new admin-only dashboard at `/dashboard/hr`. One aggregator endpoint → one hook → a page composed of small widgets.

### Task 7: `/api/hr/overview` aggregator endpoint

**Files:**
- Create: `app/api/hr/overview/route.ts`
- Test: `__tests__/hr-overview-helpers.test.ts`
- Create: `lib/hr/overview-helpers.ts` (pure helpers, unit-tested)

**Interfaces:**
- Produces the HTTP shape `HROverview` (mirrored by the hook in Task 8):

```ts
interface HROverview {
  headcount: { active: number; by_type: Record<string, number>; by_department: Record<string, number>; new_30d: number; new_90d: number };
  attendance_today: { present: number; absent: number; late: number; on_leave: number; present_rate_pct: number };
  leave: { pending: number; on_leave_today: Array<{ username: string; display_name: string; end_date: string }>; paid_liability_days: number; upcoming: Array<{ username: string; display_name: string; start_date: string; end_date: string; days: number }> };
  payroll: { current_status: string | null; current_month: number; current_year: number; last_paid_total: number; trend: Array<{ label: string; total: number }>; pending_payments_count: number; pending_payments_sum: number };
  evaluations: { active_period: string | null; pending: number; submitted: number; acknowledged: number };
  alerts: Array<{ id: string; severity: 'critical' | 'high' | 'medium' | 'low'; message: string; href: string }>;
  celebrations: Array<{ username: string; display_name: string; kind: 'birthday' | 'anniversary'; date: string; years?: number }>;
}
```
- Produces (from `lib/hr/overview-helpers.ts`): `computeCelebrations(users, todayDubai)`, `deriveAlerts(input)`, `dubaiTodayKey()` (reuse `dubaiDayKey` from `lib/utils/format` if present — import it; otherwise add a local copy).

- [ ] **Step 1: Write failing tests for the pure helpers.** Create `__tests__/hr-overview-helpers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeCelebrations, deriveAlerts } from '@/lib/hr/overview-helpers';

describe('computeCelebrations', () => {
  it('flags a birthday in the current month and computes anniversary years', () => {
    const users = [
      { username: 'a', display_name: 'A', date_of_birth: '1990-06-15', hire_date: '2020-06-02' },
      { username: 'b', display_name: 'B', date_of_birth: null, hire_date: '2019-01-10' },
    ];
    const res = computeCelebrations(users, '2026-06-27');
    const a = res.filter((c) => c.username === 'a');
    expect(a.some((c) => c.kind === 'birthday')).toBe(true);
    expect(a.some((c) => c.kind === 'anniversary' && c.years === 6)).toBe(true);
    expect(res.some((c) => c.username === 'b')).toBe(false); // Jan, not June
  });
});

describe('deriveAlerts', () => {
  it('emits a critical alert when pending approvals exceed 5', () => {
    const alerts = deriveAlerts({ leavePending: 6, payrollCalculated: true, absentNoLeave: 0 });
    expect(alerts.some((a) => a.severity === 'critical')).toBe(true);
  });
  it('emits high when payroll not calculated mid-month', () => {
    const alerts = deriveAlerts({ leavePending: 0, payrollCalculated: false, absentNoLeave: 0 });
    expect(alerts.some((a) => a.severity === 'high')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail.** `pnpm test hr-overview-helpers` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/hr/overview-helpers.ts`.** Pure functions only (no Supabase):

```ts
export interface CelebrationUser {
  username: string;
  display_name: string;
  date_of_birth?: string | null;
  hire_date?: string | null;
}
export interface Celebration {
  username: string; display_name: string;
  kind: 'birthday' | 'anniversary'; date: string; years?: number;
}

/** todayKey = 'YYYY-MM-DD' (Dubai). Returns this-month celebrations. */
export function computeCelebrations(users: CelebrationUser[], todayKey: string): Celebration[] {
  const month = todayKey.slice(5, 7);
  const year = Number(todayKey.slice(0, 4));
  const out: Celebration[] = [];
  for (const u of users) {
    if (u.date_of_birth && u.date_of_birth.slice(5, 7) === month) {
      out.push({ username: u.username, display_name: u.display_name, kind: 'birthday', date: u.date_of_birth });
    }
    if (u.hire_date && u.hire_date.slice(5, 7) === month) {
      const years = year - Number(u.hire_date.slice(0, 4));
      if (years > 0) out.push({ username: u.username, display_name: u.display_name, kind: 'anniversary', date: u.hire_date, years });
    }
  }
  return out;
}

export interface AlertInput { leavePending: number; payrollCalculated: boolean; absentNoLeave: number; }
export interface HrAlert { id: string; severity: 'critical' | 'high' | 'medium' | 'low'; message: string; href: string; }

export function deriveAlerts(input: AlertInput): HrAlert[] {
  const alerts: HrAlert[] = [];
  if (input.leavePending > 5) {
    alerts.push({ id: 'leave-backlog', severity: 'critical', message: `${input.leavePending} طلبات إجازة تنتظر الموافقة`, href: '/dashboard/approvals' });
  } else if (input.leavePending > 0) {
    alerts.push({ id: 'leave-pending', severity: 'medium', message: `${input.leavePending} طلب إجازة بانتظار الموافقة`, href: '/dashboard/approvals' });
  }
  if (!input.payrollCalculated) {
    alerts.push({ id: 'payroll-not-calculated', severity: 'high', message: 'رواتب الشهر الحالي لم تُحتسب بعد', href: '/dashboard/payroll' });
  }
  if (input.absentNoLeave > 0) {
    alerts.push({ id: 'absent-no-leave', severity: 'high', message: `${input.absentNoLeave} موظفين غائبون بلا إجازة اليوم`, href: '/dashboard/attendance' });
  }
  const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
```

- [ ] **Step 4: Run tests.** `pnpm test hr-overview-helpers` — Expected: PASS.

- [ ] **Step 5: Implement the route.** Create `app/api/hr/overview/route.ts`. Gate on `hr.view`, then use the service-role client. Pattern:

```ts
import { requireApiPermission } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/log-error';
import { computeCelebrations, deriveAlerts } from '@/lib/hr/overview-helpers';
import { dubaiDayKey } from '@/lib/utils/format';

export async function GET(request: Request) {
  const auth = await requireApiPermission('hr.view');
  if (auth instanceof Response) return auth;
  try {
    const supabase = createServiceRoleClient();
    const todayKey = dubaiDayKey();

    // headcount
    const { data: users } = await supabase
      .from('pyra_users')
      .select('username, display_name, status, employment_type, department, hire_date, date_of_birth, role')
      .neq('role', 'client');
    const active = (users ?? []).filter((u) => u.status === 'active');
    const by_type: Record<string, number> = {};
    const by_department: Record<string, number> = {};
    for (const u of active) {
      by_type[u.employment_type ?? 'unknown'] = (by_type[u.employment_type ?? 'unknown'] ?? 0) + 1;
      if (u.department) by_department[u.department] = (by_department[u.department] ?? 0) + 1;
    }
    const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const new_30d = active.filter((u) => u.hire_date && u.hire_date >= daysAgo(30)).length;
    const new_90d = active.filter((u) => u.hire_date && u.hire_date >= daysAgo(90)).length;

    // attendance today
    const { data: todayAtt } = await supabase
      .from('pyra_attendance').select('username, status').eq('date', todayKey);
    const att = todayAtt ?? [];
    const present = att.filter((a) => a.status === 'present' || a.status === 'late').length;
    const lateN = att.filter((a) => a.status === 'late').length;
    const absentN = att.filter((a) => a.status === 'absent').length;

    // leave: pending + on-leave-today + upcoming
    const { data: pendingLeave } = await supabase
      .from('pyra_leave_requests').select('id').eq('status', 'pending');
    const { data: approvedLeave } = await supabase
      .from('pyra_leave_requests')
      .select('username, start_date, end_date, total_days, status')
      .eq('status', 'approved').gte('end_date', todayKey)
      .order('start_date', { ascending: true });
    const nameOf = (un: string) => active.find((u) => u.username === un)?.display_name ?? un;
    const onLeaveToday = (approvedLeave ?? []).filter((l) => l.start_date <= todayKey && l.end_date >= todayKey)
      .map((l) => ({ username: l.username, display_name: nameOf(l.username), end_date: l.end_date }));
    const in7 = daysAgo(-7);
    const upcoming = (approvedLeave ?? []).filter((l) => l.start_date > todayKey && l.start_date <= in7)
      .map((l) => ({ username: l.username, display_name: nameOf(l.username), start_date: l.start_date, end_date: l.end_date, days: l.total_days }));

    // paid-leave liability (remaining paid days)
    const { data: balances } = await supabase
      .from('pyra_leave_balances_v2').select('total_days, used_days, carried_over');
    const paid_liability_days = (balances ?? []).reduce((s, b) => s + Math.max(0, (b.total_days + b.carried_over - b.used_days)), 0);

    // payroll: current month run + trend + pending payments
    const now = new Date();
    const curMonth = now.getMonth() + 1; const curYear = now.getFullYear();
    const { data: runs } = await supabase
      .from('pyra_payroll_runs').select('month, year, status, total_amount, paid_at')
      .order('year', { ascending: false }).order('month', { ascending: false }).limit(12);
    const curRun = (runs ?? []).find((r) => r.month === curMonth && r.year === curYear) ?? null;
    const lastPaid = (runs ?? []).find((r) => r.status === 'paid');
    const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    const trend = (runs ?? []).slice(0, 6).reverse().map((r) => ({ label: MONTHS[r.month - 1], total: Number(r.total_amount) || 0 }));
    const { data: pendingPays } = await supabase
      .from('pyra_employee_payments').select('amount').eq('status', 'pending');
    const pending_payments_sum = (pendingPays ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0);

    // evaluations
    const { data: periods } = await supabase
      .from('pyra_evaluation_periods').select('id, name_ar, status').eq('status', 'active').limit(1);
    const activePeriod = periods?.[0] ?? null;
    let evalCounts = { pending: 0, submitted: 0, acknowledged: 0 };
    if (activePeriod) {
      const { data: evals } = await supabase
        .from('pyra_evaluations').select('status').eq('period_id', activePeriod.id);
      for (const e of evals ?? []) {
        if (e.status === 'draft') evalCounts.pending++;
        else if (e.status === 'submitted') evalCounts.submitted++;
        else if (e.status === 'acknowledged') evalCounts.acknowledged++;
      }
    }

    const present_rate_pct = active.length ? Math.round((present / active.length) * 100) : 0;
    const alerts = deriveAlerts({
      leavePending: (pendingLeave ?? []).length,
      payrollCalculated: !!curRun && curRun.status !== 'draft',
      absentNoLeave: absentN,
    });
    const celebrations = computeCelebrations(active, todayKey);

    return apiSuccess({
      headcount: { active: active.length, by_type, by_department, new_30d, new_90d },
      attendance_today: { present, absent: absentN, late: lateN, on_leave: onLeaveToday.length, present_rate_pct },
      leave: { pending: (pendingLeave ?? []).length, on_leave_today: onLeaveToday, paid_liability_days, upcoming },
      payroll: {
        current_status: curRun?.status ?? null, current_month: curMonth, current_year: curYear,
        last_paid_total: Number(lastPaid?.total_amount) || 0, trend,
        pending_payments_count: (pendingPays ?? []).length, pending_payments_sum,
      },
      evaluations: { active_period: activePeriod?.name_ar ?? null, ...evalCounts },
      alerts,
      celebrations,
    });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'hr_overview' } });
    return apiServerError();
  }
}
```

  *Note for the implementer:* confirm `dubaiDayKey` is exported from `lib/utils/format`; if its signature differs, adapt. Confirm `requireApiPermission` returns the auth object or a `Response`/`NextResponse` (mirror `/api/my-work` and a route that already uses `requireApiPermission` — match the exact early-return idiom and `Request`/`NextRequest` type).

- [ ] **Step 6: Verify.** `pnpm run check` + `pnpm build` — Expected: PASS.

- [ ] **Step 7: Manual smoke (admin).** Hit `/api/hr/overview` while logged in as admin → 200 + JSON. As a non-admin (or no `hr.view`) → 403.

- [ ] **Step 8: Commit.**

```bash
git add app/api/hr/overview/route.ts lib/hr/overview-helpers.ts __tests__/hr-overview-helpers.test.ts
git commit -m "feat(hr): /api/hr/overview aggregator + tested pure helpers"
```

### Task 8: `useHROverview` hook

**Files:**
- Create: `hooks/useHROverview.ts`

**Interfaces:**
- Consumes: `GET /api/hr/overview` (Task 7).
- Produces: `useHROverview()` returning `HROverview`; export the `HROverview` type (copy the interface from Task 7 verbatim).

- [ ] **Step 1: Write the hook.**

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';

export interface HROverview {
  headcount: { active: number; by_type: Record<string, number>; by_department: Record<string, number>; new_30d: number; new_90d: number };
  attendance_today: { present: number; absent: number; late: number; on_leave: number; present_rate_pct: number };
  leave: { pending: number; on_leave_today: Array<{ username: string; display_name: string; end_date: string }>; paid_liability_days: number; upcoming: Array<{ username: string; display_name: string; start_date: string; end_date: string; days: number }> };
  payroll: { current_status: string | null; current_month: number; current_year: number; last_paid_total: number; trend: Array<{ label: string; total: number }>; pending_payments_count: number; pending_payments_sum: number };
  evaluations: { active_period: string | null; pending: number; submitted: number; acknowledged: number };
  alerts: Array<{ id: string; severity: 'critical' | 'high' | 'medium' | 'low'; message: string; href: string }>;
  celebrations: Array<{ username: string; display_name: string; kind: 'birthday' | 'anniversary'; date: string; years?: number }>;
}

export function useHROverview() {
  return useQuery<HROverview>({
    queryKey: ['hr-overview'],
    queryFn: () => fetchAPI('/api/hr/overview'),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
```

- [ ] **Step 2: Verify + commit.** `pnpm run check`, then:

```bash
git add hooks/useHROverview.ts
git commit -m "feat(hr): useHROverview hook"
```

### Task 9: HR Overview widgets (presentational components)

**Files:**
- Create: `components/hr/overview/HrAlerts.tsx`
- Create: `components/hr/overview/HrKpiRow.tsx`
- Create: `components/hr/overview/HeadcountChart.tsx`
- Create: `components/hr/overview/PayrollTrendChart.tsx`
- Create: `components/hr/overview/UpcomingLeaveList.tsx`
- Create: `components/hr/overview/EvaluationsStatusCard.tsx`
- Create: `components/hr/overview/CelebrationsCard.tsx`

**Interfaces:**
- Consumes: the `HROverview` sub-objects (Task 8). Each component takes exactly the slice it renders.
- Produces (props): `HrAlerts({ alerts })`, `HrKpiRow({ data })` (data = full `HROverview`), `HeadcountChart({ byDepartment })`, `PayrollTrendChart({ trend })`, `UpcomingLeaveList({ items })`, `EvaluationsStatusCard({ evaluations })`, `CelebrationsCard({ items })`.

- [ ] **Step 1: `HrKpiRow.tsx`** — a `grid gap-4 sm:grid-cols-2 lg:grid-cols-5` of 5 `KpiCard`s (import `KpiCard` from `@/components/dashboard/KpiCard`). Map: Headcount (`Users`), Present today % (`UserCheck`), On leave today (`Plane`), Pending approvals (`ClipboardCheck`, accent red when >5), Monthly payroll cost (`Banknote`, value = `formatCurrency`). Each `KpiCard` value is a string; pass `gradient` per card (reuse the gradient palette from `app/dashboard/page.tsx`). RTL + dark via the primitive.

- [ ] **Step 2: `HrAlerts.tsx`** — render nothing when `alerts.length === 0`. Otherwise a stacked list mirroring `SmartAlerts` styling (a `severity → styles` map for `critical`/`high`/`medium`/`low`; map `critical`→red, `high`→orange/amber, `medium`→yellow, `low`→blue). Each row is a `<Link href={alert.href}>` with icon + message + chevron. Reuse the visual recipe from `components/dashboard/SmartAlerts.tsx` (don't import its data hook — this takes `alerts` as a prop).

- [ ] **Step 3: `HeadcountChart.tsx`** — a Recharts donut/bar of `byDepartment` (`Record<string,number>`). Follow the chart container/styling pattern in `components/dashboard/ClientDistributionChart.tsx` (Card wrapper + `ResponsiveContainer`). `EmptyState` (compact) when empty. Add an `aria-label` summarizing totals on the chart container.

- [ ] **Step 4: `PayrollTrendChart.tsx`** — a Recharts area/line of `trend` (`Array<{label,total}>`). Follow `components/dashboard/RevenueTrendChart.tsx` styling. Format Y axis with `formatCurrency`. `aria-label` summary.

- [ ] **Step 5: `UpcomingLeaveList.tsx`** — a Card listing `items` (next-7-day approved leave): display_name + date range + days badge. `EmptyState` inline-stub (Phase-13 compact pattern) when empty. Whole-card header is a `<Link href="/dashboard/approvals">` per the section-header-as-link pattern.

- [ ] **Step 6: `EvaluationsStatusCard.tsx`** — a Card showing `active_period` + three counts (pending/submitted/acknowledged) as small stat pills. Link header to `/dashboard/evaluations`. Inline-stub when no active period.

- [ ] **Step 7: `CelebrationsCard.tsx`** — a Card listing `items`: 🎂 birthday or 🎉 anniversary (`{years} سنوات`), name, day-of-month. Inline-stub when empty.

- [ ] **Step 8: Verify + commit.** `pnpm run check` + `pnpm build` (catches RTL/import errors), then:

```bash
git add components/hr/overview
git commit -m "feat(hr): HR Overview widget components"
```

### Task 10: HR Overview page (server + client)

**Files:**
- Create: `app/dashboard/hr/page.tsx`
- Create: `app/dashboard/hr/hr-overview-client.tsx`

**Interfaces:**
- Consumes: `useHROverview()` (Task 8) + all widgets (Task 9).

- [ ] **Step 1: Server page with guard.** `app/dashboard/hr/page.tsx`:

```tsx
import { requirePermission } from '@/lib/auth/guards';
import HrOverviewClient from './hr-overview-client';

export const metadata = { title: 'الموارد البشرية — نظرة عامة' };

export default async function HrOverviewPage() {
  await requirePermission('hr.view');
  return <HrOverviewClient />;
}
```
  *Implementer:* match the exact `requirePermission` usage/signature of a sibling server page (e.g. `app/dashboard/payroll/page.tsx`).

- [ ] **Step 2: Client page.** `app/dashboard/hr/hr-overview-client.tsx` — `'use client'`. Call `useHROverview()`. While `isLoading`, render a `Skeleton` layout (mirror `app/dashboard/page.tsx` loading block). On data: stack `HrAlerts` → `HrKpiRow` → a `grid gap-4 lg:grid-cols-2` of (`HeadcountChart`, `PayrollTrendChart`) → a `grid gap-4 lg:grid-cols-3` of (`UpcomingLeaveList`, `EvaluationsStatusCard`, `CelebrationsCard`). Wrap with the `framer-motion` `containerMotion/itemMotion` variants from `app/dashboard/page.tsx`. Full-page `EmptyState` only if the whole response is unexpectedly null.

- [ ] **Step 3: Verify.** `pnpm run check` + `pnpm build` — Expected: PASS.

- [ ] **Step 4: Manual smoke.** As admin, visit `/dashboard/hr` → dashboard renders with live numbers. As employee, the route guard redirects (no `hr.view`).

- [ ] **Step 5: Commit.**

```bash
git add app/dashboard/hr
git commit -m "feat(hr): HR Overview dashboard page"
```

### Task 11: Sidebar entry

**Files:**
- Modify: `components/layout/sidebar.tsx` (HR group, near line 174)

- [ ] **Step 1: Add the nav item** as the FIRST item in the `الموارد البشرية` group (before `/dashboard/approvals`). Use an imported icon already in the file (e.g. `Gauge` or reuse `LayoutDashboard`):

```tsx
{ href: '/dashboard/hr', label: 'نظرة عامة', labelEn: 'HR Overview', icon: LayoutDashboard, permission: 'hr.view' },
```
  Ensure the icon is imported at the top of the file (add to the lucide import if missing).

- [ ] **Step 2: Verify.** `pnpm run check` + `pnpm build`.

- [ ] **Step 3: Manual smoke.** Admin sees the item; employee does not (filtered by `permission`).

- [ ] **Step 4: Commit.**

```bash
git add components/layout/sidebar.tsx
git commit -m "feat(hr): sidebar entry for HR Overview"
```

### Task 12: Module guide entry

**Files:**
- Modify: `lib/config/module-guide.ts` (add `/dashboard/hr` entry)
- Modify: `app/dashboard/guide/page.tsx` (add `/dashboard/hr` to the relevant SECTIONS array)

- [ ] **Step 1: Add the guide entry** to `MODULE_GUIDES` in `lib/config/module-guide.ts`, keyed `/dashboard/hr`, following the existing object shape (title, description, goal, tips[6-10 actionable items], keywords). Tips in Arabic narrative + English technical terms (e.g. "تعرض اللوحة نسبة الحضور اليوم، رصيد الإجازات (paid liability)، وتكلفة الرواتب الشهرية"). Mention admin-only access.

- [ ] **Step 2: Add the href** to the HR section's array in `app/dashboard/guide/page.tsx` SECTIONS.

- [ ] **Step 3: Verify.** `pnpm run check` + `pnpm build`.

- [ ] **Step 4: Commit.**

```bash
git add lib/config/module-guide.ts app/dashboard/guide/page.tsx
git commit -m "docs(hr): module guide entry for HR Overview"
```

---

# PHASE 3 — Attendance uplift

Attendance already uses React Query inline. This phase consolidates onto the shared hooks, centralizes constants, adds admin editing, accessibility, and a component split.

### Task 13: Consolidate attendance client onto shared hooks + constants

**Files:**
- Modify: `app/dashboard/attendance/attendance-client.tsx`

**Interfaces:**
- Consumes: `useAttendanceRecords`, `useAttendanceSummary`, `useClockIn`, `useClockOut` (Task 6); `ATTENDANCE_STATUS_LABELS`, `ATTENDANCE_STATUS_STYLES` (Task 5).

- [ ] **Step 1: Read the current file** end-to-end so the refactor preserves behavior (calendar grid, today-card live clock, month navigation).

- [ ] **Step 2: Replace inline queries/mutations with hooks.** Swap the inline `useQuery`/`useMutation` for `useAttendanceRecords({ month: monthKey })`, `useAttendanceSummary({ month: monthKey })`, `useClockIn()`, `useClockOut()`. Keep `toast` calls in the component via the mutation's `onSuccess`/`onError` options at the call site (e.g. `clockIn.mutate(undefined, { onSuccess: () => toast.success('تم تسجيل الدخول بنجاح') })`). Remove the local `AttendanceRecord`/`AttendanceSummary` interfaces (import from the hook).

- [ ] **Step 3: Remove the `queryFn` side-effect.** Replace the `work-schedules` `useQuery` that calls `setWorkSchedule` inside `queryFn` with a clean query + derived value: `const { data: schedules } = useQuery({ queryKey: ['work-schedules'], queryFn: () => fetchAPI<WorkSchedule[]>('/api/dashboard/work-schedules'), staleTime: 600_000 });` then `const workSchedule = (schedules ?? []).find(s => s.is_default) ?? schedules?.[0] ?? null;`. Delete the `workSchedule` `useState`.

- [ ] **Step 4: Use the status constants.** Replace the inline `STATUS_STYLES`/`STATUS_LABELS` objects with imports `ATTENDANCE_STATUS_STYLES`/`ATTENDANCE_STATUS_LABELS`.

- [ ] **Step 5: Verify.** `pnpm run check` + `pnpm build` — Expected: PASS.

- [ ] **Step 6: Manual smoke.** Clock-in/out works; month nav refetches; statuses render.

- [ ] **Step 7: Commit.**

```bash
git add app/dashboard/attendance/attendance-client.tsx
git commit -m "refactor(hr): attendance client consumes shared hooks + status constants"
```

### Task 14: Admin attendance edit API

**Files:**
- Create: `app/api/dashboard/attendance/admin/route.ts`

**Interfaces:**
- Consumes: `UpsertAttendanceInput` shape from `useUpsertAttendance` (Task 6): `{ username, date, clock_in?, clock_out?, status, notes? }`.
- Produces: `POST /api/dashboard/attendance/admin` → upserts one `pyra_attendance` row (unique on `username,date`), `attendance.manage`-gated.

- [ ] **Step 1: Implement the route.** Gate on `attendance.manage`; service-role client; recompute `total_hours` from clock_in/out when both present; `logActivity()`:

```ts
import { requireApiPermission } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { generateId } from '@/lib/utils/id'; // match the project's id helper; confirm import path

export async function POST(request: Request) {
  const auth = await requireApiPermission('attendance.manage');
  if (auth instanceof Response) return auth;
  try {
    const body = await request.json();
    const { username, date, clock_in = null, clock_out = null, status, notes = null } = body ?? {};
    if (!username || !date || !status) return apiError('الموظف والتاريخ والحالة مطلوبة', 422);

    let total_hours = 0;
    if (clock_in && clock_out) {
      total_hours = Math.max(0, (new Date(clock_out).getTime() - new Date(clock_in).getTime()) / 3_600_000);
      total_hours = Math.round(total_hours * 100) / 100;
    }
    const supabase = createServiceRoleClient();
    const { data: existing } = await supabase
      .from('pyra_attendance').select('id').eq('username', username).eq('date', date).maybeSingle();

    let row;
    if (existing) {
      const { data, error } = await supabase.from('pyra_attendance')
        .update({ clock_in, clock_out, status, notes, total_hours })
        .eq('id', existing.id).select().single();
      if (error) return apiError('فشل تحديث السجل', 500);
      row = data;
    } else {
      const { data, error } = await supabase.from('pyra_attendance')
        .insert({ id: generateId('att'), username, date, clock_in, clock_out, status, notes, total_hours })
        .select().single();
      if (error) return apiError('فشل إنشاء السجل', 500);
      row = data;
    }
    logActivity(request, `${ENTITY_TYPES.USER}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/attendance`, { source: 'admin_attendance_edit', username, date, status });
    return apiSuccess(row);
  } catch (err) {
    return apiServerError('خطأ في تعديل الحضور', err, request);
  }
}
```
  *Implementer:* confirm `generateId` path/prefix convention (grep an existing route that inserts into a `pyra_*` table); confirm the exact `logActivity` signature (args order) against a current caller; confirm `ENTITY_TYPES`/`ACTIVITY_ACTIONS` members exist (use a generic `USER`+`UPDATE` with `metadata.source` per the Phase-11.5 action_type principle).

- [ ] **Step 2: Verify.** `pnpm run check` + `pnpm build`.

- [ ] **Step 3: Manual smoke.** As admin: `POST /api/dashboard/attendance/admin` upserts; as a non-manage user → 403.

- [ ] **Step 4: Commit.**

```bash
git add app/api/dashboard/attendance/admin/route.ts
git commit -m "feat(hr): admin attendance upsert API (attendance.manage)"
```

### Task 15: Admin attendance edit UI

**Files:**
- Create: `components/attendance/AdminAttendanceDialog.tsx`
- Modify: `app/dashboard/attendance/attendance-client.tsx` (render an admin section when `canManage`)

**Interfaces:**
- Consumes: `useUpsertAttendance()` (Task 6), `useUsers()` (existing) for the employee picker, `ATTENDANCE_STATUS_LABELS` (Task 5).

- [ ] **Step 1: Build `AdminAttendanceDialog.tsx`** — a shadcn `Dialog` with: employee `Select` (from `useUsers`), date `Input type="date"`, status `Select` (from `ATTENDANCE_STATUS_LABELS`), optional clock-in/out `Input type="time"`-derived ISO, notes `Textarea`. On submit call `useUpsertAttendance().mutate(input, { onSuccess: toast.success(...) })`. Touch targets `h-11`. RTL + dark.

- [ ] **Step 2: Wire `canManage`.** In `attendance-client.tsx`, when `canManage` is true, render a "تعديل حضور موظف" button (admin section) that opens the dialog. (`canManage` is already computed — this removes the dead-code state.)

- [ ] **Step 3: Verify.** `pnpm run check` + `pnpm build`.

- [ ] **Step 4: Manual smoke.** Admin opens dialog, edits a day for another employee → grid refetches (cache invalidated by the hook).

- [ ] **Step 5: Commit.**

```bash
git add components/attendance/AdminAttendanceDialog.tsx app/dashboard/attendance/attendance-client.tsx
git commit -m "feat(hr): admin attendance edit UI"
```

### Task 16: Attendance component split

**Files:**
- Create: `components/attendance/AttendanceCalendar.tsx`
- Create: `components/attendance/AttendanceSummaryCards.tsx`
- Create: `components/attendance/TodayClockCard.tsx`
- Modify: `app/dashboard/attendance/attendance-client.tsx` (compose from the above; target <300 lines)

**Interfaces:**
- Produces: `AttendanceCalendar({ records, year, month, onPrev, onNext })`, `AttendanceSummaryCards({ summary })` (uses `KpiCard`), `TodayClockCard({ todayRecord, elapsed, onClockIn, onClockOut, clockingIn, clockingOut })`.

- [ ] **Step 1: Extract the calendar grid** (the `Array.from({length:35})` block) into `AttendanceCalendar.tsx`, taking `records`/`year`/`month` + nav callbacks. Use `ATTENDANCE_STATUS_STYLES` for day dots.

- [ ] **Step 2: Extract the summary cards** into `AttendanceSummaryCards.tsx` using `KpiCard` (present/late/absent/avg hours).

- [ ] **Step 3: Extract the today/clock card** into `TodayClockCard.tsx`.

- [ ] **Step 4: Recompose** `attendance-client.tsx` to import and arrange them; confirm it is now <300 lines.

- [ ] **Step 5: Verify.** `pnpm run check` + `pnpm build`.

- [ ] **Step 6: Commit.**

```bash
git add components/attendance app/dashboard/attendance/attendance-client.tsx
git commit -m "refactor(hr): split attendance into focused sub-components"
```

### Task 17: Attendance accessibility pass

**Files:**
- Modify: `components/attendance/AttendanceCalendar.tsx`
- Modify: `components/attendance/TodayClockCard.tsx`

- [ ] **Step 1: Calendar a11y.** Each day cell: `role="gridcell"`, `aria-label={`${formatDate(date)} — ${ATTENDANCE_STATUS_LABELS[status]}`}`, `tabIndex={0}`, and visible focus ring (`focus-visible:ring-2 focus-visible:ring-orange-400`). Month nav buttons get `aria-label` ("الشهر السابق"/"الشهر التالي") and use `rtl:rotate-180` on chevrons.

- [ ] **Step 2: Clock result a11y.** Wrap the live-elapsed timer + last action result in an `aria-live="polite"` region so screen readers announce clock-in/out.

- [ ] **Step 3: Status legend.** Add a small legend mapping each color → `ATTENDANCE_STATUS_LABELS` under the calendar.

- [ ] **Step 4: Verify.** `pnpm run check` + `pnpm build`; keyboard-tab through the calendar.

- [ ] **Step 5: Commit.**

```bash
git add components/attendance
git commit -m "feat(hr): attendance accessibility (keyboard grid, aria-live, legend)"
```

---

# PHASE 4 — Payroll uplift

Migrate the manual-fetch client onto React Query hooks (fixes the double-`.data` unwrap bug), then accessibility + component split.

### Task 18: Migrate payroll runs + payments to hooks

**Files:**
- Modify: `app/dashboard/payroll/payroll-client.tsx`

**Interfaces:**
- Consumes: `usePayrollRuns`, `usePayrollRun`, `useCreatePayroll`, `useCalculatePayroll`, `useUpdatePayroll` (Task 6); `useEmployeePayments`, `useCreateEmployeePayment` (Task 6); `useUsers()` (existing).

- [ ] **Step 1: Read the full current file** to inventory the manual handlers (`fetchRuns`, `fetchPayments`, `handleCreate`, `handleCalculate`, `handleApprove`, `handlePay`, `handleSavePayment`, expanded-run fetch).

- [ ] **Step 2: Replace list fetching.** Remove `runs`/`payments`/`loading`/`paymentsLoading` state + `fetchRuns`/`fetchPayments`/`useEffect`. Use `const { data: runs = [], isLoading: loading } = usePayrollRuns(filterYear);` and `const { data: payments = [], isLoading: paymentsLoading } = useEmployeePayments();`. This deletes the double-`.data` unwrap bug.

- [ ] **Step 3: Replace the users fetch** (`allUsers` state + `useEffect`) with `const { data: allUsers = [] } = useUsers();` (map to `{username, display_name}` as needed).

- [ ] **Step 4: Replace mutation handlers** with the hooks. Example for create: `const createPayroll = useCreatePayroll();` then in the dialog submit `createPayroll.mutate({ month: Number(newMonth), year: Number(newYear) }, { onSuccess: () => { toast.success('تم إنشاء مسير الرواتب'); setCreateOpen(false); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'فشل') });`. Do the same for `useCalculatePayroll` (pass `runId`), `useUpdatePayroll` ({runId, action:'approve'|'pay'}), `useCreateEmployeePayment`. Replace per-action loading booleans with the mutation's `isPending` (track the active id via the variables or a local `pendingId` only if needed for per-row spinners).

- [ ] **Step 5: Replace expanded-run fetch** with `usePayrollRun(expandedRunId)` (enabled when an id is set); drop `expandedRunData`/`expandedLoading` state.

- [ ] **Step 6: Verify.** `pnpm run check` + `pnpm build` — Expected: PASS.

- [ ] **Step 7: Manual smoke.** Create run → calculate → approve → pay; add a payment; expand a run — all reflect immediately (cache invalidation).

- [ ] **Step 8: Commit.**

```bash
git add app/dashboard/payroll/payroll-client.tsx
git commit -m "refactor(hr): payroll client migrated to React Query hooks (fixes .data bug)"
```

### Task 19: Payroll currency + RTL fix

**Files:**
- Modify: `app/dashboard/payroll/payroll-client.tsx` (or the extracted component in Task 21)

- [ ] **Step 1: Replace the local `formatCurrency`.** Use the shared `formatCurrency` from `@/lib/utils/format` (confirm it exists and its signature). If the shared one already injects correct bidi handling, drop the local `‎` version. If a local helper must stay, keep the LTR mark only around the numeral and verify it renders correctly inside the RTL table.

- [ ] **Step 2: Verify.** `pnpm run check` + `pnpm build`; visually confirm amounts render correctly in the RTL table (numerals not reversed, currency code placed correctly).

- [ ] **Step 3: Commit.**

```bash
git add app/dashboard/payroll/payroll-client.tsx
git commit -m "fix(hr): payroll currency formatting via shared helper"
```

### Task 20: Payroll accessibility pass

**Files:**
- Modify: `app/dashboard/payroll/payroll-client.tsx` (or extracted table in Task 21)

- [ ] **Step 1: Semantic table.** Ensure runs render in a real `<table>` with `<thead>/<th scope="col">`. Each expandable row's toggle is a `<button aria-expanded={isExpanded} aria-controls={detailId}>` with an `aria-label` ("تفاصيل مسير {month}/{year}"). The detail panel has `id={detailId}`.

- [ ] **Step 2: Status badges.** Use `PAYROLL_STATUS_LABELS` (already imported) for text; ensure color is not the only signal (text label present).

- [ ] **Step 3: Verify.** `pnpm run check` + `pnpm build`; keyboard-toggle an expandable row.

- [ ] **Step 4: Commit.**

```bash
git add app/dashboard/payroll/payroll-client.tsx
git commit -m "feat(hr): payroll table accessibility (semantic table, aria-expanded)"
```

### Task 21: Payroll component split

**Files:**
- Create: `components/payroll/PayrollRunsTable.tsx`
- Create: `components/payroll/PayrollRunRow.tsx` (expandable row + per-employee breakdown)
- Create: `components/payroll/EmployeePaymentsTab.tsx`
- Create: `components/payroll/CreatePayrollDialog.tsx`
- Create: `components/payroll/AddPaymentDialog.tsx`
- Modify: `app/dashboard/payroll/payroll-client.tsx` (compose; target <300 lines)

**Interfaces:**
- Produces: `PayrollRunsTable({ runs, loading, expandedId, onToggle, onCalculate, onApprove, onPay, onDownload })`, `EmployeePaymentsTab({ payments, loading, onAdd })`, `CreatePayrollDialog({ open, onOpenChange })`, `AddPaymentDialog({ open, onOpenChange, users })`.

- [ ] **Step 1: Extract** the runs table + row, the payments tab, and the two dialogs into the files above, keeping the mutation hooks inside the dialogs/rows that own the action (no prop-drilling of mutations where a component can own its own hook).

- [ ] **Step 2: Recompose** `payroll-client.tsx` to host the `Tabs` + the extracted pieces; confirm <300 lines.

- [ ] **Step 3: Verify.** `pnpm run check` + `pnpm build`.

- [ ] **Step 4: Manual smoke.** Full payroll flow still works after the split.

- [ ] **Step 5: Commit.**

```bash
git add components/payroll app/dashboard/payroll/payroll-client.tsx
git commit -m "refactor(hr): split payroll into focused sub-components"
```

### Task 22: Final verification + push

- [ ] **Step 1: Full check.** `pnpm run check` + `pnpm build` + `pnpm test` — all green.

- [ ] **Step 2: Lint.** `pnpm lint` — no new raw-fetch or RTL warnings introduced in the touched files.

- [ ] **Step 3: Cross-audience smoke.** Admin: `/dashboard/hr` renders, attendance admin-edit works, payroll flow works. Employee: no `/dashboard/hr` in sidebar + route guard redirect; attendance clock-in/out works; my-payslips reachable.

- [ ] **Step 4: Push the branch + open PR.**

```bash
git push -u origin feat/hr-department-improvement
```

---

## Self-Review (plan vs spec)

**Spec coverage:**
- Part A HR Overview → Tasks 7–12 ✓ (endpoint, hook, widgets, page, sidebar, guide).
- Part B Attendance (consolidate hooks, wire dead `canManage`, admin edit, a11y, split, constants) → Tasks 5, 6, 13–17 ✓.
- Part C Payroll (RQ migration, `.data` bug, a11y, split, currency) → Tasks 6, 18–21 ✓.
- Part D shared (rbac, migration 020, type, users form, constants, sidebar, guide) → Tasks 1–5, 11, 12 ✓.
- Phasing (4 phases, check+build+commit) → enforced per task ✓.

**Placeholder scan:** No "TBD"/"handle edge cases" left abstract; pure-logic tasks ship real tests; the few "match the sibling pattern / confirm import path" notes are intentional verification steps (the exact `requireApiPermission` early-return idiom, `generateId` prefix, `logActivity` arg order, and `formatCurrency`/`dubaiDayKey` signatures are codebase-specific and must be read at implementation time — flagged inline rather than guessed).

**Type consistency:** `HROverview` is defined identically in Task 7 (endpoint) and Task 8 (hook); widget props (Task 9) consume its sub-objects; `UpsertAttendanceInput` (Task 6) matches the admin route body (Task 14); payroll hook names (`usePayrollRuns`/`useCreatePayroll`/`useUpdatePayroll`/`useCalculatePayroll`) are used consistently in Task 18.

**Known verification points for the implementer (not placeholders — codebase confirmations):** `requireApiPermission` return/early-return shape + `Request` vs `NextRequest`; `generateId` import + prefix; `logActivity` signature + `ENTITY_TYPES`/`ACTIVITY_ACTIONS` members; `dubaiDayKey` export from `lib/utils/format`; `formatCurrency` export/signature; `requirePermission` server-page usage; `useUsers` return shape.
