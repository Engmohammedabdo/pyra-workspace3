import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { getFinanceAlerts } from '@/lib/finance/alerts';

/**
 * GET /api/finance/alerts
 * Smart financial alerts aggregated from multiple sources.
 * Admin only.
 */
export async function GET() {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  try {
    const result = await getFinanceAlerts();
    return apiSuccess(result);
  } catch (err) {
    console.error('GET /api/finance/alerts error:', err);
    return apiServerError();
  }
}
