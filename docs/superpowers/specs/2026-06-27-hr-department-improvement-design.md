# HR Department Improvement — Bundle v1 (Design Spec)

- **Date:** 2026-06-27
- **Status:** Approved (brainstorming) → ready for implementation plan
- **Branch:** `feat/hr-department-improvement`
- **Author:** Claude (orchestra brainstorming session)

---

## 1. Context

The HR department of Pyra Workspace spans ~15 pages (attendance, leave,
timesheet, payroll, my-payslips, evaluations, directory, announcements,
approvals, org-chart, users, my-tasks, + settings pages). A research sweep
(pages + APIs + hooks + schema) surfaced three buckets of gaps:

- **A — UI/UX & code quality:** the **Attendance** and **Payroll** pages use
  raw `fetch()` + local component state, violating the project's React Query
  data-layer mandate (every other module complies). ~17 HR hooks are missing.
  Accessibility gaps (charts, org-chart keyboard nav). Visual inconsistencies.
- **B — Functional gaps:** no bulk-approve, no timesheet pagination, **admin
  cannot manually adjust attendance** (`attendance.manage` exists but has no
  UI), no cascade-delete safety, no public-holiday handling.
- **C — Missing capabilities:** **no HR analytics/overview dashboard**, no
  onboarding/offboarding, no employee documents vault, no asset management,
  no probation/anniversary tracking.

## 2. Goals (this spec)

Deliver the **recommended bundle**: a new **HR Overview dashboard** plus a
**UI/UX + React Query + accessibility uplift** on the two weakest pages
(Attendance, Payroll), including light admin control where it serves the
admin/HR-manager audience.

Balance the two relevant audiences equally: **Admin / HR-manager tooling**
and **Employee self-service** experience.

## 3. Scope

### In scope
1. **HR Overview dashboard** (`/dashboard/hr`) — new, admin-only (`hr.view`).
2. **Attendance** page — React Query migration, accessibility, visual refresh,
   **admin manual attendance editing** (`attendance.manage`).
3. **Payroll** page — React Query migration, accessibility, visual refresh.
4. **Shared plumbing** — new `hr.view`/`hr.manage` permissions, the missing
   HR hooks, attendance status constants, a `date_of_birth` column on
   `pyra_users` (for the Celebrations widget), sidebar + module-guide wiring.

### Out of scope (→ separate specs / backlog)
- **Onboarding/Offboarding** and **Employee Documents** — user's roadmap; each
  gets its own spec → plan → implementation cycle after this bundle ships.
- Backlog (not chosen): timesheet pagination, bulk-approve, cascade-delete
  safety, public-holiday calendar, asset management, org-chart keyboard nav,
  directory `tel:` links, announcement read indicators.

## 4. Audience analysis (the 4-audience rule)

| Audience | Impact |
|---|---|
| **Admin** | New HR Overview command center; new admin attendance-edit control; polished Payroll. |
| **Employee** | Polished Attendance (clock-in/out) + clearer payslips path; benefits from a11y + visual uplift. No access to HR Overview. |
| **Sales Agent** | Inherits the same employee-facing Attendance/Payroll polish (they use HR self-service). No HR Overview. |
| **Client (portal)** | **None** — HR is internal-only. No portal surface. |

## 5. Architecture decisions

**D1 — HR Overview = single aggregator endpoint.** `GET /api/hr/overview`
returns all sections in one round trip (mirrors `/api/my-work`), consumed by
one `useHROverview()` hook. Rejected alternative: per-widget endpoints/hooks
(CRM-dashboard style) — over-engineering for a ~7–15 user team.

**D2 — Attendance/Payroll = migrate + split, not just swap.** While in these
files for the React Query migration, also split the oversized clients
(Attendance 579 LOC, Payroll 876 LOC) into focused sub-components (<300 lines
each per project rule) and restyle with existing primitives. Rejected
alternative: in-place data swap only — leaves 800-line files, misses the
"improve ui/ux" goal.

**D3 — Reuse the existing visual system.** `KpiCard`, `StatCard`, `SmartAlerts`
pattern, Recharts wrappers, `EmptyState`, `Skeleton`, Phase-13 gradient/
subtlety locks. Consistency over novelty in an ERP.

## 6. Part A — HR Overview dashboard (NEW)

- **Route:** `app/dashboard/hr/page.tsx` (server; `requirePermission('hr.view')`)
  + `app/dashboard/hr/hr-overview-client.tsx` (client).
