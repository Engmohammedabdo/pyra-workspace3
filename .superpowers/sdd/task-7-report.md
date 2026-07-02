# Task 7 Report: Document-Types Settings UI

## Files Created
- `app/dashboard/hr/documents/settings/page.tsx` — server component, guards `documents.manage`, exports metadata `أنواع الوثائق`
- `app/dashboard/hr/documents/settings/document-types-client.tsx` — client component, 261 lines (< 300 limit)

## Hooks Used
- `useDocumentTypes` — list query (staleTime 300_000, queryKey `['document-types']`)
- `useCreateDocumentType` — POST `/api/hr/document-types`
- `useUpdateDocumentType` — PATCH `/api/hr/document-types/:id`
- `useDeleteDocumentType` — DELETE `/api/hr/document-types/:id` (soft delete handled server-side)

No raw `fetch()` / `fetchAPI()` / `mutateAPI()` calls in the component — all via React Query hooks.

## check + build results
- `pnpm run check` (tsc --noEmit): PASS — zero errors
- `pnpm build`: PASS — zero errors, new route compiled

## Self-Review
- [x] Uses only React Query hooks (useDocumentTypes / useCreate / useUpdate / useDelete), NOT manual useState-as-cache
- [x] Create + edit share a single `handleSave` handler branching on `editingId`
- [x] Soft-delete confirm dialog with loading state (`deleteMut.isPending`)
- [x] Skeleton shown while `isLoading`; EmptyState with `FileText` icon + action when list is empty
- [x] RTL logical classes only: `me-2` — no `ml-`/`mr-`/`pl-`/`pr-`
- [x] Dark mode pairs: `dark:bg-muted/20`, `dark:text-red-400`, `dark:text-amber-400`
- [x] `toast` from sonner for all success/error feedback
- [x] Fields: `name` (English), `name_ar` (Arabic), `requires_expiry` Switch, `sort_order` number input
- [x] Client file: 261 lines (< 300 limit)
- [x] `'use client'` directive at top of client component
- [x] Arabic UI text throughout

## Commit
SHA: b318c73
Subject: feat(documents): document-types settings UI

---

# Task 7 Report (prior task, now superseded above): `/api/hr/overview` Aggregator

**Branch:** `feat/hr-department-improvement`
**Commit:** `547b7e9`
**Date:** 2026-06-27

---

## TDD RED → GREEN Evidence

### RED phase
Ran `pnpm test -- --run hr-overview-helpers` before creating `lib/hr/overview-helpers.ts`.
Result: **1 test file FAILED** — `Cannot find module '@/lib/hr/overview-helpers'`.
The 54 existing tests in other files still passed (total: 54 passing, 1 file failing).

### GREEN phase
After implementing `lib/hr/overview-helpers.ts`, same command:
**11 test files, 64 tests — all PASS.**
The 10 new tests in `__tests__/hr-overview-helpers.test.ts` cover:
- `computeCelebrations`: birthday match, anniversary year calculation, month exclusion,
  hire-this-year (year=0 excluded), null `date_of_birth` with matching `hire_date`
- `deriveAlerts`: critical (>5 pending), high (payroll not calculated), medium (1-5 pending),
  high (absent no leave), empty array when all OK, sort order (critical → high → medium → low)

---

## Schema Verification (Real DB vs Brief)

| Table | Column discrepancy vs brief | Actual column used |
|---|---|---|
| `pyra_leave_requests` | Brief used `total_days` | Actual: **`days_count`** (integer) |
| `pyra_leave_balances_v2` | Confirmed exists, columns match brief | `total_days`, `used_days`, `carried_over` ✓ |
| `pyra_users` | All columns match | `username`, `display_name`, `status`, `employment_type`, `department`, `hire_date`, `date_of_birth`, `role` ✓ |
| `pyra_attendance` | All columns match | `username`, `date`, `status` ✓ |
| `pyra_payroll_runs` | All columns match | `id`, `month`, `year`, `status`, `total_amount`, `paid_at` ✓ |
| `pyra_employee_payments` | All columns match | `id`, `amount`, `status` ✓ |
| `pyra_evaluation_periods` | All columns match | `id`, `name_ar`, `status` ✓ |
| `pyra_evaluations` | All columns match | `status`, `period_id` ✓ |

