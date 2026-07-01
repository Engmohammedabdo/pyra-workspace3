# HR + Payroll Organization & Multi-Currency — Design Spec

> **Status:** Draft for user review · **Date:** 2026-07-01
> **Author:** Orchestra audit (8-agent gap audit → opus synthesis) + verification
> **Next step after approval:** `superpowers:writing-plans` → `subagent-driven-development`

## Goal

Turn the HR + payroll + user-management area from "spaghetti with gaps" into an
organized, fully-connected system with **no silent gaps** and **first-class
multi-currency payroll** (so the EGP remote contractors are real employees, not a
`salary=0` hack). Keep the onboarding wizard and the users page separate but
provably linked.

## Health verdict (honest)

**Moderately spaghetti, but salvageable — the rot is in the seams, not the core.**
`lib/payroll/calculate-item.ts` (pure, unit-tested) and `lib/hr/create-employee.ts`
(DRY user creation) are genuinely clean. The disorganized feeling has **3 root
causes**:

1. **No schema of record** — real columns (`national_id`, `bank_details`,
   `commission_rate`, `work_schedule_id`) exist but have no write path; the
   onboarding wizard captures the same data into an untyped `offer_data` JSON
   blob that `pyra_users` never reads back → the "same" employee has two
   disconnected records.
2. **A currency model that was never built** — currency is per-RUN + hardcoded
   `'AED'`; no per-user currency; EGP isn't in the exchange-rate table; ~10 UI
   sites call `formatCurrency()` with no currency arg. The `salary=0` contractor
   hack is a symptom.
3. **Silent broken connections** — verified below.

## 🔴 Verified critical bugs (found + confirmed against the live DB)

1. **Unpaid-leave deduction is ALWAYS ZERO.**
   `app/api/dashboard/payroll/[id]/calculate/route.ts:112` selects
   `total_days, leave_type_id` from `pyra_leave_requests`. **Neither column
   exists** — the real columns are `days_count` and `type` (verified via
   `information_schema`). PostgREST returns null → `unpaidLeaveByUser` is always
   empty → **no employee ever gets an unpaid-leave deduction**, even though that
   is the ONLY deduction in the locked payroll model. Hidden by a wrong
   `PyraLeaveRequest` TS type that carries the same wrong names.
   - `pyra_leave_requests` actual columns: `id, username, type, start_date,
     end_date, days_count, reason, status, reviewed_by, reviewed_at, review_note,
     created_at, cancelled_at, cancelled_by, cancellation_reason`.
   - Note: `type` is a **name string**, not an FK; is_paid must be resolved by
     matching `type` → `pyra_leave_types.name` (there is no `leave_type_id`).

2. **EGP missing from `EXCHANGE_RATES`** (`lib/utils/currency.ts:7` — only AED,
   USD, SAR). `toAED(amount, 'EGP')` returns the raw EGP as if it were AED →
   corrupts finance/P&L for any EGP expense. Not yet triggered (contractors are
   `salary=0`) but MUST land before any EGP payroll run generates expenses.

3. **Cross-month leave silently missed** — the same deduction query filters
   `start_date BETWEEN month`, so a leave spanning a month boundary is dropped
   from the later month. Fix with an overlap filter
   (`start_date <= endEnd AND end_date >= start`) + intersect days with the run
   month.

## Current-state map

**Core entity `pyra_users`** is created via TWO paths that share
`createEmployeeUser()`:
- **A)** `/dashboard/users` dialog — fast, bare account (username/display_name/
  role/job_title/phone); all employment fields are EDIT-only.
- **B)** `/dashboard/hr/onboarding` wizard — rich (bilingual names, nationality,
  passport, ID, salary breakdown, assets, 3 PDFs, checklist).

Both INSERT the same `pyra_users` row, but there is **no `onboarding_id` link**,
the users list can't tell onboarded vs raw, and there is **no cross-navigation**.
Wizard-only data (national_id, commission_rate, salary breakdown) lands in
`offer_data` JSON and is never persisted to the typed columns.

