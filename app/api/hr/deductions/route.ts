import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiError, apiServerError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  loadMonthlyDeductionsReport,
  resolveAdminDeductionsMonth,
} from '@/lib/hr/deductions-report';
import { dubaiDayKey } from '@/lib/utils/format';
import { logError } from '@/lib/observability/log-error';

export async function GET(request: NextRequest) {
  const auth = await requireApiPermission('hr.manage');
  if (isApiError(auth)) return auth;
  try {
    const t = await getTranslations('api');
    const now = new Date();
    const todayKey = dubaiDayKey(now);
    const currentMonth = todayKey.slice(0, 7);
    const month = resolveAdminDeductionsMonth(
      request.nextUrl.searchParams.get('month'),
      currentMonth,
    );
    if (!month) return apiError(t('deductions.invalidMonth'), 400);

    const serviceClient = createServiceRoleClient();
    const report = await loadMonthlyDeductionsReport(serviceClient, {
      month,
      today_key: todayKey,
      current_instant: now.toISOString(),
      include_unattributed: true,
    });
    return apiSuccess(report);
  } catch (error) {
    logError({
      error,
      request,
      metadata: { action: 'hr_deductions_report' },
    });
    return apiServerError();
  }
}
