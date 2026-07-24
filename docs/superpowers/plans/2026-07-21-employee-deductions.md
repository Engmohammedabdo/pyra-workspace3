# Employee Deductions and Exact Production Deadlines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add exact Dubai-time production deadlines and a transparent, derived employee-deductions workflow that never touches payroll until an admin explicitly approves a capped monthly case.

**Architecture:** Keep `pyra_tasks.due_date` as a compatibility day field and add `due_at timestamptz` for the production board. Snapshot the deadline on each review-entry history row, then derive delivery, attendance, and quality evidence in pure functions. Persist only an immutable approved monthly case; one service-role-only database function atomically creates that case and its idempotent `pyra_employee_payments` deduction row.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase/Postgres, React Query 5, next-intl, Tailwind/shadcn, Vitest, pnpm.

## Global Constraints

- Delivery deduction percentages are exactly: minor `3%`, moderate `7%`, major `12%` of monthly salary.
- Monthly attendance + delivery + explicitly approved quality deduction plus existing manual `source_type='deduction'` rows is capped at exactly `25%` of that employee's salary snapshot. Unpaid leave remains outside this disciplinary-deduction ceiling (owner-confirmed 2026-07-22).
- A task whose exact `due_at - created_at` lead time is less than `24` hours is visible but excluded from the on-time-rate denominator. Exactly 24 hours remains eligible.
- Quality is below band when monthly `avg_rounds > 2` OR outright-rejection rate is `>= 20%`; it becomes money-eligible only after `2` consecutive below-band months. The monthly cohort is the unique production tasks that received a native review decision in that month; the rejection numerator is the outright subset of that same cohort (owner-confirmed 2026-07-22).
- Attendance tiers are: `<=15` late minutes free; `>15..60` quarter day; `>60..120` half day; `>120` or no-show full day. Daily rate is `salary / 30`.
- Exact deadline comparison is `first_submitted_at <= due_at_snapshot`; equality is on time. Canonical wall time is `Asia/Dubai` (`+04:00`, no DST).
- Existing production tasks with a day deadline received the migration-041 compatibility value `23:59:59.999 Asia/Dubai`; that value is explicitly unverified and excluded from delivery scoring. The identified historical task with no deadline remains null and unscored; no deadline is fabricated.
- New production tasks and every duplicated production task require a newly chosen date and time. A duplicate never inherits the source production deadline. Generic boards retain optional date-only behavior (owner-confirmed 2026-07-22).
- A production deadline cannot be changed after the first review submission. The immutable snapshot, not a later task edit, drives metrics.
- A production task that entered review cannot be hard-deleted, including through a parent board/project cascade; it must be archived so payroll evidence survives (owner-confirmed 2026-07-22).
- Current-month employee data is an amber at-risk projection only. Approval is always an explicit admin action; whether approval is restricted to a closed month is an unresolved owner decision.
- Quality never supplies a money amount automatically. After eligibility, the admin enters the amount and documented reason explicitly (owner-confirmed 2026-07-22).
- Admin page/API gates use `hr.manage`; the employee read endpoint uses existing `payroll.view`, exact self scope, and legacy role `employee`. Sales-agent and client roles receive no deductions surface.
- No new RBAC permission is introduced, so no live `pyra_roles` row update is required.
- A real deduction is exactly one `pyra_employee_payments` row with `source_type='deduction'`, `status='approved'`, `source_id=<case id>`, and the employee's `salary_currency`.
- Never auto-write payroll. Never sum different currencies. Never classify legacy rejection notes as outright rejection.
- Components use React Query hooks with `fetchAPI`/`mutateAPI`; no new raw `fetch()` calls.
- All visible/API text in migrated paths comes from `messages/{ar,en}` with key parity. Persisted Arabic must carry an `i18n-exempt` reason.
- RTL uses logical properties only and every light color has a dark variant.
- Every phase runs `pnpm.cmd run check`, `pnpm.cmd test -- --run`, and `pnpm.cmd build` before its commit.
- Keep commits local. Fetch and obtain explicit owner approval before any push to `origin/main`.

## Verified Starting Evidence

- Baseline: `check` clean, `27/27` test files and `189/189` tests pass, production build exits 0.
- Live `pyra_tasks.due_date` is nullable `date`; there is no `due_at`.
- Live `pyra_task_stage_history` columns are exactly: `id`, `task_id`, `board_id`, `from_column_id`, `to_column_id`, `moved_by`, `approved_by`, `time_in_stage`, `created_at`.
- Pre-041 all-row live production audit found 16 rows: 12 active dated, 3 archived dated, and 1 active completed historical task with no date and two review entries.
- Live employee-payment ledger has one commission row and zero deduction rows; there are no duplicate `(source_type, source_id)` pairs.
- Live task activity stores all 15 old `stage_rejected` details as JSONB strings, not JSON objects.
- Current production create, calendar-create, quick-add, and task-sheet edit surfaces have no time field; they write `due_date` only. Production uses the generic `BoardViewClient`, so exact time must be gated by `PRODUCTION_BOARD_ID`, never by `is_pipeline`.
- July 2026 live evidence for `wael.hany` contains 12 currently assigned production tasks and 9 review entries, but all deadlines/snapshots are migration-041 sentinels and all review assignee snapshots are null. Three submissions are provably after the entire due calendar day; same-day timing and the 24-hour exclusion cannot be reconstructed. The owner requires a July deduction, so it must be stored as an explicitly documented manual legacy exception with an owner-confirmed amount—not represented as an automatically calculated delivery band. The amount is still pending explicit confirmation, and no financial row has been written.

