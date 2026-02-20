import { getPortalSession } from '@/lib/portal/auth';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';

/**
 * GET /api/portal/me
 *
 * Return the current authenticated portal client's basic info.
 * Used by client-side components that need company/name for authorization checks.
 */
export async function GET() {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    return apiSuccess({
      id: client.id,
      name: client.name,
      email: client.email,
      company: client.company,
    });
  } catch (err) {
    console.error('GET /api/portal/me error:', err);
    return apiServerError();
  }
}