**Payroll chain:** `pyra_payroll_runs` (one per month/year, currency hardcoded
`'AED'`) → calculate sweeps `status='active'` users with meaningful comp →
`calculatePayrollItem()` (pure, tested) → `pyra_payroll_items`. Inbound:
`pyra_employee_payments` (approved+unlinked), `pyra_timesheets` (approved
overtime), `pyra_leave_requests` (unpaid leave — **BROKEN, always zero**).
Outbound: APPROVE → one `pyra_expenses` row/employee (`ec_salaries`,
`run.currency`) → finance/P&L (via `toAED`, **no EGP entry**). PAY →
`markPaymentsPaidAndPropagate()`.

**Currency state:** no per-user currency; `run.currency` always `'AED'`;
`total_amount` is a blind cross-currency SUM; ~10 `formatCurrency()` calls pass
no currency → everything shows AED. EGP contractors added with `salary=0` → they
are invisible in payroll, headcount cost, and P&L.

**IA drift:** 15-item HR sidebar group (self-imposed max 7); payroll filed under
Finance but documented under HR; users/teams/roles in one sidebar group but a
different guide section; document-types settings is a sidebar+guide orphan;
`/dashboard/approvals` gated on `leave.view` so it shows to every employee.

## Design 1 — First-class multi-currency payroll

**Principle:** currency becomes an attribute of the EMPLOYEE; each RUN is
**single-currency**; every display is currency-aware. This removes the `salary=0`
hack — EGP contractors get a real EGP salary and are swept by an EGP run.

**Migrations**
- `025` (schema of record): `ALTER TABLE pyra_users ADD COLUMN salary_currency
  varchar(3) NOT NULL DEFAULT 'AED'` (existing rows → AED, correct). Also
  `onboarding_id varchar NULL FK → pyra_onboarding ON DELETE SET NULL`, and
  `salary_breakdown jsonb NULL`.
- `026` (payroll item currency): `ALTER TABLE pyra_payroll_items ADD COLUMN
  currency varchar(3) NOT NULL DEFAULT 'AED'`. Replace the `pyra_payroll_runs`
  unique on `(month, year)` with `(month, year, currency)` so an AED run AND an
  EGP run can coexist in the same month.
- `lib/utils/currency.ts`: add `EGP` to `EXCHANGE_RATES` (verify the rate at
  build time).

**Run = single currency** (the key simplification for a 2-person team — no
in-run conversion, no mixed sums):
- `app/api/dashboard/payroll/route.ts` POST accepts `currency` from body
  (default `'AED'`); uniqueness check becomes `(month, year, currency)`.
- `CreatePayrollDialog.tsx`: currency `Select` (AED/EGP/USD/SAR) beside
  month/year; reset on close.
- `calculate/route.ts`: select `salary_currency`; filter `activeEmployees` by
  `salary_currency === run.currency`; select `currency` on employee_payments and
  only link those matching `run.currency` (skip + return a `warnings` array for
  mismatches); populate `item.currency = run.currency`. `total_amount` stays a
  plain sum — now safe because the run is single-currency. **Also ships the
  Phase 0 leave fix here.**

**Display** (thread currency everywhere — the "everything shows AED" fix):
`PayrollRunRow.tsx` per-item cells; `EmployeePaymentsTab.tsx`;
`my-payslips-client.tsx` (group grandTotal by currency); `HrKpiRow.tsx` +
`PayrollTrendChart.tsx` (per-currency / last_paid_currency); `user-detail`
salary; users edit dialog (replace hardcoded `الراتب الشهري AED` label with a
`salary_currency` select); `payslip-pdf.ts`.

**Contractor un-hack** (operational): set the two EGP contractors
`salary_currency='EGP'`, `salary=<real monthly EGP>`, remove `salary=0`. Create a
June-EGP + July-EGP run → they appear with correct EGP amounts + pro-ration.

## Design 2 — Onboarding ↔ Users (separate but linked)

**Principle:** keep the two surfaces separate (different speed/intent) but make
them provably ONE employee record — same schema of record, clearly linked, no
silent divergence.

1. **The link** (migration 025): `pyra_users.onboarding_id` set in the
   onboarding POST after `createEmployeeUser` succeeds (replaces fragile
   username-matching).
