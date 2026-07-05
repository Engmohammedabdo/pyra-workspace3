import { getTranslations } from 'next-intl/server';
import { getPortalSession } from '@/lib/portal/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';

/**
 * GET /api/portal/auth/session
 *
 * Check the current portal session.
 * Returns client data if authenticated, or 401 if not.
 */
export async function GET() {
  const t = await getTranslations('auth.api');

  try {
    const client = await getPortalSession();

    if (!client) {
      return apiError(t('unauthorized'), 401, {
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
