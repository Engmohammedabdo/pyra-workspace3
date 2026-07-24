import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiError, apiServerError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadMonthlyDeductionsReport } from '@/lib/hr/deductions-report';
import { dubaiDayKey } from '@/lib/utils/format';
import { logError } from '@/lib/observability/log-error';

export async function GET(request: NextRequest) {
  const auth = await requireApiPermission('payroll.view');
  if (isApiError(auth)) return auth;
  try {
    const t = await getTranslations('api');
    if (auth.pyraUser.role !== 'employee') {
      return apiError(t('deductions.employeeOnly'), 403);
    }

    const now = new Date();
    const todayKey = dubaiDayKey(now);
    const month = todayKey.slice(0, 7);
    const serviceClient = createServiceRoleClient();
    const report = await loadMonthlyDeductionsReport(serviceClient, {
      month,
      today_key: todayKey,
      current_instant: now.toISOString(),
      usernames: [auth.pyraUser.username],
    });
    const employee = report.employees.find(
      (row) => row.username === auth.pyraUser.username,
    );
    if (!employee) return apiError(t('deductions.employeeNotFound'), 404);

    return apiSuccess({
      month: report.month,
      as_of_date: report.as_of_date,
      generated_at: report.generated_at,
      employee,
    });
  } catch (error) {
    logError({
      error,
      request,
      metadata: { action: 'employee_deductions_report' },
    });
    return apiServerError();
  }
}
