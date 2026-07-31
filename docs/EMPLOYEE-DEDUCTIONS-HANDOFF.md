# Employee Deductions and Production Productivity Handoff

> **Authoritative implementation handoff — 2026-07-22**
>
> Production was verified on commit `3dc3631` (`fix: preserve legacy productivity metrics`).
>
> Read this document before changing deductions, production deadlines, productivity metrics, or their payroll integration.

## 1. Authority and current status

This feature is built, migrated, and deployed. The authority order is:

1. Locked decisions in `CLAUDE.md`.
2. This handoff.
3. Current code and `DATABASE-SCHEMA.md`.
4. Historical specs/plans under `docs/superpowers/` only as implementation history.

The historical plans are not runbooks. Two final owner overrides supersede early plan text:

- Legacy production tasks with a real date-only deadline remain in productivity scoring using the Dubai calendar day. They are not silently removed from the denominator.
- Cancelling a deduction does not delete evidence and does not add a new database status. The payment becomes `rejected` and receives `cancelled_at`, `cancelled_by`, and `cancellation_reason`; the UI presents that state as cancelled.

## 2. Four-audience contract

| Audience | Productivity | Deductions |
|---|---|---|
| Admin | All employees, task evidence, trends, PDF/XLSX export under `/dashboard/hr/productivity` (`hr.view`) | Review, approve, document, and safely cancel under `/dashboard/hr/deductions` (`hr.manage`) |
| Employee | Own current-month metrics and contributing tasks on `/dashboard` and `/dashboard/my-tasks` (`productivity.view`) | Own amber at-risk projection and approved/cancelled evidence on `/dashboard/my-payslips` (`payroll.view`, server also requires role `employee`) |
| Sales/internal non-admin | Own productivity because internal roles inherit `productivity.view` | Nothing; the own-deduction endpoint and panel are employee-role only |
| Client | Nothing | Nothing |

There is no client-portal surface for this feature.

## 3. Locked business rules

All tunable policy values live in `lib/constants/deductions.ts`. Do not duplicate them inline.

### Attendance lateness

| Delay after schedule start | Deduction units |
|---|---:|
| At or below 15 minutes | 0 |
| More than 15 through 60 minutes | 0.25 day |
| More than 60 through 120 minutes | 0.5 day |
| More than 120 minutes | 1 day |
| No-show | 1 day |
| Existing attendance status `excused` | 0 |

- Daily rate is `monthly salary / 30`, using `DEDUCTION_DAYS_PER_MONTH` from `lib/hr/attendance-policy.ts`.
- Sunday is the only weekend; the normal work week is Monday through Saturday.
- The system reuses schedule start, clock-in minute, grace, attendance status, and absence detection already derived by the attendance policy. It does not invent a second attendance model.
- Attendance money is explicitly outside the 25% disciplinary cap.

### Delivery lateness

The monthly band is based on eligible tasks' on-time rate, not per-task fines:

| Monthly on-time rate | Band | Amount |
|---|---|---:|
| At least 90% | None | 0% of salary |
| At least 75% and below 90% | Minor | 3% of salary |
| At least 50% and below 75% | Moderate | 7% of salary |
| Below 50% | Major | 12% of salary |

- A task with lead time below 24 hours is shown as evidence but excluded from the band. Exactly 24 hours is eligible.
- New production work uses an exact UAE/Dubai deadline. Its first review submission must be at or before that instant; equality is on time.
- Legacy work with a real date-only deadline keeps the former calendar-day scoring basis: a first review submission on or before its Dubai due date is on time.
- The migration sentinel is provenance only. It is never presented as a real time and is used synthetically only for the 24-hour lead-time check.
- Legacy work with no deadline remains visible but unscored. Unverified employee attribution also remains visible to Admin but unscored.

### Quality

- A month is below band when `avg_rounds > 2` **or** outright-rejection rate is at least 20%.
- Money eligibility requires two consecutive below-band months.
- `avg_rounds` and `review_rounds_total` come from review entries in `pyra_task_stage_history` across delivered tasks.
- `pyra_task_review_decisions` supplies the native `revision` versus `outright` classification and the outright-rejection rate. It must not replace stage-history rounds.
- Quality is warning-first and never creates money automatically.
- New quality-money approvals currently fail closed because the owner has not locked the amount or whether charging uses the changing current month versus completed months. This is enforced by `QUALITY_DEDUCTION_APPROVAL_ENABLED = false`.

