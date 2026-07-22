# Productivity Visibility and Deduction Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Wael's truthful month-to-date productivity report for both Admin and employee views, then let HR explicitly apply and cancel deductions before payroll is approved or paid.

**Architecture:** Keep `pyra_task_stage_history` as the evidence source and add a narrow legacy fallback from the immutable first-review actor when current assignment corroborates that actor. Reuse one report DTO for Admin and employee task drill-downs. Keep every money write behind an `hr.manage` API and guarded atomic PostgreSQL RPC; cancellation is audited and invalidates draft/calculated payroll rather than editing a stale payslip.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase/PostgreSQL, React Query, next-intl, Tailwind/shadcn, Vitest.

## Global Constraints

- Exact deadline means the supplied UAE date and time; delivery at or before it is on time.
- A task with less than 24 hours lead time is visible but excluded from delivery-band scoring.
- Attendance deductions are outside the 25% cap; delivery, quality, and other disciplinary deductions are inside it.
- Quality remains warning-first and needs two consecutive below-band months before money can be approved.
- No automatic payroll write. Admin approval is the only path to `source_type='deduction'`.
- Admin uses `hr.manage`; employee data is server-enforced own-scope; Sales gets only inherited own-scope; Client gets nothing.
- Components use React Query hooks with `fetchAPI`/`mutateAPI`, never raw `fetch()`.
- Arabic and English keys remain in parity; RTL uses logical properties and light colors have dark variants.
- Every implementation commit runs `pnpm run check`, `pnpm test -- --run`, and `pnpm build` before commit.
- Do not push to `origin/main` until Muhammad explicitly approves deployment.

---

### Task 1: Preserve the owner-directed exact deadline correction

**Files:**
- Create: `supabase/migrations/049_correct_wael_task_deadlines.sql`
- Create: `__tests__/wael-task-deadline-correction-migration.test.ts`
- Modify: `docs/superpowers/specs/2026-07-22-productivity-deduction-control-hotfix-design.md`

**Interfaces:**
- Produces: exact `due_at` values `2026-07-20T18:00:00+04:00` and `2026-07-21T18:00:00+04:00`, `production_deadline_exempt=false`, two `deadline_corrected` activity rows, and migration record `049_correct_wael_task_deadlines`.

- [ ] **Step 1: Write the migration contract test**

```ts
it('targets only the two owner-confirmed Wael tasks and restores the guard', () => {
  expect(sql).toContain("task.id IN ('tk_nRfrQhPIyrEPFeZo', 'tk_WT5YlHFDv7Y_Svs5')");
  expect(sql).toContain("timestamptz '2026-07-20 18:00:00+04'");
  expect(sql).toContain("timestamptz '2026-07-21 18:00:00+04'");
  expect(sql).toContain('DISABLE TRIGGER trg_tasks_production_deadline_immutable');
  expect(sql).toContain('ENABLE TRIGGER trg_tasks_production_deadline_immutable');
  expect(sql).toContain("'deadline_corrected'");
});
```

- [ ] **Step 2: Run the focused test**

Run: `pnpm test -- --run __tests__/wael-task-deadline-correction-migration.test.ts`  
Expected: PASS against the already-applied migration.

- [ ] **Step 3: Re-read production postconditions**

Run: `pnpm db:query .superpowers/sdd/wael-deadline-injection-postflight.sql`  
Expected: two rows at `18:00:00` Dubai, both non-exempt, both activity rows present, `deadline_guard_enabled=true`.

- [ ] **Step 4: Run all gates and commit**

```bash
pnpm run check
pnpm test -- --run
pnpm build
git add supabase/migrations/049_correct_wael_task_deadlines.sql __tests__/wael-task-deadline-correction-migration.test.ts docs/superpowers/specs/2026-07-22-productivity-deduction-control-hotfix-design.md
git commit -m "fix: restore exact deadlines for Wael tasks"
```

### Task 2: Restore legacy productivity attribution without inventing deadlines

