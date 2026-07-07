import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { computeProductivityTrends } from '@/lib/production/report';
import { logError } from '@/lib/observability/log-error';

// GET /api/hr/productivity/trends?months=6
// Admin-only production trend report. Gate first, service-role after.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('hr.view');
    if (isApiError(auth)) return auth;

    const monthsParam = request.nextUrl.searchParams.get('months') || '6';
    const months = Number(monthsParam);
    if (!Number.isInteger(months) || months < 2 || months > 12) {
      return apiValidationError('months must be an integer between 2 and 12');
    }

    const supabase = createServiceRoleClient();
    const trends = await computeProductivityTrends(supabase, months);
    return apiSuccess(trends);
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'hr-productivity-trends' } });
    console.error('[GET /api/hr/productivity/trends] error:', err);
    return apiServerError();
  }
}