---

### Task 1: Pure deadline, delivery, and quality metric contract

**Files:**
- Create: `docs/superpowers/plans/2026-07-21-employee-deductions.md`
- Create: `lib/constants/deductions.ts`
- Create: `lib/constants/production.ts`
- Create: `lib/production/deadlines.ts`
- Modify: `lib/production/metrics.ts`
- Modify: `lib/production/report.ts`
- Test: `__tests__/production-deadlines.test.ts`
- Test: `__tests__/production-metrics.test.ts`

**Interfaces:**
- Produces `PRODUCTION_BOARD_ID`, Dubai-local conversion helpers, exact `due_at` journeys, lead-time eligibility, and quality-rate fields consumed by every later task.
- Preserves `EmployeeProductivity.on_time_pct`, `late_count`, `avg_delay_days`, and `avg_rounds` while adding `outright_rejection_rate` and `reviewed_task_count`.

- [ ] **Step 1: Add the locked constants without duplicating attendance-policy values**

```ts
export const DELIVERY_DEDUCTION_PERCENT = { MINOR: 3, MODERATE: 7, MAJOR: 12 } as const;
export const MONTHLY_DEDUCTION_CAP_PERCENT = 25;
export const DELIVERY_MIN_LEAD_TIME_HOURS = 24;
export const QUALITY_AVG_ROUNDS_THRESHOLD = 2;
export const QUALITY_REJECTION_RATE_THRESHOLD_PERCENT = 20;
export const QUALITY_CONSECUTIVE_MONTHS_REQUIRED = 2;
export const ATTENDANCE_DEDUCTION_UNITS = { FREE: 0, QUARTER: 0.25, HALF: 0.5, FULL: 1 } as const;
export const ATTENDANCE_QUARTER_DAY_MAX_MINUTES = 60;
export const ATTENDANCE_HALF_DAY_MAX_MINUTES = 120;
```

`lib/constants/production.ts` exports only `PRODUCTION_BOARD_ID = 'bd_production'`. Deadline helpers reuse the existing centralized `CALENDAR_TIMEZONE = 'Asia/Dubai'` and `CALENDAR_TIMEZONE_OFFSET = '+04:00'` from `lib/constants/statuses.ts`; do not duplicate them.

- [ ] **Step 2: Write failing exact-deadline tests**

Cover: valid/invalid `date + time` conversion, Dubai round trip, legacy end-of-day conversion, equality on time, one millisecond late, `<24h` exclusion, exactly `24h` eligibility, precise overdue, and null deadline.

```ts
expect(dubaiDateTimeToIso('2026-07-21', '18:30')).toBe('2026-07-21T14:30:00.000Z');
expect(legacyDubaiDayEndToIso('2026-07-21')).toBe('2026-07-21T19:59:59.999Z');
expect(buildTaskJourney(task, atDeadlineEvents).on_time).toBe(true);
expect(buildTaskJourney(task, oneMillisecondLateEvents).on_time).toBe(false);
expect(buildTaskJourney(shortLeadTask, events).delivery_eligible).toBe(false);
```

- [ ] **Step 3: Run RED tests**

Run: `pnpm.cmd test -- __tests__/production-deadlines.test.ts __tests__/production-metrics.test.ts --run`

Expected: FAIL because the helpers and exact fields do not exist.

- [ ] **Step 4: Implement the minimum pure contract**

```ts
export interface StageEvent {
  task_id: string;
  from_column_id: string | null;
  to_column_id: string;
  created_at: string;
  due_at_snapshot?: string | null;
}

export interface QualityReviewDecisionEvent {
  task_id: string;
  created_at: string;
  action: 'approve' | 'reject';
  kind: 'revision' | 'outright' | null;
}

export interface ProductionTaskInput {
  id: string;
  title: string;
  assignee: string;
  due_date: string | null;
  due_at: string | null;
  created_at: string;
  review_column_id: string;
  done_column_id: string;
  is_archived?: boolean | null;
}
```

`buildTaskJourney()` uses the first review event's `due_at_snapshot`, otherwise the current task `due_at`, only when that instant is a verified exact deadline. An exemption flag or the migration-041 end-of-day sentinel makes `effective_due_at` null and records `unverified_legacy_deadline`; there is no scoring fallback. It exposes `effective_due_at`, `delivery_eligible`, `delivery_exclusion`, and review-entry timestamps. `summarizeEmployee()` uses native decisions whose decision timestamp falls inside the selected Dubai month: the denominator is unique tasks with an approve/reject decision, review rounds are all decisions in that cohort, and the numerator is unique tasks with an explicit outright rejection. Legacy activity rows never enter this cohort.

- [ ] **Step 5: Run GREEN tests and the full phase gate**

