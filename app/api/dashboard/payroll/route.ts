import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { PAYROLL_STATUS } from '@/lib/constants/statuses';
import { SALARY_CURRENCIES } from '@/lib/constants/auth';

// =============================================================
// GET /api/dashboard/payroll
// List payroll runs, optionally filtered by year.
// Query params: ?year=YYYY
// Gap #3 authz fix: the company-wide run list requires payroll.manage (admin/HR),
// NOT payroll.view (which is BASE_EMPLOYEE) — employees see only their own payslip
// via /api/dashboard/my-payslips. Prevents any employee reading all salaries.
// =============================================================
export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiPermission('payroll.manage');
    if (isApiError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');

    const supabase = createServiceRoleClient(); // pyra_payroll_runs service-role-only (Gap #3 Tier-2)

    let query = supabase
      .from('pyra_payroll_runs')
      .select('*')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(50);

    if (yearParam) {
      const year = parseInt(yearParam, 10);
      if (!isNaN(year)) {
        query = query.eq('year', year);
      }
    }

    const { data, error } = await query;

    if (error) return apiServerError(error.message);
    return apiSuccess(data || []);
  } catch (err) {
    console.error('GET /api/dashboard/payroll error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/dashboard/payroll
// Create a new payroll run.
// Body: { month, year, notes? }
// =============================================================
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('payroll.manage');
    if (isApiError(auth)) return auth;

    const body = await req.json().catch(() => ({}));
    const { month, year, notes, currency: currencyInput } = body;

    // Validate month
    if (!month || !Number.isInteger(month) || month < 1 || month > 12) {
      return apiValidationError('الشهر يجب أن يكون بين 1 و 12');
    }

    // Validate year
    if (!year || !Number.isInteger(year) || year < 2020 || year > 2100) {
      return apiValidationError('السنة غير صالحة');
    }

    // Resolve and validate currency — default to AED when not provided
    const resolvedCurrency: string = currencyInput ?? 'AED';
    if (!(SALARY_CURRENCIES as readonly string[]).includes(resolvedCurrency)) {
      return apiValidationError(`العملة غير صالحة. القيم المسموحة: ${SALARY_CURRENCIES.join('، ')}`);
    }

    const supabase = createServiceRoleClient();

    // Check for duplicate (month, year, currency) — an AED run and an EGP run
    // for the same month can coexist as separate single-currency runs.
    const { data: existing } = await supabase
      .from('pyra_payroll_runs')
      .select('id')
      .eq('month', month)
      .eq('year', year)
      .eq('currency', resolvedCurrency)
      .maybeSingle();

    if (existing) {
      return apiError(`يوجد مسير رواتب بعملة ${resolvedCurrency} لهذا الشهر بالفعل`, 409);
    }

    const id = generateId('pr');

    const { data, error } = await supabase
      .from('pyra_payroll_runs')
      .insert({
        id,
        month,
        year,
        status: PAYROLL_STATUS.DRAFT,
        total_amount: 0,
        currency: resolvedCurrency,
        employee_count: 0,
        notes: notes || null,
        created_by: auth.pyraUser.username,
      })
      .select()
      .single();

    if (error) return apiServerError(error.message);

    // Activity log
    const { error: logErr } = await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'payroll_created',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: '/dashboard/payroll',
      details: { payroll_id: id, month, year, currency: resolvedCurrency },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });
    if (logErr) console.error('Activity log error:', logErr);

    return apiSuccess(data, undefined, 201);
  } catch (err) {
    console.error('POST /api/dashboard/payroll error:', err);
    return apiServerError();
  }
}