### Cap and payroll

- The 25% salary ceiling applies only to delivery, explicitly approved quality, and other manual disciplinary deductions.
- Attendance deductions and unpaid leave are outside that ceiling.
- Amounts are calculated and stored only in the employee's `salary_currency`; never sum currencies.
- A deduction becomes payroll money only after an explicit Admin approval creates a `pyra_employee_payments` row with `source_type='deduction'`.
- Attendance and production evidence are never read directly by payroll calculation.

## 4. Data and decision flow

```text
attendance records + schedule                production stage history + review decisions
                 \                              /
                  pure derived monthly evidence
                    lib/hr/deductions*.ts
                              |
                 Admin review (no money yet)
                              |
                     explicit Approve click
                              |
              atomic PostgreSQL approval function
                              |
          immutable case/manual evidence + one idempotent
             pyra_employee_payments deduction row
                              |
                    payroll/payslip calculation
```

The employee's amber “at risk” number is a live projection. It changes as attendance and delivery evidence changes and is not a finalized salary deduction.

## 5. Source-of-truth map

| Concern | Source |
|---|---|
| Policy constants | `lib/constants/deductions.ts` |
| Existing attendance measurement | `lib/hr/attendance-policy.ts` |
| Pure attendance/delivery/quality/cap math | `lib/hr/deductions.ts` |
| Monthly deduction report and integrity blockers | `lib/hr/deductions-report.ts` |
| Approval snapshots | `lib/hr/deduction-approval.ts`, `lib/hr/manual-deduction.ts` |
| Exact Dubai deadline conversion and validation | `lib/production/deadlines.ts` |
| Task journeys and productivity aggregation | `lib/production/metrics.ts` |
| Database-to-metric report mapping | `lib/production/report.ts` |
| Payroll application of approved deduction rows | `lib/payroll/calculate-item.ts` |
| React Query deduction hooks | `hooks/useDeductions.ts` |
| React Query productivity hooks | `hooks/useProductivity.ts` |
| RBAC | `lib/auth/rbac.ts` |
| Schema reference | `DATABASE-SCHEMA.md` |

Metrics remain derived. Do not add stored productivity counters.

## 6. Exact deadlines and legacy compatibility

For `bd_production`:

- Create, duplicate, or move-into-production requires a date and time unless a verified exact deadline is already valid for the move.
- The server derives `due_at` from Dubai-local `due_date` + `due_time`; it does not trust a browser-supplied timestamp.
- First entry to review atomically stores `due_at_snapshot`, `task_created_at_snapshot`, the assignee snapshot, and the permanent deadline lock.
- After first review submission, the deadline cannot be edited.
- The first review submission is the delivery timestamp used for on-time scoring.
- Reviewed production tasks cannot be hard-deleted through direct, board, or project cascades; archive them instead.

Legacy attribution fallback is deliberately narrow:

- If an old review row lacks an assignee snapshot, its immutable first-review `moved_by` may restore attribution only when the current assignment corroborates the same valid internal employee and the task timestamp is valid.
- The task is labelled `legacy_actor_verified` when that fallback is trusted.
- Otherwise it remains `legacy_unverified`, is visible to Admin, and does not affect an employee's score.

Regression guard: never interpret `production_deadline_exempt=true` as “exclude every legacy dated task.” It means the exact clock time is unverified. A real `due_date` still uses day-based scoring.

## 7. Database objects and production migrations

All migrations below were applied to and recorded in the production database as of 2026-07-22.

| Migration | Purpose |
|---|---|
| `041_employee_deductions.sql` | Exact deadlines, review deadline snapshots, `effective_month`, immutable computed deduction cases, atomic approval |
| `042_atomic_task_transitions.sql` | Atomic task advance/move and first-review evidence lock |
| `043_atomic_task_review.sql` | Atomic review decisions and append-only native rejection classification |
| `044_harden_production_evidence.sql` | Deadline/evidence constraints, legacy provenance reconciliation, protected writes |
| `045_production_evidence_clock.sql` | Database-clock and monotonic transition evidence hardening |
| `046_atomic_payroll_integrity.sql` | Atomic payroll writes, cap enforcement, manual deduction evidence |
| `047_harden_deduction_writes.sql` | One-shot private write capabilities; blocks direct deduction DML |
| `048_attendance_tracking_start.sql` | Attendance tracking-start provenance and fail-closed historical attendance |
| `049_correct_wael_task_deadlines.sql` | Owner-directed exact 18:00 Dubai deadlines for Wael's two identified tasks |
| `050_enable_current_month_computed_deduction_approval.sql` | Allows explicit current-Dubai-month computed approval with trusted recomputation |
| `051_cancel_employee_deductions.sql` | Audited soft cancellation and draft/calculated payroll invalidation |
| `052_fix_deduction_cancellation_lock_order.sql` | Canonical payroll-run-first lock order and cancellation race revalidation |

