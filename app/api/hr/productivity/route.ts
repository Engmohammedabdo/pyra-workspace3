import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { computeProductivity } from '@/lib/production/report';
import { dubaiDayKey } from '@/lib/utils/format';
import { logError } from '@/lib/observability/log-error';

// =============================================================
// GET /api/hr/productivity?month=YYYY-MM
// Admin productivity report (all production employees).
// Gate-then-service-role (HR aggregator pattern).
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('hr.view');
    if (isApiError(auth)) return auth;

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || dubaiDayKey().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return apiValidationError('صيغة الشهر غير صحيحة — المطلوب YYYY-MM');
    }

    const supabase = createServiceRoleClient();
    const report = await computeProductivity(supabase, month);
    return apiSuccess(report);
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'hr-productivity-report' } });
    console.error('[GET /api/hr/productivity] error:', err);
    return apiServerError();
  }
}
