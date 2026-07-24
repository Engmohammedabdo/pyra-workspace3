import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { EMPLOYEE_PAYMENT_STATUS, TIMESHEET_STATUS } from '@/lib/constants/statuses';
import { calculatePayrollItem, hireProrationFactor, leaveOverlapDays } from '@/lib/payroll/calculate-item';
import { logError } from '@/lib/observability/log-error';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { EMPLOYEE_PAYMENT_SOURCE_TYPE, PAYROLL_RPC_STATUS } from '@/lib/constants/payroll';
import { mergePayrollPeriodPayments, payrollPaymentPeriodRange } from '@/lib/payroll/payment-period';
import { MONTHLY_DEDUCTION_CAP_PERCENT } from '@/lib/constants/deductions';

type RouteParams = { params: Promise<{ id: string }> };

// =============================================================
// POST /api/dashboard/payroll/[id]/calculate
// Calculate all payroll items for a given run.
// =============================================================
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiPermission('payroll.manage');
    if (isApiError(auth)) return auth;
    const t = await getTranslations('api');

    const { id } = await params;
    const supabase = createServiceRoleClient();
    const failFinancialOperation = (error: { message: string }, step: string) => {
      logError({
        error,
        request: req,
        metadata: { route: 'payroll/calculate', step, payroll_id: id },
      });
      return apiServerError(error.message);
    };

    // 1. Fetch the payroll run
    const { data: run, error: runError } = await supabase
      .from('pyra_payroll_runs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (runError) return failFinancialOperation(runError, 'run-read');
    if (!run) return apiNotFound(t('payroll.runNotFound'));

    // Verify status is draft or calculated (allow recalculation)
    if (!['draft', 'calculated'].includes(run.status)) {
      return apiError(t('payroll.cannotCalculateInStatus', { status: run.status }), 409);
    }

    const { month, year } = run;
    // Resolve the run's currency — default to AED for legacy rows that pre-date
    // the currency column (migration 025).
    const runCurrency: string = run.currency || 'AED';

    const { data: existingLinkedPayments, error: existingLinkedPaymentsError } = await supabase
      .from('pyra_employee_payments')
      .select('id, username, source_type, amount, deduction_cap_exempt_amount, currency, status, payroll_id, effective_month, created_at')
      .eq('payroll_id', id);

    if (existingLinkedPaymentsError) {
      return failFinancialOperation(existingLinkedPaymentsError, 'existing-payment-links-read');
    }

    // 3. Fetch all active employees
    // Only ACTIVE employees are paid. Excludes 'inactive' AND 'suspended' —
    // the previous .neq('status','suspended') wrongly paid inactive staff.
    const { data: employees, error: empError } = await supabase
      .from('pyra_users')
      .select('username, display_name, salary, hourly_rate, department, payment_type, employment_type, status, hire_date, salary_currency')
      .eq('status', 'active');

    if (empError) return failFinancialOperation(empError, 'employees-read');
    if (!employees || employees.length === 0) {
      return apiError(t('payroll.noActiveEmployees'), 400);
    }

    // Filter out employees with no meaningful compensation
    const activeEmployees = employees.filter((e: { payment_type: string | null; salary: number | null; hourly_rate: number | null; salary_currency: string | null }) =>
      (e.payment_type === 'monthly_salary' && (e.salary || 0) > 0) ||
      (e.payment_type === 'hourly' && (e.hourly_rate || 0) > 0) ||
      e.payment_type === 'per_task' ||
      e.payment_type === 'commission'
    // Currency filter: include only employees whose salary_currency matches this
    // run's currency. Defaults to 'AED' for employees missing the column (legacy rows).
    // NOTE: salary_currency governs BOTH `salary` AND `hourly_rate` for an employee
    // (there is no separate hourly_rate_currency) — an hourly worker's rate is
    // assumed to be in their salary_currency.
    ).filter((e: { salary_currency: string | null }) =>
      (e.salary_currency || 'AED') === runCurrency
    );

    if (activeEmployees.length === 0) {
      return apiError(t('payroll.noEmployeesInRunCurrency'), 400);
    }

    // Build date range for this month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const periodMonth = `${year}-${String(month).padStart(2, '0')}`;
    const paymentPeriod = payrollPaymentPeriodRange(periodMonth);
    if (!paymentPeriod) return apiError(t('payroll.yearInvalid'), 422);

    // 4a. Non-deduction rows belong to their created-at month only when they
    // have no explicit effective month. A deduction must be classified with
    // an explicit effective_month before payroll can use it.
    const { data: legacyPayments, error: legacyPaymentsError } = await supabase
      .from('pyra_employee_payments')
      .select('id, username, source_type, amount, deduction_cap_exempt_amount, currency, status, payroll_id, effective_month, created_at')
      .eq('status', EMPLOYEE_PAYMENT_STATUS.APPROVED)
      .is('payroll_id', null)
      .is('effective_month', null)
      .neq('source_type', EMPLOYEE_PAYMENT_SOURCE_TYPE.DEDUCTION)
      .gte('created_at', paymentPeriod.createdAtStart)
      .lt('created_at', paymentPeriod.createdAtEndExclusive)
      // A final_settlement is an off-cycle obligation paid manually — never
      // swept into a monthly run (which would mark it paid without paying it).
      .neq('source_type', EMPLOYEE_PAYMENT_SOURCE_TYPE.FINAL_SETTLEMENT);

    if (legacyPaymentsError) return failFinancialOperation(legacyPaymentsError, 'legacy-payments-read');

    // 4b. System-generated deductions belong to their effective month even
    // when the explicit admin approval happened in a later calendar month.
    const { data: effectiveMonthDeductions, error: effectiveMonthDeductionsError } = await supabase
      .from('pyra_employee_payments')
      .select('id, username, source_type, amount, deduction_cap_exempt_amount, currency, status, payroll_id, effective_month, created_at')
      .eq('status', EMPLOYEE_PAYMENT_STATUS.APPROVED)
      .is('payroll_id', null)
      .eq('source_type', EMPLOYEE_PAYMENT_SOURCE_TYPE.DEDUCTION)
      .eq('effective_month', startDate);

    if (effectiveMonthDeductionsError) {
      return failFinancialOperation(effectiveMonthDeductionsError, 'effective-month-deductions-read');
    }

    // 5. Fetch all overtime timesheets for this month
    const { data: allTimesheets, error: allTimesheetsError } = await supabase
      .from('pyra_timesheets')
      .select('username, hours, is_overtime, overtime_multiplier, status')
      .eq('is_overtime', true)
      .eq('status', TIMESHEET_STATUS.APPROVED)
      .gte('date', startDate)
      .lte('date', endDate);

    if (allTimesheetsError) return failFinancialOperation(allTimesheetsError, 'overtime-read');

    // 5b. Fetch approved unpaid leave OVERLAPPING this month (cross-month safe).
    // NOTE: pyra_leave_requests columns are `type` (a NAME string, NOT an id) and
    // `days_count` — there is NO leave_type_id / total_days. The previous code
    // selected the non-existent columns, so PostgREST returned null and NO unpaid
    // leave was EVER deducted. Overlap filter (start <= monthEnd AND end >= monthStart)
    // catches leaves spanning a month boundary.
    const { data: leaveRequests, error: leaveRequestsError } = await supabase
      .from('pyra_leave_requests')
      .select('username, type, start_date, end_date')
      .eq('status', 'approved')
      .lte('start_date', endDate)
      .gte('end_date', startDate);

    if (leaveRequestsError) return failFinancialOperation(leaveRequestsError, 'unpaid-leave-read');

    // Resolve which leave TYPE NAMES are unpaid (is_paid=false). `type` matches
    // pyra_leave_types.name (there is no id link on the request).
    const unpaidTypeNames = new Set<string>();
    if (leaveRequests && leaveRequests.length > 0) {
      const typeNames = [
        ...new Set(leaveRequests.map((lr: { type: string | null }) => lr.type).filter(Boolean)),
      ] as string[];
      if (typeNames.length > 0) {
        const { data: types, error: leaveTypesError } = await supabase
          .from('pyra_leave_types')
          .select('name, is_paid')
          .in('name', typeNames);
        if (leaveTypesError) return failFinancialOperation(leaveTypesError, 'leave-types-read');
        if (types) {
          for (const t of types as { name: string; is_paid: boolean }[]) {
            if (!t.is_paid) unpaidTypeNames.add(t.name);
          }
        }
      }
    }

    // Build unpaid leave deductions per user — count ONLY the days that fall
    // inside this run month (leaveOverlapDays handles month-boundary spans).
    const unpaidLeaveByUser: Record<string, { days: number; typeName: string }[]> = {};
    if (leaveRequests) {
      for (const lr of leaveRequests as {
        username: string; type: string | null; start_date: string; end_date: string;
      }[]) {
        if (!lr.type || !unpaidTypeNames.has(lr.type)) continue;
        const days = leaveOverlapDays(lr.start_date, lr.end_date, startDate, endDate);
        if (days <= 0) continue;
        if (!unpaidLeaveByUser[lr.username]) unpaidLeaveByUser[lr.username] = [];
        unpaidLeaveByUser[lr.username].push({ days, typeName: 'إجازة غير مدفوعة' }); // i18n-exempt: stored data — feeds lib/payroll/calculate-item.ts's (c)-classified deduction_details.reason, never returned as a top-level response message itself
      }
    }

    // Build lookup maps
    // NOTE: allPayments already includes ALL source_types (task, commission, bonus, deduction, overtime)
    // Do NOT fetch commissions separately — that would double-count them!
    //
    // Currency gate: only include payments whose currency matches this run's currency.
    // Mismatched payments (e.g. a USD bonus in an AED run) are skipped and counted
    // separately so the caller can surface a warning.
    const paymentsByUser: Record<string, Array<{
      id: string;
      source_type: string;
      amount: number;
      deduction_cap_exempt_amount: number | null;
    }>> = {};
    let skippedMismatchedPayments = 0;
    const previouslyLinkedApproved = (existingLinkedPayments || []).filter(
      (payment: { status: string }) => payment.status === EMPLOYEE_PAYMENT_STATUS.APPROVED,
    );
    const allPaymentsCombined = mergePayrollPeriodPayments(
      periodMonth,
      legacyPayments || [],
      effectiveMonthDeductions || [],
      previouslyLinkedApproved,
    );
    allPaymentsCombined.forEach((p: {
      id: string;
      username: string;
      source_type: string;
      amount: number;
      deduction_cap_exempt_amount: number | null;
      currency: string | null;
    }) => {
      const pCurrency = p.currency || 'AED';
      if (pCurrency !== runCurrency) {
        skippedMismatchedPayments++;
        return;
      }
      if (!paymentsByUser[p.username]) paymentsByUser[p.username] = [];
      paymentsByUser[p.username].push({
        id: p.id,
        source_type: p.source_type,
        amount: p.amount,
        deduction_cap_exempt_amount: p.deduction_cap_exempt_amount,
      });
    });

    const timesheetsByUser: Record<string, Array<{ hours: number; overtime_multiplier: number }>> = {};
    (allTimesheets || []).forEach((t: { username: string; hours: number; overtime_multiplier: number }) => {
      if (!timesheetsByUser[t.username]) timesheetsByUser[t.username] = [];
      timesheetsByUser[t.username].push({ hours: t.hours, overtime_multiplier: t.overtime_multiplier || 1.5 });
    });

    // 6. Calculate payroll for each employee
    const payrollItems: Array<{
      id: string;
      payroll_id: string;
      username: string;
      salary_snapshot: number;
      base_salary: number;
      task_payments: number;
      overtime_amount: number;
      bonus: number;
      commission: number;
      monetary_deductions: number;
      unpaid_leave_deductions: number;
      deductions: number;
      deduction_details: Array<{ type: string; amount: number; reason?: string }>;
      net_pay: number;
      currency: string;
      status: string;
    }> = [];

    const linkedPaymentIds: string[] = [];
    let totalAmount = 0;

    for (const emp of activeEmployees) {
      // Hire-date pro-ration: skip anyone hired AFTER this run month (not yet
      // employed); pro-rate the BASE salary for a partial first month.
      const prorationFactor = hireProrationFactor(emp.hire_date, year, month);
      if (prorationFactor === 0) continue;

      const userPayments = paymentsByUser[emp.username] || [];
      const userTimesheets = timesheetsByUser[emp.username] || [];

      const result = calculatePayrollItem({
        baseSalary: Number(emp.salary) || 0,
        hourlyRate: Number(emp.hourly_rate) || 0,
        payments: userPayments.map(p => ({
          source_type: p.source_type,
          amount: p.amount,
          deduction_cap_exempt_amount: p.deduction_cap_exempt_amount,
        })),
        overtimeTimesheets: userTimesheets.map(t => ({ hours: t.hours, multiplier: t.overtime_multiplier })),
        unpaidLeave: unpaidLeaveByUser[emp.username] || [],
        prorationFactor,
      });

      payrollItems.push({
        id: generateId('pi'),
        payroll_id: id,
        username: emp.username,
        salary_snapshot: Number(emp.salary) || 0,
        base_salary: result.base_salary,
        task_payments: result.task_payments,
        overtime_amount: result.overtime_amount,
        bonus: result.bonus,
        commission: result.commission,
        monetary_deductions: result.monetary_deductions,
        unpaid_leave_deductions: result.unpaid_leave_deductions,
        deductions: result.deductions,
        deduction_details: result.deduction_details,
        net_pay: result.net_pay,
        currency: runCurrency,
        status: 'pending',
      });

      totalAmount += result.net_pay;

      // Track payment IDs to link (consumes ALL of the user's matched payments)
      userPayments.forEach(p => linkedPaymentIds.push(p.id));
    }

    const uniqueLinkedPaymentIds = [...new Set(linkedPaymentIds)];

    const { data: rpcRows, error: rpcError } = await supabase
      .rpc('pyra_commit_payroll_calculation', {
        p_payroll_id: id,
        p_expected_calculated_at: run.calculated_at,
        p_items: payrollItems,
        p_payment_ids: uniqueLinkedPaymentIds,
        p_monthly_cap_percentage: MONTHLY_DEDUCTION_CAP_PERCENT,
      });

    if (rpcError) return failFinancialOperation(rpcError, 'atomic-calculation');
    const result = (Array.isArray(rpcRows) ? rpcRows[0] : rpcRows) as {
      status: string;
      changed: boolean;
      run_data: Record<string, unknown> | null;
      items_data: Array<Record<string, unknown>> | null;
    } | null;

    if (!result) return apiServerError();
    if (result.status === PAYROLL_RPC_STATUS.NOT_FOUND) {
      return apiNotFound(t('payroll.runNotFound'));
    }
    if (result.status === PAYROLL_RPC_STATUS.INVALID_PAYLOAD) {
      return apiError(t('payroll.atomicInvalidPayload'), 422);
    }
    if (result.status === PAYROLL_RPC_STATUS.INVALID_STATUS
      || result.status === PAYROLL_RPC_STATUS.STALE_CALCULATION
      || result.status === PAYROLL_RPC_STATUS.BLOCKED_INPUT) {
      return apiError(t('payroll.atomicConflict'), 409);
    }
    if (result.status !== PAYROLL_RPC_STATUS.OK || !result.run_data) {
      return apiServerError();
    }

    const usersMap = Object.fromEntries(activeEmployees.map((employee) => [
      employee.username,
      { display_name: employee.display_name, department: employee.department },
    ]));
    const enrichedItems = (result.items_data || []).map((item) => ({
      ...item,
      display_name: usersMap[item.username as string]?.display_name || item.username,
      department: usersMap[item.username as string]?.department || null,
    }));

    // Activity log
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.PAYROLL}_${ACTIVITY_ACTIONS.UPDATE}`,
      '/dashboard/payroll',
      { payroll_id: id, total_amount: totalAmount, employee_count: payrollItems.length, source: 'payroll_calculated' },
      req.headers.get('x-forwarded-for') || 'unknown',
    );

    // Build optional warnings array for the caller
    const warnings: string[] = [];
    if (skippedMismatchedPayments > 0) {
      warnings.push(t('payroll.mismatchedCurrencyWarning', { count: skippedMismatchedPayments }));
    }

    return apiSuccess({ ...result.run_data, items: enrichedItems, warnings });
  } catch (err) {
    logError({ error: err, request: req, metadata: { route: 'payroll/calculate' } });
    console.error('POST /api/dashboard/payroll/[id]/calculate error:', err);
    return apiServerError();
  }
}
