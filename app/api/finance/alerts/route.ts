import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';
import { getFinanceAlerts } from '@/lib/finance/alerts';

/**
 * GET /api/finance/alerts
 * Smart financial alerts aggregated from multiple sources.
 * Admin only.
 */
export async function GET() {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  try {
    const result = await getFinanceAlerts();
    return apiSuccess(result);
  } catch (err) {
    console.error('GET /api/finance/alerts error:', err);
    return apiServerError();
  }
}