Run targeted tests, then `pnpm.cmd run check`, `pnpm.cmd test -- --run`, and `pnpm.cmd build`.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/plans/2026-07-21-employee-deductions.md lib/constants/deductions.ts lib/constants/production.ts lib/production/deadlines.ts lib/production/metrics.ts lib/production/report.ts __tests__/production-deadlines.test.ts __tests__/production-metrics.test.ts
git commit -m "feat: define exact production deadline metrics"
```

---

### Task 2: Migration 041, backfill, immutable approval storage, and schema documentation

**Files:**
- Modify: `docs/superpowers/plans/2026-07-21-employee-deductions.md`
- Create: `supabase/migrations/041_employee_deductions.sql`
- Modify: `DATABASE-SCHEMA.md`
- Modify: `types/database.ts`

**Interfaces:**
- Produces `pyra_tasks.due_at`, `pyra_task_stage_history.due_at_snapshot`, `pyra_employee_payments.effective_month`, `pyra_deduction_cases`, and service-role-only `pyra_approve_employee_deduction(...)`.

- [ ] **Step 1: Re-run schema preflight and attempt the recommended tier-1 backup**

Run from the primary repo root so `.env.local` is available:

```powershell
pnpm.cmd db:query .claude/worktrees/codex-employee-deductions/.superpowers/sdd/deductions-preflight.sql
pnpm.cmd db:backup pre-041
```

Live execution note (2026-07-21): the canonical command was attempted through both the package script and Git Bash. The exact backup script cannot run because `.env.local` has no `SUPABASE_DB_URL` (the already-known project backup gap). Migration 041 is adjudicated risk tier 1: it only creates new objects and populates newly-added nullable columns; no pre-existing column is overwritten or deleted. Per the locked migration policy, backup is recommended rather than mandatory for tier 1. The migration still runs transactionally and requires postflight verification before recording.

- [ ] **Step 2: Write the additive migration**

The migration must implement these exact shapes:

```sql
ALTER TABLE pyra_tasks ADD COLUMN IF NOT EXISTS due_at timestamptz;
ALTER TABLE pyra_task_stage_history ADD COLUMN IF NOT EXISTS due_at_snapshot timestamptz;
ALTER TABLE pyra_employee_payments ADD COLUMN IF NOT EXISTS effective_month date;

CREATE INDEX IF NOT EXISTS idx_tasks_due_at
  ON pyra_tasks(due_at) WHERE due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emp_payments_effective_month
  ON pyra_employee_payments(effective_month, currency, username)
  WHERE effective_month IS NOT NULL AND payroll_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_emp_payments_deduction_source
  ON pyra_employee_payments(source_type, source_id)
  WHERE source_type = 'deduction' AND source_id IS NOT NULL;

UPDATE pyra_tasks
SET due_at = ((due_date::timestamp + interval '1 day' - interval '1 millisecond') AT TIME ZONE 'Asia/Dubai')
WHERE board_id = 'bd_production' AND due_at IS NULL AND due_date IS NOT NULL;

UPDATE pyra_task_stage_history h
SET due_at_snapshot = t.due_at
FROM pyra_tasks t, pyra_board_columns c
WHERE h.task_id = t.id
  AND h.to_column_id = c.id
  AND c.column_type = 'review'
  AND h.due_at_snapshot IS NULL
  AND t.due_at IS NOT NULL;
