import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';

// =============================================================
// GET /api/auth/me
// Returns the current authenticated user's profile
// =============================================================
export async function GET() {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    return apiSuccess({
      username: auth.pyraUser.username,
      role: auth.pyraUser.role,
      display_name: auth.pyraUser.display_name,
      permissions: auth.pyraUser.permissions,
    });
  } catch (err) {
    console.error('Auth me GET error:', err);
    return apiServerError();
  }
}