**Files:**
- Modify: `lib/constants/production.ts`
- Modify: `lib/production/attribution.ts`
- Modify: `lib/production/metrics.ts`
- Modify: `lib/production/report.ts`
- Modify: `__tests__/production-attribution.test.ts`
- Modify: `__tests__/production-report-pagination.test.ts`
- Modify: `__tests__/deductions-report.test.ts`

**Interfaces:**
- Consumes: `StageEvent.moved_by?: string`, current task assignees, current task `created_at`.
- Produces: `PRODUCTION_ATTRIBUTION_STATUS.LEGACY_ACTOR_VERIFIED = 'legacy_actor_verified'` and a metrics-eligible journey attributed only to the corroborated first-review actor.

- [ ] **Step 1: Add failing pure attribution tests**

```ts
expect(resolveProductionAttribution({
  currentAssignees: ['wael.hany'],
  currentTaskCreatedAt: '2026-07-11T13:25:36.264269Z',
  firstReviewEvent: { moved_by: 'wael.hany', assignees_snapshot: null, task_created_at_snapshot: null },
})).toEqual({
  status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_ACTOR_VERIFIED,
  assignees: ['wael.hany'],
  visibilityAssignees: ['wael.hany'],
  taskCreatedAt: '2026-07-11T13:25:36.264269Z',
  metricsEligible: true,
});
```

Also assert fallback rejection when `moved_by` is missing, is not a current assignee, or task `created_at` is invalid.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `pnpm test -- --run __tests__/production-attribution.test.ts __tests__/production-report-pagination.test.ts`  
Expected: FAIL because `LEGACY_ACTOR_VERIFIED` and `moved_by` are not wired.

- [ ] **Step 3: Implement the minimal pure fallback**

```ts
const actor = typeof input.firstReviewEvent.moved_by === 'string'
  ? input.firstReviewEvent.moved_by.trim()
  : '';
if (actor && currentAssignees.includes(actor) && isValidIsoInstant(input.currentTaskCreatedAt)) {
  return {
    status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_ACTOR_VERIFIED,
    assignees: [actor],
    visibilityAssignees: [actor],
    taskCreatedAt: input.currentTaskCreatedAt,
    metricsEligible: true,
  };
}
```

Keep `LEGACY_UNVERIFIED` excluded; `legacy_actor_verified` flows through normal metrics. A sentinel/exempt deadline remains `unverified_legacy_deadline` and therefore never enters `on_time_pct`.

- [ ] **Step 4: Wire the report query**

Add `moved_by` to the stage-history select and `StageEvent`, pass the first-review event unchanged into `resolveProductionAttribution`, and update report tests so legacy actor work appears under the employee in Admin and own-scope results but not in `unattributed_tasks`.

- [ ] **Step 5: Run focused tests and all gates**

Run: `pnpm test -- --run __tests__/production-attribution.test.ts __tests__/production-report-pagination.test.ts __tests__/deductions-report.test.ts`  
Expected: PASS, followed by all three global gates.

- [ ] **Step 6: Commit**

```bash
git add lib/constants/production.ts lib/production/attribution.ts lib/production/metrics.ts lib/production/report.ts __tests__/production-attribution.test.ts __tests__/production-report-pagination.test.ts __tests__/deductions-report.test.ts
git commit -m "fix: restore verified legacy productivity attribution"
```

### Task 3: Show the employee's full current-month productivity evidence

**Files:**
- Modify: `components/dashboard/MyProductivityCard.tsx`
- Modify: `hooks/useProductivity.ts`
- Modify: `messages/ar/mywork.json`
- Modify: `messages/en/mywork.json`
- Create: `__tests__/my-productivity-card.test.tsx`

**Interfaces:**
- Consumes: the existing own-scoped `ProductivityReport` from `/api/my-productivity`.
- Produces: an expandable task table with deadline, first submission, on-time/exclusion state, rounds, and final delivery; no new permission or endpoint.

- [ ] **Step 1: Add a failing employee parity test**

