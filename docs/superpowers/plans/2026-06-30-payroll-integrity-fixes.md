# Payroll Integrity Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the payroll integrity gaps found in the 2026-06-30 audit — overtime drop, premature task "paid", never-flipped employee_payments, swallowed errors, invisible commission, scattered magic numbers, and two DB-integrity weaknesses — without changing the deduction model the user locked (fixed salary; only approved **unpaid leave** is deducted; attendance is NOT wired to pay).

**Architecture:** Extract the per-employee pay math into a pure, unit-tested function (`lib/payroll/calculate-item.ts`) consumed by the calculate route, so the overtime/commission/deduction logic is verifiable. Add a small shared payment-lifecycle helper (`lib/payroll/payment-lifecycle.ts`) so "mark paid + propagate to source task" is DRY across the payroll-run pay path and the manual employee-payment pay path. Centralize magic numbers in `lib/constants/payroll.ts`. Two forward-only migrations (022 already applied = commission column; 023 = FK + orphan cleanup).

**Tech Stack:** Next.js 15 App Router, Supabase (service-role), TypeScript, Vitest, jsPDF, React Query.

## Global Constraints

- **Deduction model is LOCKED (user decision 2026-06-30):** fixed monthly salary; the ONLY automatic deduction is approved **unpaid leave** (`baseSalary / workingDays × days`). Do **NOT** wire attendance/absence into payroll. Do not add tax/GPSSA.
- **`fetchAPI()` / `mutateAPI()` already unwrap `{ data }`** — never read `.data` again on their result. Components/hooks must NOT use raw `fetch()` (the only allowed raw-fetch exemption is multipart upload — not relevant here).
- **Gate-then-service-role:** every API route calls `requireApiPermission(...)` + `isApiError` BEFORE `createServiceRoleClient()`. Payroll tables are service-role-only (Gap #3 Tier-2). Do not change any permission gate.
- **Status strings come from `lib/constants/statuses.ts`** — `PAYROLL_STATUS`, `EMPLOYEE_PAYMENT_STATUS`, `TIMESHEET_STATUS`, `EXPENSE_STATUS`, `LEAVE_STATUS`. Never hardcode.
- **No magic numbers** — working days (22) + overtime multiplier (1.5) + default currency ('AED') live in `lib/constants/payroll.ts` (Task 1).
- **Observability:** server route catch blocks use `logError({ error, request, metadata })` from `@/lib/observability/log-error` (Phase 14.1) and/or `apiServerError(msg?, err, request)` which auto-logs when `err` is passed. Never silently swallow an error that affects money/state.
- **Activity logging discipline (Phase 11.5):** keep existing `action_type` values; new flavours go in `metadata`/`details`. Do not invent specific `action_type` strings.
- **RTL + dark mode** for any UI change: logical classes only (`ms-/me-/ps-/pe-/text-start/text-end`), pair `dark:` variants. UI is Arabic; code English.
- **Money safety:** `net_pay` is floored at 0. Adding `commission` to the stored breakdown must NOT change the net_pay formula (commission was already inside net_pay).
- **Verify after each task:** `pnpm run check` (tsc) must pass; `pnpm test` must pass; touched routes must still `pnpm build`. Lint may exit 1 due to ~18 pre-existing errors in untouched files — introduce ZERO new lint errors in touched files.
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Payroll constants module

**Files:**
- Create: `lib/constants/payroll.ts`

**Interfaces:**
- Produces: `PAYROLL_WORKING_DAYS_PER_MONTH: number` (22), `DEFAULT_OVERTIME_MULTIPLIER: number` (1.5), `DEFAULT_PAYROLL_CURRENCY: string` ('AED'). Consumed by Tasks 2, 3, 5.

- [ ] **Step 1: Create the constants file**

```ts
// ============================================================
// Payroll constants — single source of truth.
// Moved out of inline magic numbers in the payroll routes
// (audit 2026-06-30, Phase D). v1.1 backlog: make working-days
// + multiplier admin-editable via pyra_settings + a settings UI.
// ============================================================

/** UAE standard working days per month — basis for the daily rate
 *  used in unpaid-leave deductions (baseSalary / this × days). */
export const PAYROLL_WORKING_DAYS_PER_MONTH = 22;

/** Fallback overtime multiplier when a timesheet row has no
 *  `overtime_multiplier` set. */
export const DEFAULT_OVERTIME_MULTIPLIER = 1.5;

/** Default currency for a new payroll run when none is specified. */
export const DEFAULT_PAYROLL_CURRENCY = 'AED';
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm run check`
Expected: PASS (no consumers yet; pure addition).

- [ ] **Step 3: Commit**

```bash
git add lib/constants/payroll.ts
git commit -m "feat(payroll): centralize payroll magic numbers into constants"
```

---

### Task 2: Pure payroll-item calculator + wire calculate route

**Files:**
- Create: `lib/payroll/calculate-item.ts`
- Test: `__tests__/payroll-calculate-item.test.ts`
- Modify: `app/api/dashboard/payroll/[id]/calculate/route.ts`

**Interfaces:**
- Consumes: constants from Task 1.
- Produces: `calculatePayrollItem(input, opts?)` returning `{ base_salary, task_payments, overtime_amount, bonus, commission, deductions, deduction_details, net_pay }`. (The route maps DB → input → result → DB insert.)

**Context:** This fixes Phase A (overtime) + Phase E (store commission). The pure function owns the summing; the route owns the DB queries. **DB column `commission` already exists** (migration 022, applied + recorded). Manual `source_type='overtime'` employee-payments must now be ADDED to the overtime line (today they are silently dropped while still being consumed/linked). Timesheet overtime must only count **approved** timesheets.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/payroll-calculate-item.test.ts
import { describe, it, expect } from 'vitest';
import { calculatePayrollItem } from '@/lib/payroll/calculate-item';

describe('calculatePayrollItem', () => {
  it('base salary only → net = base', () => {
    const r = calculatePayrollItem({
      baseSalary: 5000, hourlyRate: 0, payments: [], overtimeTimesheets: [], unpaidLeave: [],
    });
    expect(r.net_pay).toBe(5000);
    expect(r.commission).toBe(0);
    expect(r.overtime_amount).toBe(0);
  });

  it('sums task, bonus, commission payments into net', () => {
    const r = calculatePayrollItem({
      baseSalary: 5000, hourlyRate: 0,
      payments: [
        { source_type: 'task', amount: 300 },
        { source_type: 'bonus', amount: 200 },
        { source_type: 'commission', amount: 500 },
      ],
      overtimeTimesheets: [], unpaidLeave: [],
    });
    expect(r.task_payments).toBe(300);
    expect(r.bonus).toBe(200);
    expect(r.commission).toBe(500);
    expect(r.net_pay).toBe(6000);
  });

  it('counts manual overtime payment AND timesheet overtime in overtime_amount', () => {
    const r = calculatePayrollItem({
      baseSalary: 0, hourlyRate: 100,
      payments: [{ source_type: 'overtime', amount: 250 }],
      overtimeTimesheets: [{ hours: 2, multiplier: 1.5 }], // 2*100*1.5 = 300
      unpaidLeave: [],
    });
    expect(r.overtime_amount).toBe(550);
    expect(r.net_pay).toBe(550);
  });

  it('deducts manual deductions and unpaid leave (base/22 per day)', () => {
    const r = calculatePayrollItem({
      baseSalary: 2200, hourlyRate: 0,
      payments: [{ source_type: 'deduction', amount: 100 }],
      overtimeTimesheets: [],
      unpaidLeave: [{ days: 2, typeName: 'إجازة غير مدفوعة' }], // 2200/22=100/day *2 = 200
    });
    expect(r.deductions).toBe(300);
    expect(r.deduction_details).toEqual([
      { type: 'deduction', amount: 100 },
      { type: 'unpaid_leave', amount: 200, reason: 'إجازة غير مدفوعة — 2 يوم' },
    ]);
    expect(r.net_pay).toBe(1900);
  });

  it('floors net at 0 (deductions exceed earnings)', () => {
    const r = calculatePayrollItem({
      baseSalary: 100, hourlyRate: 0,
      payments: [{ source_type: 'deduction', amount: 500 }],
      overtimeTimesheets: [], unpaidLeave: [],
    });
    expect(r.net_pay).toBe(0);
  });

  it('skips unpaid-leave deduction when baseSalary is 0 (no daily rate)', () => {
    const r = calculatePayrollItem({
      baseSalary: 0, hourlyRate: 0, payments: [],
      overtimeTimesheets: [], unpaidLeave: [{ days: 3, typeName: 'إجازة غير مدفوعة' }],
    });
    expect(r.deductions).toBe(0);
    expect(r.net_pay).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test payroll-calculate-item`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure function**

```ts
// lib/payroll/calculate-item.ts
import {
  PAYROLL_WORKING_DAYS_PER_MONTH,
  DEFAULT_OVERTIME_MULTIPLIER,
} from '@/lib/constants/payroll';

export interface PayrollPaymentInput {
  source_type: string; // 'task' | 'bonus' | 'commission' | 'deduction' | 'overtime'
  amount: number | string;
}
export interface OvertimeTimesheetInput {
  hours: number | string;
  multiplier: number | string | null | undefined;
}
export interface UnpaidLeaveInput {
  days: number;
  typeName: string;
}
export interface PayrollItemInput {
  baseSalary: number;
  hourlyRate: number;
  payments: PayrollPaymentInput[];        // approved, unlinked, this month
  overtimeTimesheets: OvertimeTimesheetInput[]; // approved is_overtime rows, this month
  unpaidLeave: UnpaidLeaveInput[];
}
export interface DeductionDetail {
  type: string;
  amount: number;
  reason?: string;
}
export interface PayrollItemResult {
  base_salary: number;
  task_payments: number;
  overtime_amount: number;
  bonus: number;
  commission: number;
  deductions: number;
  deduction_details: DeductionDetail[];
  net_pay: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (rows: PayrollPaymentInput[], type: string) =>
  rows.filter(p => p.source_type === type).reduce((s, p) => s + Number(p.amount), 0);

/**
 * Pure per-employee payroll math. No DB access.
 * Locked model (2026-06-30): fixed base salary + manual additions
 * (task/bonus/commission/overtime payments) + timesheet overtime,
 * minus manual deductions + unpaid-leave deductions. net floored at 0.
 */
export function calculatePayrollItem(
  input: PayrollItemInput,
  opts?: { workingDays?: number },
): PayrollItemResult {
  const workingDays = opts?.workingDays ?? PAYROLL_WORKING_DAYS_PER_MONTH;
  const baseSalary = Number(input.baseSalary) || 0;
  const hourlyRate = Number(input.hourlyRate) || 0;

  const taskPayments = sum(input.payments, 'task');
  const bonus = sum(input.payments, 'bonus');
  const commission = sum(input.payments, 'commission');

  // Overtime = timesheet overtime + manual overtime payments
  const timesheetOvertime = input.overtimeTimesheets.reduce(
    (s, t) => s + Number(t.hours) * hourlyRate * (Number(t.multiplier) || DEFAULT_OVERTIME_MULTIPLIER),
    0,
  );
  const overtimeAmount = timesheetOvertime + sum(input.payments, 'overtime');

  // Deductions: manual deduction payments + unpaid-leave (base/workingDays × days)
  const deductionDetails: DeductionDetail[] = input.payments
    .filter(p => p.source_type === 'deduction')
    .map(p => ({ type: 'deduction', amount: Number(p.amount) }));
  let deductions = deductionDetails.reduce((s, d) => s + d.amount, 0);

  if (baseSalary > 0) {
    const dailyRate = baseSalary / workingDays;
    for (const leave of input.unpaidLeave) {
      const amount = round2(dailyRate * leave.days);
      deductions += amount;
      deductionDetails.push({ type: 'unpaid_leave', amount, reason: `${leave.typeName} — ${leave.days} يوم` });
    }
  }

  const netPay = Math.max(
    0,
    baseSalary + taskPayments + overtimeAmount + bonus + commission - deductions,
  );

  return {
    base_salary: baseSalary,
    task_payments: taskPayments,
    overtime_amount: round2(overtimeAmount),
    bonus,
    commission,
    deductions: round2(deductions),
    deduction_details: deductionDetails,
    net_pay: round2(netPay),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test payroll-calculate-item`
Expected: PASS (6 tests).

- [ ] **Step 5: Wire the calculate route to the pure function**

In `app/api/dashboard/payroll/[id]/calculate/route.ts`:

1. Add imports at top:
```ts
import { TIMESHEET_STATUS } from '@/lib/constants/statuses';
import { calculatePayrollItem } from '@/lib/payroll/calculate-item';
import { logError } from '@/lib/observability/log-error';
```

2. Add `.eq('status', TIMESHEET_STATUS.APPROVED)` to the overtime timesheet query (the `.eq('is_overtime', true)` block ~line 96-101):
```ts
    const { data: allTimesheets } = await supabase
      .from('pyra_timesheets')
      .select('username, hours, is_overtime, overtime_multiplier, status')
      .eq('is_overtime', true)
      .eq('status', TIMESHEET_STATUS.APPROVED)
      .gte('date', startDate)
      .lte('date', endDate);
```

3. Replace the per-employee math block (the `for (const emp of activeEmployees)` body that computes taskPayments/overtimeAmount/bonus/commissions/deductions/netPay and pushes to `payrollItems`) so it calls the pure function and stores `commission`. The loop still builds `linkedPaymentIds` from ALL of the user's payments and accumulates `totalAmount`:
```ts
    for (const emp of activeEmployees) {
      const userPayments = paymentsByUser[emp.username] || [];
      const userTimesheets = timesheetsByUser[emp.username] || [];

      const result = calculatePayrollItem({
        baseSalary: Number(emp.salary) || 0,
        hourlyRate: Number(emp.hourly_rate) || 0,
        payments: userPayments.map(p => ({ source_type: p.source_type, amount: p.amount })),
        overtimeTimesheets: userTimesheets.map(t => ({ hours: t.hours, multiplier: t.overtime_multiplier })),
        unpaidLeave: unpaidLeaveByUser[emp.username] || [],
      });

      payrollItems.push({
        id: generateId('pi'),
        payroll_id: id,
        username: emp.username,
        base_salary: result.base_salary,
        task_payments: result.task_payments,
        overtime_amount: result.overtime_amount,
        bonus: result.bonus,
        commission: result.commission,
        deductions: result.deductions,
        deduction_details: result.deduction_details,
        net_pay: result.net_pay,
        status: 'pending',
      });

      totalAmount += result.net_pay;
      userPayments.forEach(p => linkedPaymentIds.push(p.id));
    }
```
   - Update the `payrollItems` array TYPE annotation (the `Array<{...}>` declared above the loop) to include `commission: number;`.
   - The `unpaidLeaveByUser` entries already have shape `{ days, typeName }` — matches `UnpaidLeaveInput`.
   - DELETE the now-unused inline helpers in the old loop body (the `round2`-style leave math, the per-source `.filter().reduce()` blocks). Keep the upstream query/lookup-map building (allPayments, timesheetsByUser, unpaidLeaveByUser) unchanged.

4. Replace the catch block's bare `console.error` with observability:
```ts
  } catch (err) {
    logError({ error: err, request: req, metadata: { route: 'payroll/calculate' } });
    console.error('POST /api/dashboard/payroll/[id]/calculate error:', err);
    return apiServerError();
  }
```

- [ ] **Step 6: Verify**

Run: `pnpm test payroll-calculate-item && pnpm run check`
Expected: tests PASS, tsc PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/payroll/calculate-item.ts __tests__/payroll-calculate-item.test.ts "app/api/dashboard/payroll/[id]/calculate/route.ts"
git commit -m "fix(payroll): count manual overtime + commission, approved-only timesheet overtime (pure calc + tests)"
```

---

### Task 3: Payroll-run pay → flip consumed payments + source tasks; harden expense creation

**Files:**
- Create: `lib/payroll/payment-lifecycle.ts`
- Modify: `app/api/dashboard/payroll/[id]/route.ts`

**Interfaces:**
- Produces: `markPaymentsPaidAndPropagate(supabase, paymentIds): Promise<void>` — sets the given `pyra_employee_payments` to `paid` + `paid_at`, then for those whose `source_type='task'` flips their source `pyra_tasks.payment_status` to `paid`. Consumed by Task 4.

**Context:** Phase B1 + Phase C. When a payroll run is paid, the linked `pyra_employee_payments` (consumed into the run) stay `approved` forever, and source tasks never settle. Also the payroll-expense insert swallows its error.

- [ ] **Step 1: Create the lifecycle helper**

```ts
// lib/payroll/payment-lifecycle.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { EMPLOYEE_PAYMENT_STATUS } from '@/lib/constants/statuses';
import { logError } from '@/lib/observability/log-error';

/**
 * Mark employee payments as paid and propagate to source tasks.
 * Used when a payroll run is paid (bulk) and when a single
 * employee-payment is paid manually. Service-role client required.
 *
 * Errors are logged, never thrown — settling pay must not break the
 * caller's response after the money action already succeeded.
 */
export async function markPaymentsPaidAndPropagate(
  supabase: SupabaseClient,
  paymentIds: string[],
): Promise<void> {
  if (!paymentIds.length) return;
  const nowIso = new Date().toISOString();

  const { error: payErr } = await supabase
    .from('pyra_employee_payments')
    .update({ status: EMPLOYEE_PAYMENT_STATUS.PAID, paid_at: nowIso })
    .in('id', paymentIds);
  if (payErr) logError({ error: payErr, metadata: { fn: 'markPaymentsPaidAndPropagate', step: 'payments', paymentIds } });

  // Propagate to source tasks for task-type payments
  const { data: rows, error: selErr } = await supabase
    .from('pyra_employee_payments')
    .select('source_id, source_type')
    .in('id', paymentIds)
    .eq('source_type', 'task')
    .not('source_id', 'is', null);
  if (selErr) { logError({ error: selErr, metadata: { fn: 'markPaymentsPaidAndPropagate', step: 'select-tasks' } }); return; }

  const taskIds = [...new Set((rows || []).map(r => r.source_id as string).filter(Boolean))];
  if (taskIds.length) {
    const { error: taskErr } = await supabase
      .from('pyra_tasks')
      .update({ payment_status: EMPLOYEE_PAYMENT_STATUS.PAID, updated_at: nowIso })
      .in('id', taskIds);
    if (taskErr) logError({ error: taskErr, metadata: { fn: 'markPaymentsPaidAndPropagate', step: 'tasks', taskIds } });
  }
}
```

- [ ] **Step 2: Wire it into the payroll-run `pay` action**

In `app/api/dashboard/payroll/[id]/route.ts`, `if (action === 'pay')` block, AFTER the existing items→paid update (`.from('pyra_payroll_items').update({ status: PAYROLL_STATUS.PAID })`):
```ts
      // Settle the employee_payments consumed by this run + their source tasks
      const { data: consumed } = await supabase
        .from('pyra_employee_payments')
        .select('id')
        .eq('payroll_id', id);
      await markPaymentsPaidAndPropagate(supabase, (consumed || []).map((p: { id: string }) => p.id));
```
Add import: `import { markPaymentsPaidAndPropagate } from '@/lib/payroll/payment-lifecycle';`

- [ ] **Step 3: Harden expense creation (don't swallow) + defensive category**

In the `if (action === 'approve')` block, replace the `if (expErr) console.error(...)` line with `logError`, and ensure the category exists before insert. Just BEFORE `const { error: expErr } = await supabase.from('pyra_expenses').insert(expenseRecords);`:
```ts
        // Defensive: ensure the salaries expense category exists (id is referenced above)
        await supabase
          .from('pyra_expense_categories')
          .upsert({ id: 'ec_salaries', name: 'Salaries', name_ar: 'الرواتب' }, { onConflict: 'id' });
```
And replace the swallow:
```ts
        const { error: expErr } = await supabase.from('pyra_expenses').insert(expenseRecords);
        if (expErr) logError({ error: expErr, request: req, metadata: { route: 'payroll/approve', step: 'expense-insert', payroll_id: id } });
```

- [ ] **Step 4: logError in both catch blocks**

Add `import { logError } from '@/lib/observability/log-error';` and, in the GET and PATCH catch blocks, add a `logError({ error: err, request: req, metadata: { route: 'payroll/[id]' } });` line above the existing `console.error`.

- [ ] **Step 5: Verify**

Run: `pnpm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/payroll/payment-lifecycle.ts "app/api/dashboard/payroll/[id]/route.ts"
git commit -m "fix(payroll): settle consumed payments + source tasks on run pay; stop swallowing expense errors"
```

---

### Task 4: Task-payment lifecycle — no premature 'paid', dedup, manual-pay propagation

**Files:**
- Modify: `app/api/dashboard/tasks/[id]/payment/route.ts`
- Modify: `app/api/dashboard/employee-payments/[id]/route.ts`

**Interfaces:**
- Consumes: `markPaymentsPaidAndPropagate` from Task 3.

**Context:** Phase B2 + Phase C. Today recording a task payment immediately sets `task.payment_status='paid'` while the payment is only `pending`; and the manual `pay` of an employee-payment never settles the source task. Fix: on creation set the task to `pending` (matching the payment) + block duplicates; on manual pay of a task-type payment, propagate to the task.

- [ ] **Step 1: Task-payment route — dedup guard + PENDING status**

In `app/api/dashboard/tasks/[id]/payment/route.ts`:

1. After fetching the task and the existing `payment_status === PAID` guard, add a duplicate-active-payment guard (prevents multiple pending payments for one task now that we no longer flip to paid):
```ts
    // Block if a non-rejected payment already exists for this task
    const { data: existingPayment } = await serviceClient
      .from('pyra_employee_payments')
      .select('id, status')
      .eq('source_id', task.id)
      .eq('source_type', 'task')
      .neq('status', EMPLOYEE_PAYMENT_STATUS.REJECTED)
      .maybeSingle();
    if (existingPayment) {
      return apiError('يوجد سجل دفع نشط لهذه المهمة بالفعل', 409);
    }
```
   (Note: `serviceClient` is created right after this point today — move its creation ABOVE this guard, or use it here. Ensure `serviceClient` exists before the query. Keep the existing task read on the session client as-is.)

2. Change the task update to set PENDING (was PAID):
```ts
    const { error: updateError } = await serviceClient
      .from('pyra_tasks')
      .update({ payment_status: EMPLOYEE_PAYMENT_STATUS.PENDING, updated_at: new Date().toISOString() })
      .eq('id', id);
```

3. Replace the catch block's `console.error`-only with `logError` (add import `import { logError } from '@/lib/observability/log-error';`):
```ts
  } catch (err) {
    logError({ error: err, request: req, metadata: { route: 'tasks/payment', task_id: id } });
    console.error('[POST /api/dashboard/tasks/[id]/payment] error:', err);
    return apiServerError();
  }
```
   (`id` is in scope from `await params` — if not yet awaited in the catch's scope, reference it without `id` in metadata.)

- [ ] **Step 2: employee-payments `[id]` PATCH `pay` → propagate to source task**

In `app/api/dashboard/employee-payments/[id]/route.ts`, in the `if (action === 'pay')` block, AFTER the successful update returns `data`, propagate to the source task when applicable:
```ts
      if (payment.source_type === 'task' && payment.source_id) {
        const { error: taskErr } = await supabase
          .from('pyra_tasks')
          .update({ status: undefined }) // placeholder — see exact below
      }
```
   Exact implementation (replace the placeholder above): after `if (error) return apiServerError(error.message);` and before the activity log, add:
```ts
      if (payment.source_type === 'task' && payment.source_id) {
        const { error: taskErr } = await supabase
          .from('pyra_tasks')
          .update({ payment_status: EMPLOYEE_PAYMENT_STATUS.PAID, updated_at: new Date().toISOString() })
          .eq('id', payment.source_id);
        if (taskErr) logError({ error: taskErr, request: req, metadata: { route: 'employee-payments/pay', step: 'propagate-task', payment_id: id } });
      }
```
   Add import `import { logError } from '@/lib/observability/log-error';` and add a `logError(...)` line in the catch block above its `console.error`.
   (Note: this route's manual single-payment pay path duplicates only ~4 lines vs the bulk helper; using the inline update here is acceptable since the helper operates on arrays — OR call `markPaymentsPaidAndPropagate(supabase, [id])` INSTEAD of the manual `.update({status:PAID,...})` to keep it fully DRY. Prefer calling the helper: replace the whole `.update({ status: PAID, paid_at })...` with the status-guard + `await markPaymentsPaidAndPropagate(supabase, [id])` + a re-fetch of the row for the response. Implementer's choice; if using the helper, ensure the 409 "must approve first" guard stays and the response still returns the updated row with `pyra_users(display_name)`.)

- [ ] **Step 3: Verify**

Run: `pnpm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/api/dashboard/tasks/[id]/payment/route.ts" "app/api/dashboard/employee-payments/[id]/route.ts"
git commit -m "fix(payroll): task payment settles only when actually paid; block duplicate task payments"
```

---

### Task 5: Surface commission + settings-driven company name (read APIs + type)

**Files:**
- Modify: `app/api/dashboard/payroll/[id]/payslip/route.ts`
- Modify: `app/api/dashboard/my-payslips/route.ts`
- Modify: `hooks/usePayroll.ts`

**Context:** Phase E (read side) + Phase D (company name). Expose the new `commission` column and replace the hardcoded `'Pyramedia X'` with the `company_name` from `pyra_settings` (key `company_name`, currently `'PyramediaX'`).

- [ ] **Step 1: payslip route — return commission + settings company name + logError**

In `app/api/dashboard/payroll/[id]/payslip/route.ts`:
1. Add `commission: item.commission,` to the returned `item` object.
2. Replace `company_name: 'Pyramedia X',` with a settings lookup. Before the `return apiSuccess(...)`:
```ts
    const { data: setting } = await supabase
      .from('pyra_settings')
      .select('value')
      .eq('key', 'company_name')
      .maybeSingle();
    const companyName = setting?.value || 'Pyramedia X';
```
   then `company_name: companyName,` in the response.
3. Add `import { logError } from '@/lib/observability/log-error';` and a `logError({ error: err, request: req, metadata: { route: 'payslip' } });` in the catch above `console.error`.

- [ ] **Step 2: my-payslips route — flatten commission + logError**

In `app/api/dashboard/my-payslips/route.ts`, add `commission: item.commission,` to the flattened payslip object (next to `bonus`). Add `logError` import + line in the catch.

- [ ] **Step 3: usePayroll PayrollItem type — add commission**

In `hooks/usePayroll.ts` `PayrollItem` interface, add `commission: number;` (next to `bonus`).

- [ ] **Step 4: Verify**

Run: `pnpm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/dashboard/payroll/[id]/payslip/route.ts" app/api/dashboard/my-payslips/route.ts hooks/usePayroll.ts
git commit -m "feat(payroll): expose commission line + read company name from settings"
```

---

### Task 6: Commission in payslip PDF + payslip UIs; read-side hygiene

**Files:**
- Modify: `lib/pdf/payslip-pdf.ts`
- Modify: `app/dashboard/my-payslips/my-payslips-client.tsx`
- Modify: `components/payroll/PayrollRunRow.tsx`
- Modify: `hooks/usePayroll.ts`

**Context:** Phase E (UI/PDF) + Phase F (read-side hygiene): type `useMyPayslips`, make the my-payslips page consume it + use `fetchAPI` for download, clean the confusing `(resp as {data}).data ?? resp` unwrap in PayrollRunRow.

- [ ] **Step 1: payslip-pdf — commission row + totalEarnings**

In `lib/pdf/payslip-pdf.ts`:
1. Add `commission: number;` to `PayslipData`.
2. Add a row in the earnings `rows` array after Bonus:
```ts
    { label: 'Commission', labelAr: 'العمولات', amount: data.commission },
```
3. Update `totalEarnings`:
```ts
  const totalEarnings = data.base_salary + data.task_payments + data.overtime_amount + data.bonus + data.commission;
```

- [ ] **Step 2: my-payslips-client — commission + typed hook + fetchAPI download**

In `app/dashboard/my-payslips/my-payslips-client.tsx`:
1. Add `commission: number;` to the `Payslip` interface.
2. Replace the inline `useQuery` with the typed hook:
```ts
import { useMyPayslips } from '@/hooks/usePayroll';
// ...
const { data: payslipsData, isLoading: loading } = useMyPayslips();
```
   (Remove the now-unused `useQuery`/`fetchAPI` query import lines IF they become unused — but `fetchAPI` is still used for download below, so keep it.)
3. Convert `handleDownload` to use `fetchAPI` (no raw `fetch`/`.json()`):
```ts
      const data = await fetchAPI<{
        company_name: string;
        employee: { display_name: string; department: string | null };
        payroll: { month: number; year: number; currency?: string };
        item: { base_salary: number; task_payments: number; overtime_amount: number; bonus: number; commission: number; deductions: number; deduction_details: Array<{ type: string; amount: number }>; net_pay: number };
      }>(`/api/dashboard/payroll/${payslip.payroll_id}/payslip?username=${payslip.username}`);
```
   then pass `commission: Number(data.item.commission),` into `generatePayslipPDF(...)`.

- [ ] **Step 3: usePayroll — type useMyPayslips**

In `hooks/usePayroll.ts`, add a `PayslipsResponse` export and type the hook:
```ts
export interface EmployeePaymentRow {
  id: string; source_type: string; description: string | null;
  amount: number; currency: string; status: string; created_at: string;
}
export interface MyPayslipRow extends PayrollItem {
  month: number; year: number; run_status: string; currency: string; paid_at: string | null;
}
export interface PayslipsResponse { payslips: MyPayslipRow[]; payments: EmployeePaymentRow[]; }

export function useMyPayslips() {
  return useQuery<PayslipsResponse>({
    queryKey: ['my-payslips'],
    queryFn: () => fetchAPI('/api/dashboard/my-payslips'),
    staleTime: 5 * 60_000,
  });
}
```
   (Align the client's local `Payslip`/`Payment` interfaces with these, or import the hook types — keep whichever yields zero tsc errors; the client may keep its local interfaces as long as shapes match.)

- [ ] **Step 4: PayrollRunRow — commission column + clean unwrap + pass to PDF**

In `components/payroll/PayrollRunRow.tsx`:
1. Add a `عمولة` column header after `مكافأة` (`<th scope="col" className="text-end pb-3 pe-3 font-medium">عمولة</th>`) and a matching cell:
```tsx
                        <td className="py-3 pe-3 text-end font-mono text-foreground">
                          {item.commission > 0 ? formatCurrency(item.commission) : '—'}
                        </td>
```
2. In `handleDownloadPayslip`, replace the confusing unwrap with the typed `fetchAPI` result directly (fetchAPI already unwraps):
```ts
      const d = await fetchAPI<{
        company_name: string;
        employee: { display_name: string; department: string };
        payroll: { month: number; year: number; currency?: string };
        item: { base_salary: number; task_payments: number; overtime_amount: number; bonus: number; commission: number; deductions: number; deduction_details: Array<{ type: string; amount: number }>; net_pay: number };
      }>(`/api/dashboard/payroll/${run.id}/payslip?username=${username}`);
```
   (Remove the `const resp = ...; const data = (resp as {data}).data ?? resp; const d = data as {...}` lines.)
3. Add `commission: Number(d.item.commission),` to the `generatePayslipPDF(...)` call.

- [ ] **Step 5: Verify**

Run: `pnpm run check && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/pdf/payslip-pdf.ts app/dashboard/my-payslips/my-payslips-client.tsx components/payroll/PayrollRunRow.tsx hooks/usePayroll.ts
git commit -m "feat(payroll): show commission in payslip PDF + admin/employee payslip views; read-side hygiene"
```

---

### Task 7: DB integrity cleanup + remove dead permissions

**Files:**
- Create: `supabase/migrations/023_payroll_integrity.sql`
- Modify: `lib/auth/rbac.ts`

**Context:** Phase F. Add the missing FK on `pyra_employee_payments.payroll_id` (asymmetric — `payroll_items.payroll_id` already has one), delete the orphan `pyra_salary_history` row for `abeer` (user does not exist), and remove the dead `employee_payments.view`/`.manage` permission declarations (no route/UI references them; the employee-payments routes gate on `payroll.*`).

- [ ] **Step 1: Write migration 023**

```sql
-- =============================================================
-- Migration 023: payroll integrity (FK + orphan cleanup)
-- =============================================================
-- Context: Payroll Integrity Fixes (Phase F).
-- 1) Symmetry: pyra_payroll_items.payroll_id has an FK to
--    pyra_payroll_runs but pyra_employee_payments.payroll_id did not.
--    Add it (ON DELETE SET NULL — unlink payments if a run is deleted).
--    Pre-verified clean: 0 rows with payroll_id pointing at a missing run.
-- 2) Delete the orphan salary_history row for 'abeer' (no such user).
-- Risk tier: 2 (touches existing data — orphan delete). Backup taken.
-- Forward-only (Phase 14.2).
-- =============================================================

DELETE FROM pyra_salary_history
WHERE username = 'abeer'
  AND NOT EXISTS (SELECT 1 FROM pyra_users u WHERE u.username = pyra_salary_history.username);

ALTER TABLE pyra_employee_payments
  DROP CONSTRAINT IF EXISTS pyra_employee_payments_payroll_id_fkey;

ALTER TABLE pyra_employee_payments
  ADD CONSTRAINT pyra_employee_payments_payroll_id_fkey
  FOREIGN KEY (payroll_id) REFERENCES pyra_payroll_runs(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Remove dead permissions from rbac.ts**

Find the `employee_payments.view` / `employee_payments.manage` permission declarations (around `lib/auth/rbac.ts:173`) and remove them (the constant entries + any reference in `PERMISSION_MODULES`). Confirm via grep that no route, hook, sidebar, or component references `employee_payments.view` or `employee_payments.manage` before removing.

- [ ] **Step 3: Verify**

Run: `pnpm run check`
Expected: PASS. (Migration is applied + recorded by the controller, not by tsc.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/023_payroll_integrity.sql lib/auth/rbac.ts
git commit -m "chore(payroll): add employee_payments→runs FK, drop orphan salary_history row, remove dead perms"
```

---

## Controller-applied migrations (NOT subagent tasks)

- **022** (commission column) — ALREADY applied + recorded (checksum `4a9d8d44…`).
- **023** (FK + orphan) — after Task 7's file lands: backup `pyra_salary_history` + `pyra_employee_payments`, apply via `pg/query`, verify (FK present, orphan gone, 0 broken FKs), then `pnpm db:record 023_payroll_integrity --by=elharm`.

## Deferred (v1.1 backlog — do NOT build now)

- Payment attribution by **earned/work month** instead of `created_at` (audit #6) — needs a `pay_period`/`earned_date` column + UI; separate cycle.
- Make `working_days` + `overtime_multiplier` admin-editable via `pyra_settings` + a settings UI (Task 1 keeps them as constants).
- Attendance→payroll deductions — explicitly OUT per the locked deduction model.