```

Create `pyra_deduction_cases` with `varchar(20)` IDs and one unique `(employee_username, period_month)`. Its immutable snapshots are `salary_snapshot`, `salary_currency`, `attendance_units`, `attendance_amount`, `delivery_on_time_pct`, `delivery_band`, `delivery_amount`, `delivery_percentage`, `quality_avg_rounds`, `quality_outright_rejection_rate`, `quality_below_band`, `quality_consecutive_months`, `quality_eligible`, `quality_amount`, `monthly_cap_percentage`, `requested_amount`, `cap_amount`, `approved_amount`, `evidence`, `policy_snapshot`, admin note, the unique payment link, and approver/timestamps. Checks enforce a first-of-month period, three-character currency, non-negative money/attendance/quality counts, bounded percentages, component-total equality, the rounded snapshotted cap formula, `approved_amount = LEAST(requested_amount, cap_amount)`, and that non-zero quality money has an eligible below-band snapshot. Tunable policy values are passed from the centralized TypeScript constants and snapshotted; SQL does not hardcode the 25/3/7/12/2 policy values.

Create `pyra_approve_employee_deduction(...)` as a typed `SECURITY DEFINER SET search_path=''` function with every object schema-qualified, matching migration 038's locked hardening rule. Caller inputs contain component evidence and snapshotted policy percentages but not requested/cap/approved totals; the RPC rounds and computes those totals. It first returns an existing employee/month case, otherwise uses `INSERT ... ON CONFLICT ... DO NOTHING RETURNING` to elect one concurrent winner. Only the winner inserts one approved payment with `source_type='deduction'`, `source_id=case.id`, `effective_month=period_month`, `currency=salary_currency`, and the caller-provided localized `p_payment_description`; both rows use one database timestamp. The case-to-payment FK is unique and `DEFERRABLE INITIALLY DEFERRED`, so an error rolls back both writes. Enable RLS; revoke table/function access from `PUBLIC`, `anon`, and `authenticated`; grant `service_role` direct `SELECT` only on the case table and `EXECUTE` only on the RPC. There is no automatic invocation and no direct case-table write grant.

Do not add a production `due_at` CHECK yet: migration 041 is applied before the new API deploy, and such a check would break the currently deployed date-only writer. API enforcement lands in Task 3; a later forward migration may add the DB constraint after every legacy gap is resolved.

- [ ] **Step 3: Apply, verify, and record migration 041**

```powershell
pnpm.cmd db:query .claude/worktrees/codex-employee-deductions/supabase/migrations/041_employee_deductions.sql
pnpm.cmd db:query .claude/worktrees/codex-employee-deductions/.superpowers/sdd/deductions-postflight.sql
pnpm.cmd db:record 041_employee_deductions --by=codex --notes="Exact production deadlines and approved monthly deduction cases"
```

Fresh all-row live preflight on 2026-07-21 found 16 production tasks: 15 dated
(12 active and 3 archived), plus the single historical active task
`tk_IOhdJMui9uW0bblj` with no deadline. Postflight must assert: columns/types,
indexes, function execute ACL, every dated production task exactly backfilled to
Dubai end-of-day, that one identified historical task still null, every dated
review snapshot equal to its legacy task deadline, and no employee-payment row
created by migration. The assertions use relational invariants rather than a
brittle active-task count so an intervening archived task cannot be missed.

Drafting handoff note (2026-07-21): the Task 2 implementation worker stops
before this live step. Migration apply, postflight execution, `db:record`, the
full test/build phase gate, commit, and push remain controller-owned after live
review. The draft receives only local SQL contract inspection,
`git diff --check`, and `pnpm.cmd run check`.

- [ ] **Step 4: Update schema/type documentation and run the phase gate**

Run `pnpm.cmd run check`, `pnpm.cmd test -- --run`, and `pnpm.cmd build`.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-07-21-employee-deductions.md supabase/migrations/041_employee_deductions.sql DATABASE-SCHEMA.md types/database.ts
git commit -m "feat: add deduction approval storage"
```

---

### Task 3: Exact deadline API, atomic transitions, review evidence, board UI, and all deadline consumers

**Files:**
- Create: `supabase/migrations/042_atomic_task_transitions.sql`
- Create: `scripts/sql/verify-042-atomic-task-transitions.sql`
- Create: `supabase/migrations/044_harden_production_evidence.sql`
- Create: `scripts/sql/verify-044-production-evidence.sql`
- Modify: `DATABASE-SCHEMA.md`
- Modify: `types/database.ts`
- Create: `hooks/useBoardTasks.ts`
- Create: `hooks/useBoardTaskMutations.ts`
- Modify: `app/api/boards/[id]/tasks/route.ts`
- Modify: `app/api/tasks/[id]/route.ts`
- Modify: `app/api/tasks/[id]/duplicate/route.ts`
- Modify: `app/api/tasks/[id]/move/route.ts`
- Modify: `app/api/tasks/[id]/assignees/route.ts`
- Modify: `app/api/boards/[id]/tasks/[taskId]/advance/route.ts`
- Create: `lib/constants/task-transitions.ts`
- Create: `__tests__/atomic-task-transition-migration.test.ts`
- Create: `__tests__/atomic-task-transition-routes.test.ts`
- Create: `__tests__/task-assignee-writer-security.test.ts`
- Modify: `app/dashboard/boards/[id]/board-view-client.tsx`
- Modify: `components/boards/task-sheet.tsx`
- Modify: `components/boards/board-calendar-view.tsx`
- Modify: `components/boards/board-list-view.tsx`
- Modify: `components/boards/board-toolbar.tsx`
- Modify: `app/dashboard/projects/[id]/project-board-embed.tsx`
- Modify: `app/api/my-work/route.ts`
- Modify: `hooks/useMyWork.ts`
- Modify: `components/dashboard/MyWorkInbox.tsx`
- Modify: `app/api/my-tasks/route.ts`
- Modify: `app/dashboard/my-tasks/my-tasks-client.tsx`
- Modify: `app/api/dashboard/route.ts`
- Modify: `app/api/cron/task-deadline-reminders/route.ts`
- Modify: `lib/production/report.ts`
- Modify: `lib/production/metrics.ts`
- Modify: `app/dashboard/hr/productivity/productivity-client.tsx`
- Modify: `app/api/hr/productivity/export/route.ts`
- Modify: `messages/ar/boards.json`
- Modify: `messages/en/boards.json`
- Modify: `messages/ar/api.json`
- Modify: `messages/en/api.json`
- Modify: `messages/ar/mywork.json`
- Modify: `messages/en/mywork.json`