Important tables/columns:

- `pyra_deduction_cases`: immutable computed approval snapshot; unique employee + month.
- `pyra_manual_deductions`: immutable Admin-entered reason, amount, and trusted server evidence.
- `pyra_manual_deduction_tasks`: one-charge-per-task evidence for owner-attested legacy delivery.
- `pyra_deduction_write_capabilities`: private transaction-scoped authorization consumed by protected RPCs.
- `pyra_employee_payments.effective_month`: the month the deduction describes.
- `pyra_employee_payments.deduction_cap_exempt_amount`: approved attendance portion that does not consume the disciplinary cap.
- `pyra_task_review_decisions`: native append-only rejection classification linked to history/activity/comment evidence.

Before any future migration, inspect `information_schema.columns`; never guess names. Use UTF-8 `.sql` files with `pnpm db:query`, especially for Arabic or `%`, and verify `pyra_schema_migrations` before attempting to reapply anything.

## 8. API and UI surfaces

| Surface | Permission/scope | Purpose |
|---|---|---|
| `GET /api/hr/productivity` | `hr.view` | All-employee monthly report |
| `GET /api/hr/productivity/trends` | `hr.view` | Admin trends |
| `GET /api/hr/productivity/export` | `hr.view` | PDF/XLSX export |
| `GET /api/my-productivity` | `productivity.view`, own scope | Employee/internal user's own report and task evidence |
| `GET /api/hr/deductions` | `hr.manage` | Admin monthly review |
| `GET /api/hr/deductions/me` | `payroll.view` plus employee-role check | Employee's own current-month risk/evidence |
| `POST /api/hr/deductions/approve` | `hr.manage` | Recompute and approve the current Dubai month atomically |
| `POST /api/hr/deductions/manual` | `hr.manage` | Documented current-month manual disciplinary approval |
| `POST /api/hr/deductions/cancel` | `hr.manage` | Required-reason audited cancellation |
| `PATCH /api/hr/deductions/attendance-tracking` | `hr.manage` | Record trusted attendance tracking start |

UI wiring:

- Admin productivity: `/dashboard/hr/productivity`.
- Admin deductions: `/dashboard/hr/deductions`; HR overview links to it.
- Employee productivity: main `/dashboard` and `/dashboard/my-tasks`.
- Employee deduction risk: `/dashboard/my-payslips`.
- Sidebar and module guide entries are wired. Deduction navigation is `hr.manage`; productivity administration is `hr.view`.
- All component data uses React Query with `fetchAPI`/`mutateAPI`; migrated UI text is in matching Arabic/English message namespaces.

## 9. Approval, idempotency, and cancellation invariants

Computed approval:

1. Accepts only the current Dubai month.
2. Rebuilds salary, currency, attendance, production evidence, current cap usage, and integrity blockers on the server.
3. Calls `pyra_approve_employee_deduction(...)`.
4. Creates one immutable case and one approved deduction payment atomically.
5. Repeating the same employee/month approval returns the existing case instead of double charging.

Manual approval:

- Requires a reason, amount, basis, and idempotency key.
- Client-supplied evidence is rejected; the server builds trusted evidence.
- Owner-attested legacy delivery requires explicit owner attestation and selected task IDs. Global task uniqueness prevents double charging the same task.
- A stale request above the remaining cap fails instead of silently reducing the requested amount.
- Quality money remains disabled as described above.

Cancellation:

- Requires an Admin reason.
- Unlinked approved deductions are soft-cancelled.
- If linked to a draft/calculated payroll, the RPC locks the run first, revalidates the payment, unlinks payments, deletes stale payroll items, and resets the run to draft for recalculation.
- Paid deductions and deductions inside approved/paid payroll runs cannot be cancelled.
- Evidence rows are retained. The payment becomes `rejected` with complete cancellation audit fields.
- Repeating cancellation is idempotent.
- Cancelled/rejected deductions are excluded from the cap and from payroll/payslip calculations.

