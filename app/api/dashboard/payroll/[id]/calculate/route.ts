import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { TIMESHEET_STATUS } from '@/lib/constants/statuses';
import { calculatePayrollItem, hireProrationFactor, leaveOverlapDays } from '@/lib/payroll/calculate-item';
import { logError } from '@/lib/observability/log-error';

type RouteParams = { params: Promise<{ id: string }> };

// =============================================================
// POST /api/dashboard/payroll/[id]/calculate
// Calculate all payroll items for a given run.
// =============================================================
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiPermission('payroll.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // 1. Fetch the payroll run
    const { data: run, error: runError } = await supabase
      .from('pyra_payroll_runs')
      .select('*')
      .eq('id', id)
      .single();

    if (runError || !run) return apiNotFound('مسير الرواتب غير موجود');

    // Verify status is draft or calculated (allow recalculation)
    if (!['draft', 'calculated'].includes(run.status)) {
      return apiError('لا يمكن حساب مسير رواتب بحالة: ' + run.status, 400);
    }

    const { month, year } = run;

    // 2. Backup existing items for rollback, then delete
    const { data: existingItems } = await supabase
      .from('pyra_payroll_items')
      .select('*')
      .eq('payroll_id', id);

    const { data: existingLinkedPayments } = await supabase
      .from('pyra_employee_payments')
      .select('id')
      .eq('payroll_id', id);

    await supabase
      .from('pyra_payroll_items')
      .delete()
      .eq('payroll_id', id);

    await supabase
      .from('pyra_employee_payments')
      .update({ payroll_id: null })
      .eq('payroll_id', id);

    // 3. Fetch all active employees
    // Only ACTIVE employees are paid. Excludes 'inactive' AND 'suspended' —
    // the previous .neq('status','suspended') wrongly paid inactive staff.
    const { data: employees, error: empError } = await supabase
      .from('pyra_users')
      .select('username, display_name, salary, hourly_rate, department, payment_type, employment_type, status, hire_date')
      .eq('status', 'active');

    if (empError) return apiServerError(empError.message);
    if (!employees || employees.length === 0) {
      return apiError('لا يوجد موظفون نشطون', 400);
    }

    // Filter out employees with no meaningful compensation
    const activeEmployees = employees.filter((e: { payment_type: string | null; salary: number | null; hourly_rate: number | null }) =>
      (e.payment_type === 'monthly_salary' && (e.salary || 0) > 0) ||
      (e.payment_type === 'hourly' && (e.hourly_rate || 0) > 0) ||
      e.payment_type === 'per_task' ||
      e.payment_type === 'commission'
    );

    if (activeEmployees.length === 0) {
      return apiError('لا يوجد موظفون بتعويضات فعّالة', 400);
    }

    // Build date range for this month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // 4. Fetch all relevant employee_payments (unlinked, approved)
    const { data: allPayments } = await supabase
      .from('pyra_employee_payments')
      .select('id, username, source_type, amount, status, payroll_id, created_at')
      .eq('status', 'approved')
      .is('payroll_id', null)
      .gte('created_at', startDate + 'T00:00:00')
      .lte('created_at', endDate + 'T23:59:59');

    // 5. Fetch all overtime timesheets for this month
    const { data: allTimesheets } = await supabase
      .from('pyra_timesheets')
      .select('username, hours, is_overtime, overtime_multiplier, status')
      .eq('is_overtime', true)
      .eq('status', TIMESHEET_STATUS.APPROVED)
      .gte('date', startDate)
      .lte('date', endDate);

    // 5b. Fetch approved unpaid leave OVERLAPPING this month (cross-month safe).
    // NOTE: pyra_leave_requests columns are `type` (a NAME string, NOT an id) and
    // `days_count` — there is NO leave_type_id / total_days. The previous code
    // selected the non-existent columns, so PostgREST returned null and NO unpaid
    // leave was EVER deducted. Overlap filter (start <= monthEnd AND end >= monthStart)
    // catches leaves spanning a month boundary.
    const { data: leaveRequests } = await supabase
      .from('pyra_leave_requests')
      .select('username, type, start_date, end_date')
      .eq('status', 'approved')
      .lte('start_date', endDate)
      .gte('end_date', startDate);

    // Resolve which leave TYPE NAMES are unpaid (is_paid=false). `type` matches
    // pyra_leave_types.name (there is no id link on the request).
    const unpaidTypeNames = new Set<string>();
    if (leaveRequests && leaveRequests.length > 0) {
      const typeNames = [
        ...new Set(leaveRequests.map((lr: { type: string | null }) => lr.type).filter(Boolean)),
      ] as string[];
      if (typeNames.length > 0) {
        const { data: types } = await supabase
          .from('pyra_leave_types')
          .select('name, is_paid')
          .in('name', typeNames);
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
        unpaidLeaveByUser[lr.username].push({ days, typeName: 'إجازة غير مدفوعة' });
      }
    }

    // Build lookup maps
    // NOTE: allPayments already includes ALL source_types (task, commission, bonus, deduction, overtime)
    // Do NOT fetch commissions separately — that would double-count them!
    const paymentsByUser: Record<string, Array<{ id: string; source_type: string; amount: number }>> = {};
    const allPaymentsCombined = [...(allPayments || [])];
    allPaymentsCombined.forEach((p: { id: string; username: string; source_type: string; amount: number }) => {
      if (!paymentsByUser[p.username]) paymentsByUser[p.username] = [];
      paymentsByUser[p.username].push({ id: p.id, source_type: p.source_type, amount: p.amount });
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
      base_salary: number;
      task_payments: number;
      overtime_amount: number;
      bonus: number;
      commission: number;
      deductions: number;
      deduction_details: Array<{ type: string; amount: number; reason?: string }>;
      net_pay: number;
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
        payments: userPayments.map(p => ({ source_type: p.source_type, amount: p.amount })),
        overtimeTimesheets: userTimesheets.map(t => ({ hours: t.hours, multiplier: t.overtime_multiplier })),
        unpaidLeave: unpaidLeaveByUser[emp.username] || [],
        prorationFactor,
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

      // Track payment IDs to link (consumes ALL of the user's matched payments)
      userPayments.forEach(p => linkedPaymentIds.push(p.id));
    }

    // 7. Insert all payroll items
    if (payrollItems.length > 0) {
      const { error: insertError } = await supabase
        .from('pyra_payroll_items')
        .insert(payrollItems);

      if (insertError) {
        // Rollback: restore old items
        if (existingItems && existingItems.length > 0) {
          await supabase.from('pyra_payroll_items').insert(existingItems);
        }
        if (existingLinkedPayments && existingLinkedPayments.length > 0) {
          await supabase.from('pyra_employee_payments')
            .update({ payroll_id: id })
            .in('id', existingLinkedPayments.map((p: { id: string }) => p.id));
        }
        return apiServerError(insertError.message);
      }
    }

    // 8. Update the payroll run
    const { data: updatedRun, error: updateError } = await supabase
      .from('pyra_payroll_runs')
      .update({
        total_amount: totalAmount,
        employee_count: payrollItems.length,
        status: 'calculated',
        calculated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      // Rollback: delete new items, restore old
      await supabase.from('pyra_payroll_items').delete().eq('payroll_id', id);
      if (existingItems && existingItems.length > 0) {
        await supabase.from('pyra_payroll_items').insert(existingItems);
      }
      if (existingLinkedPayments && existingLinkedPayments.length > 0) {
        await supabase.from('pyra_employee_payments')
          .update({ payroll_id: id })
          .in('id', existingLinkedPayments.map((p: { id: string }) => p.id));
      }
      return apiServerError(updateError.message);
    }

    // 9. Link employee_payments to this payroll
    if (linkedPaymentIds.length > 0) {
      await supabase
        .from('pyra_employee_payments')
        .update({ payroll_id: id })
        .in('id', linkedPaymentIds);
    }

    // Fetch the newly created items with user info
    const { data: finalItems } = await supabase
      .from('pyra_payroll_items')
      .select('*')
      .eq('payroll_id', id)
      .order('username', { ascending: true });

    // Enrich with display names
    const usernames = (finalItems || []).map((item: { username: string }) => item.username);
    let usersMap: Record<string, { display_name: string; department: string | null }> = {};

    if (usernames.length > 0) {
      const { data: users } = await supabase
        .from('pyra_users')
        .select('username, display_name, department')
        .in('username', usernames);

      if (users) {
        usersMap = Object.fromEntries(
          users.map((u: { username: string; display_name: string; department: string | null }) => [
            u.username,
            { display_name: u.display_name, department: u.department },
          ])
        );
      }
    }

    const enrichedItems = (finalItems || []).map((item: Record<string, unknown>) => ({
      ...item,
      display_name: usersMap[item.username as string]?.display_name || item.username,
      department: usersMap[item.username as string]?.department || null,
    }));

    // Activity log
    const { error: logErr } = await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'payroll_calculated',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: '/dashboard/payroll',
      details: { payroll_id: id, total_amount: totalAmount, employee_count: payrollItems.length },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });
    if (logErr) console.error('Activity log error:', logErr);

    return apiSuccess({ ...updatedRun, items: enrichedItems });
  } catch (err) {
    logError({ error: err, request: req, metadata: { route: 'payroll/calculate' } });
    console.error('POST /api/dashboard/payroll/[id]/calculate error:', err);
    return apiServerError();
  }
}
