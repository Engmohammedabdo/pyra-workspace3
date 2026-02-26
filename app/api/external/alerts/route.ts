import { NextRequest } from 'next/server';
import { getExternalAuth, hasPermission } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { getFinanceAlerts } from '@/lib/finance/alerts';

/**
 * GET /api/external/alerts
 * Smart financial alerts via External API.
 * Auth: API key with 'alerts:read' permission
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getExternalAuth(req);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    if (!hasPermission(ctx, 'alerts:read')) return apiError('لا تملك صلاحية قراءة التنبيهات', 403);

    const result = await getFinanceAlerts();
    return apiSuccess(result);
  } catch {
    return apiServerError();
  }
}