- **Access:** new permission **`hr.view`**. NOT in `BASE_EMPLOYEE`. Admin gets
  it via `*`. Grantable later to an HR manager via DB role or `extra_permissions`.
  `hr.manage` reserved for future write surfaces.
- **Endpoint:** `GET /api/hr/overview` — `requireApiPermission('hr.view')`,
  service-role client (reads payroll/attendance which are service-role-only per
  audit Gap #3). Returns one typed object with these sections:

  | Section | Contents |
  |---|---|
  | `headcount` | active total; counts by `employment_type`; by `department`; new hires (last 30d / 90d via `hire_date`) |
  | `attendance_today` | present / absent / late / on_leave counts; present-rate % |
  | `leave` | pending request count; on-leave-today list; paid-leave liability (Σ remaining paid days from balances v2); upcoming approved leave (next 7d) |
  | `payroll` | current-month run + status; last paid total; 6-month net-pay trend array (for chart); pending `employee_payments` count + sum |
  | `evaluations` | active period; pending / submitted / acknowledged counts; overdue |
  | `alerts` | derived w/ severity (`critical`/`high`/`medium`/`low`) — e.g. leave pending >3d, payroll not calculated, employees absent w/o leave |
  | `celebrations` | this-month work anniversaries (`hire_date`) + birthdays (`date_of_birth`) |

- **Hook:** `hooks/useHROverview.ts` → `useHROverview()`, `staleTime: 60_000`,
  `refetchOnWindowFocus: true`. Typed `HROverview` interface.
- **Layout (top → bottom):**
  1. Page header (title + "today" note).
  2. **HR Alerts** banner (reuse the `SmartAlerts` severity/visual pattern).
  3. **KPI row** — 5× `KpiCard`: Headcount · Present-today % · On-leave-today ·
     Pending approvals · Monthly payroll cost.
  4. **Charts row** — Headcount-by-department (bar/donut) + Payroll 6-mo trend
     (area/line) via existing Recharts wrappers.
  5. **Lists row** — Upcoming leave (7d) · Pending approvals (link to
     `/dashboard/approvals`) · Evaluations status · Celebrations.
- **New components** under `components/hr/overview/` (each <300 lines):
  `HrAlerts.tsx`, `HrKpiRow.tsx`, `HeadcountChart.tsx`, `PayrollTrendChart.tsx`,
  `UpcomingLeaveList.tsx`, `EvaluationsStatusCard.tsx`, `CelebrationsCard.tsx`.
- **States:** `Skeleton` while loading; `EmptyState` (full-page) when no data;
  inline-stub empty states inside compact sidebar cards (Phase-13 lock).
- **RTL + dark mode:** logical properties only; paired `dark:` variants.

## 7. Part B — Attendance improvements

- **Data layer** (`hooks/useAttendance.ts`): keep `useAttendance(params)`; add
  `useAttendanceSummary(params)`, `useClockIn()`, `useClockOut()`, and admin
  `useUpsertAttendance()` + `useDeleteAttendance()`. Remove **all** raw `fetch()`
  + local fetch-state from `attendance-client.tsx`; use `fetchAPI`/`mutateAPI`.
- **Admin control (`attendance.manage`):** an admin section/tab — pick employee
  + month → view their grid → add/correct a day (clock-in/out, status, notes)
  via a dialog. New API: `PATCH /api/dashboard/attendance/[id]` + an admin-create
  path, gated on `attendance.manage`; `logActivity()` on writes.
- **Accessibility:** keyboard-navigable calendar grid; per-day `aria-label`
  (date + status); visible status legend; `aria-live` on clock-in/out result.
- **Refactor/polish:** split into `components/attendance/` (calendar grid,
  summary cards via `KpiCard`, today-card, records table, admin-edit dialog).
  Add `ATTENDANCE_STATUS` + `ATTENDANCE_STATUS_LABELS` + colors to
  `lib/constants/statuses.ts` (currently hardcoded inline). Dark-mode + RTL pass.

## 8. Part C — Payroll improvements

- **Data layer:** `hooks/usePayroll.ts` add `useCreatePayroll()`,
  `useUpdatePayroll()`, `useCalculatePayroll()`, `useMyPayslips()`; new
  `hooks/useEmployeePayments.ts` → list + `useCreateEmployeePayment()`,
  `useUpdateEmployeePayment()`, `useDeleteEmployeePayment()`. Remove **all** raw
  `fetch()` + local fetch-state from `payroll-client.tsx`.
- **Accessibility:** semantic `<table>`; keyboard-accessible expandable
  per-employee rows; RTL-safe currency rendering (review the `\u200E` usage).
- **Refactor/polish:** split into `components/payroll/` (runs table +
  expandable breakdown, payments tab list + filters, create/edit dialogs).
  Reuse `KpiCard` for summaries, `EmptyState`, `Skeleton`. Dark-mode + RTL.
- **Permission unchanged:** Payroll stays `payroll.manage` (admin); my-payslips
  stays `payroll.view` (self).

## 9. Part D — Shared / cross-cutting

- **RBAC** (`lib/auth/rbac.ts`): add `hr.view` + `hr.manage` to `PERMISSIONS`
  and a new "HR Overview" permission-module group (label/labelAr). Not in
  `BASE_EMPLOYEE`.
- **DB migration `020`** (`supabase/migrations/020_*.sql`): add
  `date_of_birth date NULL` to `pyra_users`. Risk tier 1 (additive). Apply via
  `pg/query`, verify, then `pnpm db:record 020`.
- **Type:** add `date_of_birth?: string` to `PyraUser` in `types/database.ts`.
- **Users module:** add `date_of_birth` field to the create/edit dialog in
  `users-client.tsx` and to `/api/users` POST + PATCH (validated, optional).
- **Constants:** attendance status labels/colors in `lib/constants/statuses.ts`.
- **Sidebar** (`components/layout/sidebar.tsx`): add `/dashboard/hr`
  ("نظرة عامة", icon e.g. `LayoutDashboard`/`Gauge`) at the **top** of the HR
  group, `permission: 'hr.view'`.
- **Module guide:** add `/dashboard/hr` entry to `lib/config/module-guide.ts`
  + `app/dashboard/guide/page.tsx` SECTIONS; refresh attendance/payroll tips if
  behavior changes.

## 10. Hook inventory (created this bundle)

`useHROverview` · `useAttendanceSummary` · `useClockIn` · `useClockOut` ·
`useUpsertAttendance` · `useDeleteAttendance` · `useCreatePayroll` ·
`useUpdatePayroll` · `useCalculatePayroll` · `useMyPayslips` ·
`useEmployeePayments` (+ create/update/delete). All via `fetchAPI`/`mutateAPI`,
typed, with cache invalidation on mutations.

## 11. Phasing (each phase: `pnpm run check` + `pnpm build` → commit → push)

1. **Phase 1 — Plumbing:** `hr.view`/`hr.manage`; migration 020 + `PyraUser`
   type + users-form `date_of_birth`; attendance status constants; all missing
   hooks (queries + mutations).
2. **Phase 2 — HR Overview:** `/api/hr/overview` endpoint + `useHROverview` +
   dashboard page + components + sidebar + module-guide.
3. **Phase 3 — Attendance:** migrate client to hooks; admin attendance edit
   (API + UI); a11y + component split + polish.
4. **Phase 4 — Payroll:** migrate client + employee-payments to hooks; a11y +
   component split + polish.

## 12. Testing & verification

- Each phase MUST pass `pnpm run check` (tsc) + `pnpm build` before commit.
- Migration 020 applied + verified via `pg/query`, then `pnpm db:record`.
- Manual smoke per audience: admin sees `/dashboard/hr`; employee does NOT
  (sidebar hidden + route guard); employee clock-in/out works through hooks;
  admin attendance edit writes + logs; payroll create/calculate works through
  hooks.
- Data-layer compliance: zero raw `fetch()` remaining in `attendance-client.tsx`
  and `payroll-client.tsx`.

## 13. Risks & mitigations

- **Large-file refactor regressions** → split along natural seams only; verify
  build per phase; keep mutation/optimistic behavior identical.
- **Payroll/attendance are service-role-only** (audit Gap #3) → the overview
  endpoint + admin attendance route use `createServiceRoleClient()` after the
  `requireApiPermission` gate; never the session client for those tables.
- **`hr.view` admin-only** → no employee data leak; route + API + sidebar all
  gated on the same permission.

## 14. Roadmap (next, separate specs)

1. Onboarding / Offboarding workflows.
2. Employee Documents vault (+ expiry alerts).
