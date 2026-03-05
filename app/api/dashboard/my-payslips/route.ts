import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/dashboard/my-payslips
// Fetch payroll items for the current user, joined with run info.
// =============================================================
export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiPermission('payroll.view');
    if (isApiError(auth)) return auth;

    const username = auth.pyraUser.username;
    const supabase = await createServerSupabaseClient();

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

    return apiSuccess(payslips);
  } catch (err) {
    console.error('GET /api/dashboard/my-payslips error:', err);
    return apiServerError();
  }
}
