# Productivity Visibility and Deduction Control Hotfix

**Date:** 2026-07-22  
**Status:** Implemented and deployed; retained as design history
**Scope:** July/current-month workflow before payroll is approved or paid

> **Final shipped-state authority:** `docs/EMPLOYEE-DEDUCTIONS-HANDOFF.md`.
> The owner subsequently locked legacy date-only scoring and the database
> cancellation representation; the corrections below reflect that outcome.

## Goal

Restore meaningful monthly productivity reporting for legacy production work without inventing deadline times, show each employee their own month-to-date report on the main dashboard, and give HR administrators explicit control to create or cancel documented deductions before payroll is finalized.

## Locked business rules

- A task with a real date and time is on time only when its qualifying delivery happened at or before that exact timestamp.
- Legacy tasks with a real date-only deadline remain visible and retain Dubai calendar-day scoring. The end-of-day sentinel is not presented as an exact time and is used only for the 24-hour lead-time test. Legacy tasks with no date remain unscored.
- Delivery bands remain 3% / 7% / 12%, and tasks with less than 24 hours of lead time remain excluded from the band.
- Attendance deductions remain outside the 25% disciplinary deduction cap.
- Delivery and any approved quality deduction remain inside the 25% cap.
- Quality is warning-first and never becomes money automatically.
- No deduction writes itself to payroll. Every deduction requires an explicit administrator action.

## Audience contract

| Audience | Access |
|---|---|
| Admin | Month-to-date productivity for all employees, evidence, deduction creation, and pre-payroll cancellation |
| Employee | Own month-to-date metrics, contributing task list, legacy day-scored evidence, and own deduction statuses |
| Sales employee | Own productivity only; no deduction panel and no additional team visibility |
| Client | Nothing |

## Productivity attribution repair

The stage-history snapshot remains the primary source of truth. For legacy reviewed tasks that predate assignee snapshots, the first qualifying review event's immutable `moved_by` actor may restore productivity attribution only when that actor is a valid internal employee and the task is currently assigned to that same employee. Such work is labelled `legacy_actor_verified` and contributes to delivery count, review rounds, first-draft speed, and quality reporting.

This fallback does not manufacture an exact deadline. A migrated end-of-day sentinel remains unverified as a clock time, while a real `due_date` preserves the task's former Dubai calendar-day scoring and may contribute to the delivery band. A task without a real date remains visible and unscored.

The same pure calculation and API result feed both the administrator report and the employee's own dashboard. The employee card shows the current month continuously and exposes the task-level evidence behind the totals.

## Administrator deduction control

The deductions screen provides an explicit apply action with employee, month, amount, currency, category, documented reason, and evidence. The server derives salary currency, rechecks the applicable cap, and creates the `pyra_employee_payments` deduction only through an atomic database function with an idempotent `source_id`.

The administrator may cancel a deduction while its payroll run is not approved or paid. Cancellation is audited rather than deleted: the payment becomes `rejected`, stores `cancelled_at`, `cancelled_by`, and `cancellation_reason`, and is presented as cancelled in the UI.

- If the deduction is not linked to a payroll run, cancellation is immediate.
- If linked to a draft or calculated run, the atomic cancellation invalidates that calculation and requires recalculation before approval, preventing a stale net salary.
- If the payroll run is approved or paid, cancellation is blocked in this hotfix. A later compensating credit workflow is outside the current unpaid-July scope.
- Cancelled rows do not consume the disciplinary cap and are never included in a payslip calculation.

## Storage and API changes

- Extend stage-history reads with `moved_by`; do not store derived productivity counters.
- Add the `legacy_actor_verified` attribution constant and pure attribution tests.
- Migration `049` is the owner-directed exact-deadline correction for Wael's two blocked July tasks. Migration `050` enables explicit current-month computed approval, `051` adds audited cancellation, and `052` fixes the cancellation lock order and race revalidation.
- Add admin-only apply/cancel endpoints gated by `hr.manage`, with `apiSuccess`/`apiError`, `logActivity`, and `logError`.
- Keep the employee report own-scoped through an existing `BASE_EMPLOYEE` permission; no new employee permission is required unless code inspection proves otherwise.
- React Query hooks use `fetchAPI`/`mutateAPI` and invalidate productivity, deductions, payments, and payroll-run queries after mutations.

## UI behavior

- Admin productivity and deductions surfaces show restored month-to-date metrics, task evidence, deadline eligibility, applied/cancelled state, and clear apply/cancel controls.
- The employee main dashboard shows the same own-scope metrics plus the task list. Exact-deadline tasks show their deadline and exact result; legacy dated tasks show that exact timing is unavailable while retaining their calendar-day result.
- Cancellation requires a reason and a confirmation dialog. Loading uses `Skeleton`, full-page empty results use `EmptyState`, and mutations report through Sonner toasts.
- All text is added to matching Arabic and English namespace files; RTL uses logical properties and all light colors have dark variants.

## Failure safety

- No write is performed if employee salary/currency is missing, the amount is invalid, the cap would be exceeded, the evidence is invalid, or the target payroll is already approved/paid.
- Database mutation, audit fields, payroll invalidation, and activity-relevant identifiers are committed atomically.
- Repeated apply/cancel requests are idempotent and cannot double-deduct or double-cancel.

## Test and release gates

Implementation used failing tests for legacy actor attribution, deadline compatibility, cap treatment, cancellation eligibility, payroll invalidation, and admin/employee parity. Migrations 041–052 were checked through `information_schema`, applied with `pnpm db:query`, re-read, and recorded. The deployed hotfix passed `pnpm run check`, 702 Vitest tests across 90 files, and `pnpm build`; future changes must rerun the same gates.