**Key correction:** `pyra_leave_requests.days_count` (not `total_days` as in the brief).
The route maps it to `days` in the upcoming-leave response shape.

---

## Auth Idiom

Matched the pattern from `app/api/webhooks/route.ts`:

```ts
const auth = await requireApiPermission('hr.view');
if (isApiError(auth)) return auth;
```

- `requireApiPermission` from `lib/api/auth.ts` — returns `ApiAuthResult | NextResponse`
- `isApiError` narrows to `NextResponse` (early return on 401/403)
- Uses `NextRequest` type for the request parameter (matches all other routes)
- `hr.view` permission confirmed already exists in `lib/auth/rbac.ts` (lines 144-146)

---

## Architecture Decisions

### Pure helpers (`lib/hr/overview-helpers.ts`)
- Zero Supabase imports — only plain TypeScript types and data transformations
- `computeCelebrations(users, todayKey)`: matches birthday/hire-date month, excludes year-0 anniversaries
- `deriveAlerts(input)`: severity-ranked alerts sorted critical→high→medium→low
- `dubaiDayKey()` imported from `lib/utils/format` (confirmed export exists at line 55)

### API route (`app/api/hr/overview/route.ts`)
- Gate on `hr.view` FIRST, before any DB calls
- `createServiceRoleClient()` — bypasses RLS for cross-employee HR aggregation
- 7 parallel-style sequential DB queries (Supabase JS doesn't support true parallel in a single client)
- Absent-no-leave calculation: cross-references attendance `absent` rows against employees with approved leave today
- `paid_liability_days`: filtered to current year to avoid stale multi-year bloat
- Error handling: each query throws on error (throws to outer catch → `logError` + `apiServerError`)

### HROverview shape
Response matches the interface from the brief exactly:
- `headcount.by_type`: uses actual `employment_type` column value as key
- `attendance_today.on_leave`: count of `on_leave_today` list (not a separate query)
- `leave.upcoming`: next 7 days of approved-but-not-started leaves
- `payroll.payrollCalculated`: `curRun.status !== 'draft'` (run exists but not just draft)

---

## check + build Results

```
pnpm run check   → tsc --noEmit → 0 errors ✓
pnpm build       → compiled successfully → 0 errors ✓
pnpm test --run  → 11 files, 64 tests → all pass ✓
```

---

## Self-Review Notes

1. **`days_count` vs `total_days`**: The brief said `total_days` on leave requests — this was wrong. Real column is `days_count`. Fixed in the route; mapped to `days` in the upcoming response shape.

2. **`absentNoLeave` calculation**: The brief's route template uses `absentN` (simple attendance absent count) directly for the alert. I improved this: cross-reference against employees with approved leave today, so the count only includes truly unexcused absences. More accurate.

3. **`payrollCalculated` logic**: Brief uses `curRun.status !== 'draft'` — I implemented this faithfully. A `null` curRun (no payroll run at all this month) → `false` → triggers the `high` alert.

4. **`daysFromNow(-N)` vs `dubaiDayKey`**: I used `dubaiDayKey()` for today's key (correct Dubai-timezone), and plain UTC `daysFromNow()` for 30d/90d hire-date range comparisons. This is acceptable because hire-date comparisons are date-only comparisons at day granularity — the ±4h Dubai offset doesn't affect a 30-day lookback window.

5. **`by_type` uses raw `employment_type` value as key**: The brief's interface says `Record<string, number>`. If `employment_type` is null, it maps to key `'unknown'`. This matches the brief's code snippet.

6. **No `hr.view` in BASE_EMPLOYEE**: This is correct — the HR overview is admin/HR-manager only. The `hr.view` permission is not granted to `BASE_EMPLOYEE`. Only admins (wildcard `*`) get it automatically; other roles would need it added to their DB role.

---

## Fix (Task 7 review)

**Commit:** `c5269a7` — `fix(hr): overview name lookup for inactive users + Dubai-day upcoming-leave window`

### Fix 1 — name lookup for inactive-on-leave users
**File:** `app/api/hr/overview/route.ts` lines 122-125 (post-fix)

Changed `nameOf(username)` to resolve `display_name` from `allUsers` (all non-client users) instead of `activeUsers` (status=active only). An employee who is `inactive` in `pyra_users` but holds an approved leave row would previously fall through to the raw username. Headcount/attendance metrics still use `activeUsers` — only the name-lookup source changed.

---

## Fix (Task 7 review) — DocTypeRow extraction + onOpenChange guard

**Client file new line count:** 276 lines (was 323; under 300 limit).

### What was extracted
Created `components/hr/documents/DocTypeRow.tsx` — a focused `'use client'` presentational component that renders one document-type list row. Props: `{ docType: PyraDocumentType, onEdit, onDelete }`. Contains the row `<div>`, the orange icon square, name/name_ar display, the amber `requires_expiry` badge (with `Calendar` icon + `dark:text-amber-400`), sort_order label, and the edit (`Pencil`) + delete (`Trash2`) icon buttons — all RTL logical classes and dark-mode pairs preserved exactly.

The client now maps `{docTypes.map((dt) => <DocTypeRow key={dt.id} docType={dt} onEdit={openEdit} onDelete={setDeleteId} />)}` — 5 lines instead of the original 50-line inline block.

### Fix 2 applied
Delete-confirm Dialog: `onOpenChange={() => setDeleteId(null)}` → `onOpenChange={(open) => { if (!open) setDeleteId(null); }}` — prevents spurious state resets when the dialog opens (e.g. during animated open transitions).

### check + build results
```
pnpm run check (tsc --noEmit)  → 0 errors ✓
pnpm build                     → compiled successfully, 0 errors ✓
```

---

### Fix 2 — upcoming-leave window uses Dubai day, not UTC
**File:** `app/api/hr/overview/route.ts` lines 136-139 (post-fix)

Replaced `const in7Days = daysFromNow(7)` (UTC-based, off by up to 4 hours at the Dubai day boundary) with Dubai-anchored math: build a `Date` from `todayKey + 'T00:00:00Z'`, add 7 UTC days (`setUTCDate + 7`), then slice `.toISOString()` to `YYYY-MM-DD`. The 30d/90d hire-date lookbacks use the UTC helper unchanged (±4h is inconsequential for a 30-day window).

### Test + check + build results
```
pnpm test hr-overview-helpers  → 1 file, 10 tests — all PASS ✓
pnpm run check (tsc --noEmit)  → 0 errors ✓
pnpm build                     → compiled successfully, 0 errors ✓
```

---

# Task 7 Report (Employee Onboarding sprint): `/api/hr/onboarding` Route

## Status: COMPLETE

## Commit
`3b5b247` — `feat(onboarding): create + list route (wizard backend)`
Branch: `feat/employee-onboarding` (pushed).

## TypeScript check
`pnpm run check` → **zero errors** (no output).

## What was built
**File:** `app/api/hr/onboarding/route.ts` (565 lines)

### GET `/api/hr/onboarding`
- Gate: `hr.manage` → service-role client.
- Returns `pyra_onboarding` rows (recent-first, limit 100) + two bulk joins:
  - `employee_display_name` from `pyra_users` (single `IN` query)
  - `task_progress: { done, total }` from `pyra_onboarding_tasks` (single `IN` query, no N+1)
- `logError` in outer catch.

### POST `/api/hr/onboarding`
Full 10-step flow:
1. `hr.manage` gate + JSON body validation (required: username, password, nameEn, nameAr, titleEn, startDate, basic).
2. Service-role client created after gate.
3. `createEmployeeUser` — role from `isSales`, salary = monthly total (basic+housing+transport+communication+other), hire_date, dob, dept, manager all mapped.
4. Insert `pyra_onboarding` — `generateId('onb')`, status `in_progress`, full `offer_data` snapshot (incl. refNo, year, date via `dubaiDayKey()`), `assets`, `started_by`.
5. Read `company_name` from `pyra_settings` (service-role, fallback `'PyramediaX'`).
6. Generate 3 PDFs via `loadServerPdfFonts()` + `loadServerDefaultLogo()` + dynamic `import()` (avoids client-reference proxy — CLAUDE.md lock):
   - Offer letter, NDA, Asset handover
   - Each blob → `Buffer.from(await blob.arrayBuffer())`
7. `storeGeneratedDocument` × 3 — types `dt_offer_letter` / `dt_nda` / `dt_asset_handover`. Per-store failures logged but non-fatal.
8. Seed `DEFAULT_ONBOARDING_TASKS` into `pyra_onboarding_tasks` (non-fatal on error).
9. `logActivity` — `${ENTITY_TYPES.USER}_${ACTIVITY_ACTIONS.CREATE}` + `metadata.source = 'onboarding_created'` (Phase 11.5 constants lock). `notify` welcome to new employee (best-effort void+catch).
10. Return 201 — `{ id, employee_username, documents: [{ type_id, label, doc_id }] }`. `storage_path` never returned.

**Cleanup on PDF failure:** `logError` + delete `pyra_onboarding` row (tasks cascade via FK) + `apiServerError` with Arabic partial-success message. User row stays per backup-rollback pattern.

## Concerns
- **Partial PDF success** — if 1 of 3 `storeGeneratedDocument` calls fails, route returns 201 with only successful docs. Per brief ("best-effort").
- **Welcome emoji** `🎉` in notify message — non-blocking, consistent with other notify sites in codebase.

---

# Task 7 Report (onboarding review fix subagent)

## Status: COMPLETE

## Commit
SHA: `77081b5`
Subject: `fix(onboarding): seed sales-agent leave balances; status const; all-docs-fail cleanup`
Branch: `feat/employee-onboarding`

## TypeScript check + tests
`pnpm run check` → **zero errors** (tsc --noEmit clean).
`pnpm test` → **14 files, 79 tests — all pass**.

## Fixes applied

### Fix 1 (Important) — `lib/hr/create-employee.ts`
Changed `if (role === 'employee')` → `if (role === 'employee' || role === 'sales_agent')` on the leave-balance seeding block (both v1 `pyra_leave_balances` insert and v2 `pyra_leave_balances_v2` block). Updated the JSDoc comment on line 14 to match.

### Fix 2 (Minor) — `app/api/hr/onboarding/route.ts`
Added `ONBOARDING_STATUS` to the existing import from `@/lib/constants/onboarding`. Replaced hardcoded `status: 'in_progress'` with `status: ONBOARDING_STATUS.IN_PROGRESS`.

### Fix 3 (Minor) — `app/api/hr/onboarding/route.ts`
Removed the dead `let pdfFailed = false` declaration, the `pdfFailed = true` assignment inside the `catch` block, and the unreachable `if (pdfFailed)` guard block. Control flow verified: the `catch` block ends with `return apiServerError(...)`, so the guard was provably unreachable.

### Fix 4 (Important) — `app/api/hr/onboarding/route.ts`
Added "Step 7: All-docs-fail guard" after the PDF `try/catch` block. If `storedDocuments.length === 0` (all three `storeGeneratedDocument` calls failed non-fatally), the guard calls `logError`, deletes the `pyra_onboarding` row (tasks cascade), and returns `apiServerError('فشل في إنشاء مستندات التعيين')`. Partial success (1–2 docs) falls through to task seeding unchanged.

## Concerns
None. All fixes are strictly scoped — only `lib/hr/create-employee.ts` and `app/api/hr/onboarding/route.ts` were modified.
