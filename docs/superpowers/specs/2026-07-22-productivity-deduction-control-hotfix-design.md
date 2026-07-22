# Productivity Visibility and Deduction Control Hotfix

**Date:** 2026-07-22  
**Status:** Owner-approved for implementation  
**Scope:** July/current-month workflow before payroll is approved or paid

## Goal

Restore meaningful monthly productivity reporting for legacy production work without inventing deadline times, show each employee their own month-to-date report on the main dashboard, and give HR administrators explicit control to create or cancel documented deductions before payroll is finalized.

## Locked business rules

- A task with a real date and time is on time only when its qualifying delivery happened at or before that exact timestamp.
- Legacy date-only deadlines migrated to the end-of-day sentinel remain visible but are excluded from delivery on-time scoring and delivery-band deductions.
- Delivery bands remain 3% / 7% / 12%, and tasks with less than 24 hours of lead time remain excluded from the band.
- Attendance deductions remain outside the 25% disciplinary deduction cap.
- Delivery and any approved quality deduction remain inside the 25% cap.
- Quality is warning-first and never becomes money automatically.
- No deduction writes itself to payroll. Every deduction requires an explicit administrator action.

## Audience contract

| Audience | Access |
|---|---|
| Admin | Month-to-date productivity for all employees, evidence, deduction creation, and pre-payroll cancellation |
| Employee | Own month-to-date metrics, the contributing task list, excluded legacy deadlines, and own deduction statuses |
| Sales employee | Same own-scope employee view only; no additional team visibility |
| Client | Nothing |

## Productivity attribution repair

The stage-history snapshot remains the primary source of truth. For legacy reviewed tasks that predate assignee snapshots, the first qualifying review event's immutable `moved_by` actor may restore productivity attribution only when that actor is a valid internal employee and the task is currently assigned to that same employee. Such work is labelled `legacy_actor_verified` and contributes to delivery count, review rounds, first-draft speed, and quality reporting.

This fallback does not manufacture a deadline. A migrated end-of-day sentinel remains `unverified_legacy_deadline`, so the task is listed for transparency but contributes neither an on-time result nor a delivery-band deduction.

The same pure calculation and API result feed both the administrator report and the employee's own dashboard. The employee card shows the current month continuously and exposes the task-level evidence behind the totals.

## Administrator deduction control

The deductions screen provides an explicit apply action with employee, month, amount, currency, category, documented reason, and evidence. The server derives salary currency, rechecks the applicable cap, and creates the `pyra_employee_payments` deduction only through an atomic database function with an idempotent `source_id`.

The administrator may cancel a deduction while its payroll run is not approved or paid. Cancellation is audited rather than deleted: the payment becomes `cancelled` and stores who cancelled it, when, and why.

- If the deduction is not linked to a payroll run, cancellation is immediate.
- If linked to a draft or calculated run, the atomic cancellation invalidates that calculation and requires recalculation before approval, preventing a stale net salary.
- If the payroll run is approved or paid, cancellation is blocked in this hotfix. A later compensating credit workflow is outside the current unpaid-July scope.
- Cancelled rows do not consume the disciplinary cap and are never included in a payslip calculation.

## Storage and API changes

- Extend stage-history reads with `moved_by`; do not store derived productivity counters.
- Add the `legacy_actor_verified` attribution constant and pure attribution tests.
- Migration `050` adds the cancelled payment state/audit fields and a guarded atomic cancellation function after verifying live column and constraint names. Migration `049` is the owner-directed exact-deadline correction for Wael's two blocked July tasks.
- Add admin-only apply/cancel endpoints gated by `hr.manage`, with `apiSuccess`/`apiError`, `logActivity`, and `logError`.
- Keep the employee report own-scoped through an existing `BASE_EMPLOYEE` permission; no new employee permission is required unless code inspection proves otherwise.
- React Query hooks use `fetchAPI`/`mutateAPI` and invalidate productivity, deductions, payments, and payroll-run queries after mutations.

## UI behavior

- Admin productivity and deductions surfaces show restored month-to-date metrics, task evidence, deadline eligibility, applied/cancelled state, and clear apply/cancel controls.
- The employee main dashboard shows the same own-scope metrics plus the task list. Exact-deadline tasks show their deadline and result; legacy deadline tasks show that timing is unavailable and the task was excluded from lateness scoring.
- Cancellation requires a reason and a confirmation dialog. Loading uses `Skeleton`, full-page empty results use `EmptyState`, and mutations report through Sonner toasts.
- All text is added to matching Arabic and English namespace files; RTL uses logical properties and all light colors have dark variants.

## Failure safety

- No write is performed if employee salary/currency is missing, the amount is invalid, the cap would be exceeded, the evidence is invalid, or the target payroll is already approved/paid.
- Database mutation, audit fields, payroll invalidation, and activity-relevant identifiers are committed atomically.
- Repeated apply/cancel requests are idempotent and cannot double-deduct or double-cancel.

## Test and release gates

Implementation starts with failing tests for legacy actor attribution, deadline exclusion, cap treatment, cancellation eligibility, payroll invalidation, and admin/employee parity. Migration verification checks the live schema through `information_schema`, applies via `pnpm db:query`, re-reads the resulting objects, and records migration 050. Every implementation commit must pass `pnpm run check`, `pnpm test -- --run`, and `pnpm build`. Production deployment remains a separate explicit approval before pushing to `origin/main`.
