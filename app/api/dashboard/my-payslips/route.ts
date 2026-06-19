import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/dashboard/my-payslips
// Fetch payroll items for the current user, joined with run info.
// =============================================================
export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiPermission('payroll.view');
    if (isApiError(auth)) return auth;

    const username = auth.pyraUser.username;
    // Service role: pyra_payroll_items + pyra_employee_payments are locked to
    // service-role-only (audit Gap #3 Tier-2). Self-scope preserved by the
    // .eq('username', username) below — switch is scope-neutral (RLS is off).
    const supabase = createServiceRoleClient();

    // Fetch payroll items for this user
    const { data: items, error } = await supabase
      .from('pyra_payroll_items')
      .select('*, pyra_payroll_runs!inner(id, month, year, status, currency, paid_at)')
      .eq('username', username)
      .order('created_at', { ascending: false });

    if (error) return apiServerError(error.message);

    // Flatten the joined data
    const payslips = (items || []).map((item: Record<string, unknown>) => {
      const run = item.pyra_payroll_runs as Record<string, unknown> | null;
      return {
        id: item.id,
        payroll_id: item.payroll_id,
        username: item.username,
        base_salary: item.base_salary,
        task_payments: item.task_payments,
        overtime_amount: item.overtime_amount,
        bonus: item.bonus,
        deductions: item.deductions,
        deduction_details: item.deduction_details,
        net_pay: item.net_pay,
        status: item.status,
        month: run?.month,
        year: run?.year,
        run_status: run?.status,
        currency: run?.currency || 'AED',
        paid_at: run?.paid_at,
      };
    });

    // Also fetch employee_payments (commissions, task payments, bonuses, etc.)
    const { data: payments } = await supabase
      .from('pyra_employee_payments')
      .select('*')
      .eq('username', username)
      .order('created_at', { ascending: false });

    return apiSuccess({ payslips, payments: payments || [] });
  } catch (err) {
    console.error('GET /api/dashboard/my-payslips error:', err);
    return apiServerError();
  }
}