**Interfaces:**
- Production create requires `{due_date: 'YYYY-MM-DD', due_time: 'HH:mm'}` and the server derives trusted `due_at` in Dubai time. The API never trusts a browser timezone conversion.
- Generic board create keeps optional `due_date`; `due_time` is ignored unless both values are valid.
- Duplicate or cross-board move into `bd_production` requires a valid server-derived date/time pair when the source task has no exact `due_at`; the route must reject rather than invent a time.
- Migration 042 is additive and is applied before the transition-route deploy. It adds the persistent deadline lock, explicit deadline-exemption flag, immutable review-attribution snapshots, service-role-only atomic advance/move RPCs, and a non-rejecting assignee advisory-lock trigger that serializes old and new writers immediately; it adds no CHECK or table-DML revoke.
- Migration 043 is reserved for the structured review/rejection RPC in Task 4.
- Migration 044 is the mandatory post-deploy reconciliation/guard. It is committed with Task 3 but remains unapplied until every writer for tasks, stage history, board columns, and task assignees has moved behind permission gates and service role.

- [ ] **Step 1: Write failing API-policy/helper tests**

Extract pure request mapping to `lib/production/deadlines.ts` and test: production missing date/time rejected, invalid calendar time rejected, valid Dubai pair produces exact UTC, generic date-only accepted, reviewed production deadline edit rejected, and duplicate/move into production cannot create an exact-deadline gap.

- [ ] **Step 2: Run RED tests**

Run: `pnpm.cmd test -- __tests__/production-deadlines.test.ts __tests__/production-metrics.test.ts --run`

- [ ] **Step 3: Implement server writes and snapshot**

POST dual-writes `due_date` and `due_at` for `bd_production`. PATCH reads `production_deadline_locked_at` before changing either deadline field and rechecks it after an optimistic-concurrency loss. Every production duplicate requires and server-derives a fresh date/time pair; moving an existing task into production may preserve a verified exact deadline, otherwise it also requires the pair. Service-role-only atomic transition RPCs own task movement, position changes, attachment/history writes, label cleanup, and default-assignee insertion in one transaction. Both RPCs acquire the same deterministic per-task advisory lock. Financial/productivity evidence timestamps come from the database `clock_timestamp()` only; a separate monotonic timestamp is used for CAS/version fields so an application-server clock cannot move first-submission evidence. Advance also compares the caller-observed next-column id with the target re-derived under the database column lock, returning a conflict if column order changed.

Entering a `bd_production` review sets the persistent lock once and snapshots `due_at`, task `created_at`, and the sorted/deduplicated current assignee usernames before any review-stage default assignee is added. Legacy assignee attribution is never reconstructed or backfilled.

Apply additive migration 042 before deployment and run its read-only verifier, including the assignee advisory-lock trigger. Prepare forward-only migration 044 but do not apply it while any protected-table writer still uses authenticated DML. In one post-deploy transaction, 044 must: discard every pre-hardening exemption flag; mark only exact migration-041 sentinels across all boards plus the independently verified live null task when it still matches; reject any other null production deadline; reconstruct persistent lock timestamps only from existing first-review history; never backfill or infer a missing deadline snapshot; abort on every unexplained gap; install a CHECK over the stored verified legacy markers; freeze the deadline, lock, exemption marker, and production-review evidence; recreate/verify the existing assignee advisory-lock trigger; and coherently revoke authenticated DML from tasks, stage history, board columns, and assignees. Clean rebuilds must not require the historical row. Add separate read-only verifiers for 042 and 044. Never backfill legacy assignee snapshots and never fabricate a missing deadline or time.

- [ ] **Step 4: Implement React Query mutations and production form behavior**

`hooks/useBoardTasks.ts` owns board-task queries through `fetchAPI`/React Query. `hooks/useBoardTaskMutations.ts` exposes create, update, move, duplicate, advance, and review mutations through `mutateAPI`, invalidating board/task queries. Replace the touched raw `fetch()` paths in `BoardViewClient` and `TaskSheet`. The full-create dialog has separate date and time inputs; calendar-originated create pre-fills only the date and never guesses a time. Production quick-add opens the full dialog with the typed title instead of POSTing an incomplete task.

Task-sheet deadline edit shows Dubai date/time, uses the mutation hook, and becomes read-only after first submission. The employee-facing label explicitly says UAE time. Keep existing date-only controls on non-production boards.

- [ ] **Step 5: Convert all consumers without changing unrelated CRM date-only tasks**

Board card/list/calendar/filter, My Work API/hook/`MyWorkInbox`, board portion of My Tasks, dashboard overdue, project-board embed, production report/export, `open_overdue`, and the daily reminder use `due_at` when present and fall back to `due_date`. Global CRM calendar and `pyra_lead_tasks.due_date` stay date-only. Daily reminder cadence remains unchanged; messages now contain the exact Dubai time and overdue classification compares instants.

