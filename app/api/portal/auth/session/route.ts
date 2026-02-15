import { getPortalSession } from '@/lib/portal/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';

/**
 * GET /api/portal/auth/session
 *
 * Check the current portal session.
 * Returns client data if authenticated, or 401 if not.
 */
export async function GET() {
  try {
    const client = await getPortalSession();

    if (!client) {
      return apiError('غير مصرح — يجب تسجيل الدخول', 401, {
        authenticated: false,
      });
    }

    return apiSuccess({
      authenticated: true,
      client,
    });
  } catch (err) {
    console.error('GET /api/portal/auth/session error:', err);
    return apiServerError();
  }
}
