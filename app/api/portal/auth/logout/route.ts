import { destroyPortalSession } from '@/lib/portal/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';

/**
 * POST /api/portal/auth/logout
 *
 * Destroy the portal session cookie and remove the session record.
 */
export async function POST() {
  try {
    await destroyPortalSession();

    return apiSuccess({
      authenticated: false,
      message: 'تم تسجيل الخروج بنجاح',
    });
  } catch (err) {
    console.error('POST /api/portal/auth/logout error:', err);
    return apiServerError();
  }
}