- [ ] **Step 6: Run GREEN tests and the full phase gate**

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/042_atomic_task_transitions.sql supabase/migrations/044_harden_production_evidence.sql scripts/sql/verify-042-atomic-task-transitions.sql scripts/sql/verify-044-production-evidence.sql DATABASE-SCHEMA.md types/database.ts app/api app/dashboard components/boards components/dashboard/MyWorkInbox.tsx hooks/useBoardTasks.ts hooks/useBoardTaskMutations.ts hooks/useMyWork.ts lib/constants/task-transitions.ts lib/production messages/ar/boards.json messages/en/boards.json messages/ar/api.json messages/en/api.json messages/ar/mywork.json messages/en/mywork.json __tests__
git commit -m "feat: enforce exact production task deadlines"
```

---

### Task 4: Structured outright rejection and quality aggregation

**Files:**
- Modify: `lib/constants/statuses.ts`
- Modify: `lib/production/metrics.ts`
- Modify: `lib/production/report.ts`
- Modify: `app/api/boards/[id]/tasks/[taskId]/approve/route.ts`
- Modify: `hooks/useBoardTaskMutations.ts`
- Modify: `components/boards/task-sheet.tsx`
- Modify: `messages/ar/boards.json`
- Modify: `messages/en/boards.json`
- Modify: `messages/ar/statuses.json`
- Modify: `messages/en/statuses.json`
- Modify: `lib/i18n/status-labels.ts`
- Test: `__tests__/production-metrics.test.ts`

**Interfaces:**
- Adds `TASK_REJECTION_KIND = { REVISION: 'revision', OUTRIGHT: 'outright' }`.
- Reject API body is `{action:'reject', note:string, rejection_kind:'revision'|'outright'}`.

- [ ] **Step 1: Write failing quality tests**

Test JSON object and legacy JSON-string normalization, unique-task numerator, unique reviewed-task denominator, 20% equality below-band behavior, and legacy unmarked rejections not counted as outright.

- [ ] **Step 2: Run RED tests**

- [ ] **Step 3: Implement structured write/read path**

The reject dialog forces an explicit choice between ordinary revision and outright rejection. The route validates the constant and writes `details` as a JSON object containing `rejection_kind`, never `JSON.stringify(...)`. Existing 15 string-shaped rows are parsed safely but remain `revision` because they lack the structured marker.

For each month, denominator = unique tasks with a review-entry stage event in that Dubai month; numerator = unique denominator tasks with a structured outright-rejection event in that month.

- [ ] **Step 4: Run GREEN tests and the full phase gate**

- [ ] **Step 5: Commit**

```bash
git add lib/constants/statuses.ts lib/production app/api/boards components/boards/task-sheet.tsx hooks/useBoardTaskMutations.ts messages lib/i18n/status-labels.ts __tests__/production-metrics.test.ts
git commit -m "feat: track outright production rejections"
```

---

### Task 5: Pure deductions engine and derived monthly report

**Files:**
- Create: `lib/hr/deductions.ts`
- Create: `lib/hr/deductions-report.ts`
- Test: `__tests__/deductions.test.ts`
- Modify: `lib/hr/attendance-policy.ts`
- Modify: `__tests__/attendance-policy.test.ts`
- Modify: `app/api/hr/overview/route.ts`
- Modify: `hooks/useHROverview.ts`
- Modify: `components/hr/overview/DailyAttendanceRoster.tsx`

**Interfaces:**
- Produces `computeAttendanceDeduction`, `computeDeliveryDeduction`, `computeQualityEligibility`, `applyMonthlyDeductionCap`, and `computeMonthlyDeductionCandidate`.
- `lib/hr/deductions-report.ts` is DB-aware orchestration only; it maps DB rows into pure inputs and never contains money policy branches.

- [ ] **Step 1: Write failing deduction tests**

Cover every attendance boundary (`15`, `16`, `60`, `61`, `120`, `121`, no-show, excused), salary/30, all delivery boundaries (`90`, `89.99`, `75`, `74.99`, `50`, `49.99`, null), exact percentages, two consecutive quality months, manual quality amount rejection when ineligible, cap truncation, rounding, zero salary, and currency preservation.

```ts
expect(attendanceUnitsForLateMinutes(15)).toBe(0);
expect(attendanceUnitsForLateMinutes(16)).toBe(0.25);
expect(attendanceUnitsForLateMinutes(61)).toBe(0.5);
expect(attendanceUnitsForLateMinutes(121)).toBe(1);
expect(deliveryBandForOnTimePct(90)).toBe('none');
expect(deliveryBandForOnTimePct(75)).toBe('minor');
expect(applyMonthlyDeductionCap(3000, 1000)).toEqual({ cap_amount: 750, approved_amount: 750, capped: true });
```

- [ ] **Step 2: Run RED tests**

- [ ] **Step 3: Refactor absence-date enumeration, then implement the pure engine**

Add `listDeductibleAbsenceDates(...)` to attendance policy and implement `countDeductibleAbsences(...)` as `.length`, preserving all existing semantics including work schedule, leave, excused days, hire date, first tracking date, today grace, and Sunday weekend behavior.

Attendance report combines no-show dates with actual clock-in delay via existing `lateMinutesOf()`. Delivery consumes the extended `EmployeeProductivity.on_time_pct`; it never recomputes task lateness. Quality consumes `avg_rounds` and `outright_rejection_rate` for the selected and previous month.

- [ ] **Step 4: Update HR overview's estimate to tiered units**

Replace the binary whole-day estimate with the same pure attendance output and expose incident/unit detail. This remains display-only and performs no payment write.

- [ ] **Step 5: Run GREEN tests and the full phase gate**

- [ ] **Step 6: Commit**

```bash
git add lib/hr __tests__/deductions.test.ts __tests__/attendance-policy.test.ts app/api/hr/overview/route.ts hooks/useHROverview.ts components/hr/overview/DailyAttendanceRoster.tsx
git commit -m "feat: calculate monthly deduction risk"
```

---

### Task 6: Admin/self APIs, atomic approval, and correct payroll-month attribution

**Files:**
- Create: `app/api/hr/deductions/route.ts`
- Create: `app/api/hr/deductions/me/route.ts`
- Create: `app/api/hr/deductions/[username]/approve/route.ts`
- Create: `lib/payroll/payment-period.ts`
- Test: `__tests__/payment-period.test.ts`
- Modify: `app/api/dashboard/payroll/[id]/calculate/route.ts`
- Modify: `lib/api/activity.ts`
- Modify: `messages/ar/api.json`
- Modify: `messages/en/api.json`

**Interfaces:**
- Admin GET returns per-employee candidates for `month=YYYY-MM` and existing approval snapshot.
- Self GET always derives the authenticated employee's current Dubai month and returns no other employee data.
- Approval POST accepts only `{month, quality_amount?, admin_note?}`; username and all computed money/evidence come from server-side DB reads.

- [ ] **Step 1: Write failing period-selection tests**

Test that every deduction requires `effective_month`; only non-deduction rows may
fall back to `created_at`. A June case approved in July belongs to June, an
unrelated July bonus remains July, and final settlement remains excluded.

- [ ] **Step 2: Run RED tests**

- [ ] **Step 3: Implement read routes with gate-then-service-role order**

Admin routes call `requireApiPermission('hr.manage')` before `createServiceRoleClient()`. Self route calls `requireApiPermission('payroll.view')`, rejects non-`employee` roles, and passes only `auth.pyraUser.username` to the report loader. Errors use `apiSuccess`/`apiError`; caught exceptions call `logError`.

- [ ] **Step 4: Implement approval**

Reject current/future month, zero totals, invalid/negative quality amount, and quality money when not eligible. Recompute all evidence from DB inside the request, apply cap, generate `dc_*` and `ep_*` IDs, call `pyra_approve_employee_deduction`, and activity-log `${ENTITY_TYPES.DEDUCTION}_${ACTIVITY_ACTIONS.APPROVE}` with `details.source='employee_deduction_approval'`. A retry returns the existing case/payment and does not duplicate money.

- [ ] **Step 5: Implement effective-month payroll selection**

Fetch approved/unlinked non-deduction rows with `effective_month IS NULL` under
the created-at window plus deductions with `effective_month = run month`;
combine and deduplicate IDs. A deduction with a null month is a classification
error and never uses `created_at`. Preserve run-currency filtering and the locked
`calculatePayrollItem()` behavior.

- [ ] **Step 6: Run GREEN tests and the full phase gate**

- [ ] **Step 7: Commit**

```bash
git add app/api/hr/deductions app/api/dashboard/payroll lib/payroll/payment-period.ts lib/api/activity.ts messages/ar/api.json messages/en/api.json __tests__/payment-period.test.ts
git commit -m "feat: approve deductions into payroll safely"
```

---

### Task 7: Admin review page, React Query hooks, navigation, guide, and i18n

**Files:**
- Create: `hooks/useDeductions.ts`
- Create: `app/dashboard/hr/deductions/page.tsx`
- Create: `app/dashboard/hr/deductions/deductions-client.tsx`
- Create: `components/hr/deductions/DeductionSummaryCards.tsx`
- Create: `components/hr/deductions/DeductionEmployeeCard.tsx`
- Create: `components/hr/deductions/DeductionEvidenceDialog.tsx`
- Create: `components/hr/deductions/DeductionApprovalDialog.tsx`
- Create: `components/hr/overview/DeductionsReviewCard.tsx`
- Modify: `app/dashboard/hr/hr-overview-client.tsx`
- Modify: `components/layout/nav-config.ts`
- Modify: `lib/config/module-guide.ts`
- Modify: `app/dashboard/guide/page.tsx`
- Modify: `messages/ar/hr.json`
- Modify: `messages/en/hr.json`
- Modify: `messages/ar/nav.json`
- Modify: `messages/en/nav.json`
- Modify: `messages/ar/guide.json`
- Modify: `messages/en/guide.json`

**Interfaces:**
- `useAdminDeductions(month)` query key is `['deductions','admin',month]`.
- `useApproveDeduction()` invalidates admin deductions, HR overview, employee payments, and my-payslips.

- [ ] **Step 1: Implement typed React Query hooks**

Use only `fetchAPI`/`mutateAPI`. Return typed monetary fields with their currency; no cross-currency numeric total is exposed.

- [ ] **Step 2: Implement the admin page**

Server page requires `hr.manage`. Client provides a month picker, Skeleton loading, full-page EmptyState, per-currency summary via `formatCurrencyMap`, employee evidence drill-down, cap requested-vs-approved display, and explicit approval dialog. Quality amount input appears only when eligible and has no automatic default.

- [ ] **Step 3: Wire HR overview, sidebar, and guide**

Add `/dashboard/hr/deductions` to the HR group with `hr.manage`, to `MODULE_GUIDES`, and to guide sections. HR overview card links to the review page and displays per-currency at-risk totals only.

- [ ] **Step 4: Add complete AR/EN catalogs**

All added keys must have parity. Use `useTranslations('hr.deductions')`; no hardcoded Arabic in migrated UI/API paths.

- [ ] **Step 5: Run the full phase gate**

- [ ] **Step 6: Commit**

```bash
git add hooks/useDeductions.ts app/dashboard/hr components/hr components/layout/nav-config.ts lib/config/module-guide.ts app/dashboard/guide/page.tsx messages
git commit -m "feat: add deductions review workspace"
```

---

### Task 8: Employee at-risk panel, audience enforcement, documentation, and adversarial verification

**Files:**
- Create: `components/hr/deductions/MyDeductionRiskPanel.tsx`
- Modify: `app/dashboard/my-payslips/my-payslips-client.tsx`
- Modify: `hooks/useDeductions.ts`
- Modify: `messages/ar/hr.json`
- Modify: `messages/en/hr.json`
- Modify: `docs/FEATURE-IMPACT-MAP.md`
- Modify: `docs/SYSTEM-STRUCTURE.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- `useMyDeductionRisk({enabled})` uses query key `['deductions','me']` and calls `/api/hr/deductions/me` only for legacy role `employee`.