The generic `/api/dashboard/employee-payments` POST rejects `source_type='deduction'`. Do not reopen that path.

## 10. Wael production snapshot — 2026-07-22

This is a dated evidence snapshot, not a permanent policy value:

| Item | Verified value |
|---|---:|
| Monthly salary | 25,000 EGP |
| July delivered tasks | 11 |
| On-time tasks | 6 of 11 |
| On-time rate | 55% |
| Delivery band | Moderate, 7% = 1,750 EGP |
| Review rounds | 29 across 11 delivered tasks; average 2.6 |
| Exact-deadline eligible tasks | 2; both late |
| Attendance projection | 3,125 EGP |
| Delivery projection | 1,750 EGP |
| Quality money | 0 EGP; warning-first only |
| Total amber at-risk projection | 4,875 EGP |
| Disciplinary cap | 6,250 EGP (25% of salary) |
| Approved deductions/cases/payroll rows | None at verification time |

The 4,875 EGP is not an applied deduction. Attendance is outside the 25% cap; only the 1,750 EGP delivery component would consume that cap if Admin approves.

Owner-corrected exact deadlines:

| Task | Due in Dubai | Stored UTC instant |
|---|---|---|
| `tk_nRfrQhPIyrEPFeZo` | 2026-07-20 18:00 | `2026-07-20T14:00:00Z` |
| `tk_WT5YlHFDv7Y_Svs5` | 2026-07-21 18:00 | `2026-07-21T14:00:00Z` |

## 11. Do not break these guardrails

- Do not auto-write any detection or projection to payroll.
- Do not read attendance or task lateness directly inside payroll math.
- Do not directly insert, update, or delete deduction payments.
- Do not remove legacy dated tasks from productivity merely because their exact time is unknown.
- Do not treat the migration end-of-day sentinel as an employee-entered deadline.
- Do not calculate average review rounds from `pyra_task_review_decisions`.
- Do not infer outright rejection from legacy free text or JSON strings.
- Do not auto-price quality or turn a warning into money.
- Do not include attendance inside the 25% disciplinary cap.
- Do not sum or cap across currencies.
- Do not cancel paid deductions or mutate approved/paid payroll history.
- Do not fabricate missing historical attendance or deadline evidence; surface an integrity blocker.

## 12. Verification and continuation runbook

Before every future commit:

```bash
pnpm run check
pnpm test -- --run
pnpm build
```

For a live continuation:

1. Fetch `origin/main` and confirm the deployed commit before assuming this snapshot is current.
2. Check `pyra_schema_migrations` for 041 through 052 before changing schema.
3. Re-read live rows after every Arabic write.
4. Verify Admin pages with Admin auth and employee pages with the employee's own auth.
5. For finance mutations, test idempotency, cap recomputation, currency mismatch, stale payroll invalidation, and closed-payroll rejection.
6. Push to `origin/main` only after the owner explicitly approves deployment; Coolify auto-deploys that branch.

The implementation that produced this handoff passed `pnpm run check`, all 702 Vitest tests across 90 files, and `pnpm build` before the deployed hotfix. Rerun the gates after any later edit; historical green results are not permission to skip them.

## 13. Explicitly open items

- Quality-money amount and charging month are not owner-locked. Keep `QUALITY_DEDUCTION_APPROVAL_ENABLED=false` until both are decided.
- There is no automatic compensating credit flow after a deduction has reached a paid payroll; paid history is immutable.
- Employees without trustworthy historical attendance provenance require Admin to set `attendance_tracking_started_on` before attendance money can be approved.
- Wael had no approved July deduction at the dated verification point. Admin must still decide and click Approve; the system must not do it automatically.

## 14. Commit trail

- `21970d3` — exact production deadline metrics
- `d58f11b` — invalid deadline timestamp rejection
- `6b9883f` — Supabase timestamp precision compatibility
- `0a68dcb` — deduction approval storage
- `7b8e2bd` — employee deductions review system
- `cd3769e` — atomic migration smoke fixtures
- `e2118d5` — payroll constraint-output compatibility
- `7bda60a` — productivity/deduction hotfix design
- `bdd55fa` — Wael exact deadline correction
- `b46292a` — verified legacy productivity attribution
- `232a5e9` — employee productivity task evidence
- `1d76b10` — live employee deduction approval
- `58be711` — safe deduction cancellation
- `3dc3631` — preserved legacy productivity metrics
