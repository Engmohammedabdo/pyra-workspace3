import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type RouteParams = { params: Promise<{ id: string }> };

// =============================================================
// GET /api/dashboard/payroll/[id]/payslip?username=X
// Get payslip data for a specific employee in a payroll run.
// =============================================================
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiPermission('payroll.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return apiValidationError('اسم المستخدم مطلوب');
    }

    const supabase = await createServerSupabaseClient();

    // Fetch the payroll run
    const { data: run, error: runError } = await supabase
      .from('pyra_payroll_runs')
      .select('*')
      .eq('id', id)
      .single();

    if (runError || !run) return apiNotFound('مسير الرواتب غير موجود');

    // Fetch the payroll item for this user
    const { data: item, error: itemError } = await supabase
      .from('pyra_payroll_items')
      .select('*')
      .eq('payroll_id', id)
      .eq('username', username)
      .single();

    if (itemError || !item) return apiNotFound('كشف الراتب غير موجود لهذا الموظف');

    // Fetch user info
    const { data: user } = await supabase
      .from('pyra_users')
      .select('username, display_name, department, employment_type, payment_type')
      .eq('username', username)
      .single();

    return apiSuccess({
      payroll: {
        id: run.id,
        month: run.month,
        year: run.year,
        status: run.status,
        currency: run.currency,
      },
      employee: {
        username: user?.username || username,
        display_name: user?.display_name || username,
        department: user?.department || null,
        employment_type: user?.employment_type || null,
        payment_type: user?.payment_type || null,
      },
      item: {
        base_salary: item.base_salary,
        task_payments: item.task_payments,
        overtime_amount: item.overtime_amount,
        bonus: item.bonus,
        deductions: item.deductions,
        deduction_details: item.deduction_details,
        net_pay: item.net_pay,
        status: item.status,
      },
      company_name: 'Pyra Workspace',
    });
  } catch (err) {
    console.error('GET /api/dashboard/payroll/[id]/payslip error:', err);
    return apiServerError();
  }
}