- [ ] **Step 1: Implement employee panel**

Use `useCurrentUser()` to enable the panel only for `role === 'employee'`. Show an amber current-month at-risk total, separate attendance and projected delivery amounts, exact late incidents, late/on-time/excluded task evidence, the 24-hour exclusion reason, and quality warning/eligibility. Quality contributes zero money until admin entry. Finalized deductions continue to appear through existing payslip payment rows.

- [ ] **Step 2: Verify the four audiences**

Admin: review/approve all via `hr.manage`. Employee: own panel only. Sales agent: no admin nav, panel query disabled, self endpoint forbidden. Client: no dashboard route/portal surface. Add API-focused tests for the pure audience predicate if extracted.

- [ ] **Step 3: Update system documentation**

Document exact deadlines, migration 041 columns/table/function, derived-vs-persisted boundary, audience matrix, payroll effective month, cap, excuse behavior, and no automatic attendance/payroll wiring.

- [ ] **Step 4: Run targeted browser QA locally**

Verify: production create cannot submit without date+time; exact time renders in cards/sheet/calendar; calendar pre-fills date only; quick-add opens full form; employee sees only own evidence; sales sees no panel; admin approval creates one row on retry; AR/EN and RTL/dark render correctly.

- [ ] **Step 5: Run final verification**