Render `MyProductivityCard` with one exact late task and one legacy deadline task. Assert the five headline values, open `Tasks & numbers (2)`, then assert both titles, Dubai deadline time, `Late on the same day`, and `Excluded · unverified legacy deadline`.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm test -- --run __tests__/my-productivity-card.test.tsx`  
Expected: FAIL because the employee card has no drill-down.

- [ ] **Step 3: Implement the drill-down**

Add a `ChevronDown` disclosure and the same task interpretation used by the Admin report. Keep the employee API own-scoped and display only `data.employees[0].tasks`. Use `isoToDubaiDateTime`, logical `text-start`, amber/dark excluded badges, and a red/dark late badge.

- [ ] **Step 4: Add matching AR/EN copy and run parity**

Add keys under `mywork.tasks.productivity.details`, including table headers and exclusion labels. Run `pnpm run check`; expected `i18n:check ✓ clean`.

- [ ] **Step 5: Run focused tests, all gates, and commit**

```bash
pnpm test -- --run __tests__/my-productivity-card.test.tsx __tests__/productivity-error-states.test.tsx
pnpm run check
pnpm test -- --run
pnpm build
git add components/dashboard/MyProductivityCard.tsx hooks/useProductivity.ts messages/ar/mywork.json messages/en/mywork.json __tests__/my-productivity-card.test.tsx
git commit -m "feat: show employee productivity task evidence"
```

### Task 4: Wire explicit computed deduction approval

**Files:**
- Create: `app/api/hr/deductions/approve/route.ts`
- Modify: `hooks/useDeductions.ts`
- Modify: `components/hr/deductions/AdminDeductionEmployeeCard.tsx`
- Modify: `app/dashboard/hr/deductions/deductions-client.tsx`
- Modify: `messages/ar/hr.json`
- Modify: `messages/en/hr.json`
- Modify: `messages/ar/api.json`
- Modify: `messages/en/api.json`
- Create: `__tests__/deduction-approval-route.test.ts`
- Modify: `__tests__/admin-deduction-employee-card.test.tsx`
- Modify: `__tests__/use-deductions.test.tsx`

**Interfaces:**
- Produces: `useApproveComputedDeduction()` posting `{ username, period_month, admin_note }` to `/api/hr/deductions/approve`.
- Calls: existing `pyra_approve_employee_deduction(...)` RPC with server-derived report snapshots and stable case/payment ids.

- [ ] **Step 1: Add failing route, hook, and UI tests**

Assert `hr.manage` runs before `createServiceRoleClient`, client evidence is rejected, the current-month employee snapshot is server-loaded, RPC status conflicts return 409, and success logs `${ENTITY_TYPES.DEDUCTION}_${ACTIVITY_ACTIONS.APPROVE}` with `details.source='computed_employee_deduction_approved'`.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm test -- --run __tests__/deduction-approval-route.test.ts __tests__/admin-deduction-employee-card.test.tsx __tests__/use-deductions.test.tsx`.

- [ ] **Step 3: Implement the route and hook**

Derive the month and employee from `loadMonthlyDeductionsReport`; pass salary currency, attendance amount, delivery band amount, cap ledger, policy snapshot, and evidence to the existing atomic RPC. Invalidate deductions, overview, payments, payroll, payslips, and `my-productivity` after success.

- [ ] **Step 4: Add the one-click Admin control**

Show `Apply calculated deduction` only for the current month when the candidate amount is positive and no valid existing case owns the cause. Keep `Document manual deduction` as a separate action. Confirmation shows amount, currency, attendance cap-exempt amount, disciplinary capped amount, and mandatory note.

- [ ] **Step 5: Run all gates and commit**

Commit message: `feat: wire computed deduction approval`.

### Task 5: Add audited pre-payroll deduction cancellation

**Files:**
- Create: `supabase/migrations/050_cancel_employee_deductions.sql`
- Create: `.superpowers/sdd/deduction-cancellation-schema-preflight.sql`
- Create: `.superpowers/sdd/deduction-cancellation-postflight.sql`
- Modify: `lib/constants/statuses.ts`
- Modify: `lib/constants/payroll.ts`
- Modify: `types/database.ts`
- Create: `app/api/hr/deductions/[paymentId]/cancel/route.ts`
- Modify: `hooks/useDeductions.ts`
- Create: `components/hr/deductions/CancelDeductionDialog.tsx`
- Modify: `components/hr/deductions/AdminDeductionEmployeeCard.tsx`
- Modify: `components/hr/deductions/MyDeductionRiskPanel.tsx`
- Modify: `messages/ar/hr.json`
- Modify: `messages/en/hr.json`
- Modify: `messages/ar/api.json`
- Modify: `messages/en/api.json`
- Create: `__tests__/deduction-cancellation-migration.test.ts`
- Create: `__tests__/deduction-cancellation-route.test.ts`
- Modify: `__tests__/admin-deduction-employee-card.test.tsx`
- Modify: `__tests__/my-deduction-risk-panel.test.tsx`