2. **Both paths write the same employment fields:** extend `CreateEmployeeInput`
   + `createEmployeeUser` to accept `national_id, commission_rate,
   employment_type, work_location, salary_currency, salary_breakdown`. The wizard
   already collects idNumber/commissionRate/allowance-breakdown — pass them
   through instead of parking them only in `offer_data`. Add employment_type +
   work_location to Wizard Step 1.
3. **Cross-link UI:** users-list badge "معيّن عبر الإيبورد" → onboarding record;
   user-detail "عرض ملف التعيين"; onboarding-detail "عرض الموظف"; users create
   dialog info note pointing to the onboarding wizard.
4. **Lifecycle integrity:** onboarding `action='cancel'` also sets the user
   `status='inactive'` (no ghost logins).
5. **Guide entries:** update `module-guide.ts` + guide SECTIONS so each surface
   references the other; add the missing document-types-settings entry.
6. **Type safety:** define an `OfferData` interface and cast `offer_data` to it
   in onboarding-detail (currently untyped).

## Organization plan (phased — review after each)

- **Phase 0 — Correctness hotfixes** (~½ day, no schema change): fix
  always-zero unpaid-leave deduction (correct columns + is_paid via
  `pyra_leave_types.name` + cross-month overlap); fix `PyraLeaveRequest` type +
  add `commission` to `PyraPayrollItem`; add EGP to `EXCHANGE_RATES`; enforce
  `leave.create` on POST. Verify by re-calculating the current run.
- **Phase 1 — Schema of record** (~1 day): migration 025; wire national_id,
  bank_details, commission_rate, work_schedule_id, salary_currency,
  salary_breakdown into users GET/POST/PATCH + createEmployeeUser + edit dialog;
  reconcile `employment_type` enum into a single constant.
- **Phase 2 — Multi-currency payroll** (~1½ days): Design 1. Un-hack contractors.
- **Phase 3 — Onboarding↔Users linking** (~1 day): Design 2.
- **Phase 4 — Complete workflows** (~1 day): EmployeePaymentsTab approve/pay row
  actions; HR Overview combined pending-approvals KPI (leave+expense+timesheet);
  leave approve/reject notifications; DELETE draft-run endpoint+UI; fix
  `useUpdatePayroll` cache invalidation; remove dead `useDeleteLeaveRequest`;
  contractor leave gate.
- **Phase 5 — Security hardening** (~½ day): migrate timesheet, overtime-summary,
  timesheet-periods routes to gate-then-service-role before Gap #3 Phase 2 FULL
  revokes their grants.
- **Phase 6 — IA + consistency** (~1 day): split the 15-item HR sidebar into
  Admin vs Self-service; move payroll into HR-admin (or fix the guide); gate
  approvals on `leave.approve`; align guide sections to sidebar groups; extract
  `MONTH_NAMES_AR` + `formatTime`/`formatHours` to shared consts; replace UTC
  day-keys with `dubaiDayKey()`; route activity logs through `logActivity()`;
  replace raw fetches in user-detail with hooks; use `PASSWORD_MIN_LENGTH` in the
  wizard; document the accrual-at-approve + hourly/per_task pay model in
  CLAUDE.md.

**Total ≈ 6–7 focused days.** Phases are independently shippable; Phase 0 is a
pure correctness win that can ship immediately.

## Non-goals / locked (do not change)

- Attendance stays NOT wired to payroll (locked).
- Fixed monthly salary; only approved unpaid leave deducted; no tax/GPSSA.
- No rewrite — this is a schema-of-record pass + a currency layer + a nav
  cleanup, not a redesign.

## Open decisions for the user

1. **Scope/order:** ship all 6 phases in sequence, or a subset first? (Recommend:
   Phase 0 immediately, then 1→2 for the contractors, then 3–6.)
2. **Expense accounting basis:** the payroll→expense bridge currently fires on
   APPROVE (accrual), not PAY (cash). Keep accrual-at-approve (documented) or
   switch to on-pay? (Recommend: keep + document.)
3. **Contractor leave:** block leave submission for `employment_type=contract`
   entirely? (Recommend: yes.)