```powershell
pnpm.cmd run check
pnpm.cmd test -- --run
pnpm.cmd build
git status --short
git diff --check origin/main...HEAD
```

- [ ] **Step 6: Request whole-branch adversarial review and fix every Critical/Important finding**

Review lenses: exact-time boundaries, Dubai conversions, history immutability, 24-hour exclusion, quality denominator, cap/rounding, multi-currency, idempotency/concurrency, payroll month, RBAC/self scope, i18n/RTL/dark, and legacy compatibility.

- [ ] **Step 7: Commit final integration/docs**

```bash
git add components/hr/deductions/MyDeductionRiskPanel.tsx app/dashboard/my-payslips hooks/useDeductions.ts messages docs CLAUDE.md
git commit -m "feat: show employees deduction risk transparently"
```

- [ ] **Step 8: Stop before deployment**

Fetch `origin/main`, report the complete commit payload and verification evidence, and ask the owner for explicit push/deploy approval. Do not push in this task.

- [ ] **Step 9: Mandatory post-approval deployment reconciliation**

Only after the owner approves the push: fetch again, push the reviewed commits to
`origin/main`, and verify the exact production writer is live. Then re-read every
production deadline. If a new no-date task exists beyond the one verified
historical exception, stop and ask the owner for its real date/time; never
fabricate it. Otherwise, only after every protected writer is verified on the
service-role path, apply migration 044, run its postflight to prove zero dated
gaps, persistent review locks, assignee serialization, and the coherent DML
revokes; record its checksum, and re-run a live read plus a
transactionally rolled-back invalid-insert test. Deployment is not complete
until this reconciliation passes.

```powershell
pnpm.cmd db:query supabase/migrations/044_harden_production_evidence.sql
pnpm.cmd db:query scripts/sql/verify-044-production-evidence.sql
pnpm.cmd db:record 044_harden_production_evidence --by=codex --notes="Post-deploy production evidence and writer hardening"
```

---

## Self-Review Result

- Spec coverage: all locked attendance, delivery, quality, cap, approval, employee transparency, excuse, currency, idempotency, deadline, RBAC, i18n, navigation, guide, migration, verification, and deployment constraints map to a task.
- No placeholder implementation steps remain; quality's denominator is explicitly defined and legacy rejections are explicitly excluded.
- Type consistency: `due_at`, `due_at_snapshot`, `effective_month`, `QualityReviewDecisionEvent.action/kind`, and deduction candidate/case fields have one spelling across tasks.
- Deployment sequencing: migration 041 supplies the exact deadline and deduction storage; additive migration 042 supplies atomic transitions and persistent evidence columns before the route deploy; migration 043 is reserved for structured review/rejection; mandatory post-deploy migration 044 reconciles intervening rows and installs the evidence guards plus coherent protected-table DML revokes only after every writer is converted.
