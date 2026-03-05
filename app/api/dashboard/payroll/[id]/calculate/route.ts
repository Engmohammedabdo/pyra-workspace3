import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

type RouteParams = { params: Promise<{ id: string }> };

// =============================================================
// POST /api/dashboard/payroll/[id]/calculate
// Calculate all payroll items for a given run.
// =============================================================
export async function POST(_req: NextRequest, { params }: RouteParams) {
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

    // 2. Delete any existing items for this payroll_id
    await supabase
      .from('pyra_payroll_items')
      .delete()
      .eq('payroll_id', id);

    // Also unlink any previously linked employee_payments
    await supabase
      .from('pyra_employee_payments')
      .update({ payroll_id: null })
      .eq('payroll_id', id);

    // 3. Fetch all active employees
    const { data: employees, error: empError } = await supabase
      .from('pyra_users')
      .select('username, display_name, salary, hourly_rate, department, payment_type, employment_type, status')
      .neq('status', 'suspended');

    if (empError) return apiServerError(empError.message);
    if (!employees || employees.length === 0) {
      return apiError('لا يوجد موظفون نشطون', 400);
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
      .select('username, hours, is_overtime, overtime_multiplier')
      .eq('is_overtime', true)
      .gte('date', startDate)
      .lte('date', endDate);

    // Build lookup maps
    const paymentsByUser: Record<string, Array<{ id: string; source_type: string; amount: number }>> = {};
    (allPayments || []).forEach((p: { id: string; username: string; source_type: string; amount: number }) => {
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
      deductions: number;
      deduction_details: Array<{ type: string; amount: number }>;
      net_pay: number;
      status: string;
    }> = [];

    const linkedPaymentIds: string[] = [];
    let totalAmount = 0;

    for (const emp of employees) {
      const baseSalary = Number(emp.salary) || 0;
      const hourlyRate = Number(emp.hourly_rate) || 0;
      const userPayments = paymentsByUser[emp.username] || [];
      const userTimesheets = timesheetsByUser[emp.username] || [];

      // Task payments
      const taskPayments = userPayments
        .filter(p => p.source_type === 'task')
        .reduce((sum, p) => sum + Number(p.amount), 0);

      // Overtime
      const overtimeAmount = userTimesheets
        .reduce((sum, t) => sum + (Number(t.hours) * hourlyRate * Number(t.overtime_multiplier)), 0);

      // Bonus
      const bonus = userPayments
        .filter(p => p.source_type === 'bonus')
        .reduce((sum, p) => sum + Number(p.amount), 0);

      // Deductions
      const deductionPayments = userPayments.filter(p => p.source_type === 'deduction');
      const deductions = deductionPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const deductionDetails = deductionPayments.map(p => ({
        type: 'deduction',
        amount: Number(p.amount),
      }));

      // Net pay
      const netPay = baseSalary + taskPayments + overtimeAmount + bonus - deductions;

      payrollItems.push({
        id: generateId('pi'),
        payroll_id: id,
        username: emp.username,
        base_salary: baseSalary,
        task_payments: taskPayments,
        overtime_amount: overtimeAmount,
        bonus,
        deductions,
        deduction_details: deductionDetails,
        net_pay: netPay,
        status: 'pending',
      });

      totalAmount += netPay;

      // Track payment IDs to link
      userPayments.forEach(p => linkedPaymentIds.push(p.id));
    }

    // 7. Insert all payroll items
    if (payrollItems.length > 0) {
      const { error: insertError } = await supabase
        .from('pyra_payroll_items')
        .insert(payrollItems);

      if (insertError) return apiServerError(insertError.message);
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

    if (updateError) return apiServerError(updateError.message);

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

    return apiSuccess({ ...updatedRun, items: enrichedItems });
  } catch (err) {
    console.error('POST /api/dashboard/payroll/[id]/calculate error:', err);
    return apiServerError();
  }
}