**Interfaces:**
- Produces: payment state `cancelled`; fields `cancelled_at timestamptz`, `cancelled_by varchar`, `cancellation_reason text`; RPC `pyra_cancel_employee_deduction(p_payment_id varchar, p_cancelled_by varchar, p_reason text)` returning `status`, `changed`, `payment_data`, `invalidated_payroll_id`.

- [ ] **Step 1: Query the live schema before SQL authoring**

Use `information_schema.columns`, `pg_constraint`, `pg_get_constraintdef`, `pg_proc`, and `pg_trigger` for payments, payroll runs/items, manual cases, and deduction guards. Do not assume the live status constraint name.

- [ ] **Step 2: Write failing migration and route tests**

Assert the RPC locks payment/run in stable order, accepts deductions only, blocks approved/paid runs, marks unlinked deductions cancelled, clears a draft/calculated run's items and payment links, resets the run to draft, and issues the private deduction-write capability before the guarded update.

- [ ] **Step 3: Implement migration 050**

Alter the live status check idempotently to include `cancelled`; add the three audit fields with consistency checks; create the service-role-only atomic RPC; retain the migration 047 write guard; add double-commented DOWN notes.

- [ ] **Step 4: Implement API, hook, and UI**

The route gates `hr.manage`, validates a non-empty reason up to 2000 characters, calls the RPC, maps known statuses, logs `${ENTITY_TYPES.DEDUCTION}_${ACTIVITY_ACTIONS.UPDATE}` with `details.source='employee_deduction_cancelled'`, and never directly updates a payment. The dialog requires confirmation and shows when payroll recalculation will be required. Employee transparency shows cancelled rows as cancelled and excludes them from at-risk/applied totals.

- [ ] **Step 5: Run focused tests and all gates**

Run cancellation tests first, then the full global gates.

- [ ] **Step 6: Apply, verify, and record migration 050**

```bash
pnpm db:query .superpowers/sdd/deduction-cancellation-schema-preflight.sql
pnpm db:query supabase/migrations/050_cancel_employee_deductions.sql
pnpm db:query .superpowers/sdd/deduction-cancellation-postflight.sql
pnpm db:record 050_cancel_employee_deductions --by=codex --notes="Audited pre-payroll deduction cancellation with forced recalculation"
```

- [ ] **Step 7: Commit**

Commit message: `feat: add audited deduction cancellation`.

### Task 6: Final evidence and deployment handoff

**Files:**
- Modify: `DATABASE-SCHEMA.md`
- Modify: `docs/FEATURE-IMPACT-MAP.md`
- Modify: `docs/superpowers/plans/2026-07-22-productivity-deduction-controls.md`

**Interfaces:**
- Produces: reproducible proof for Wael's month report, Admin approval/cancellation, employee own-scope privacy, and migrations 049/050.

- [ ] **Step 1: Run the final complete gate sequentially**

```bash
pnpm run check
pnpm test -- --run
pnpm build
```

Expected: zero TypeScript/i18n errors, all Vitest files pass, Next.js build exits 0.

- [ ] **Step 2: Verify current production data read-only**

Re-read Wael's two corrected deadlines, migration records, absence of duplicate deduction source ids, and the status of any July deduction/payment/payroll linkage. Never create a deduction during verification.

- [ ] **Step 3: Commit documentation**

Commit message: `docs: record productivity deduction controls`.

- [ ] **Step 4: Ask Muhammad for deploy approval**

Only after explicit approval: `git fetch origin`, verify the branch base against `origin/main`, push the reviewed commits to `origin/main`, and smoke-check `workspace.pyramedia.cloud`.
