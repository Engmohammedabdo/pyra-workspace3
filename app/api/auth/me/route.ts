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
      role_id: auth.pyraUser.role_id,
      display_name: auth.pyraUser.display_name,
      permissions: auth.pyraUser.permissions,
      rolePermissions: auth.pyraUser.rolePermissions,
      role_name_ar: auth.pyraUser.role_name_ar ?? (auth.pyraUser.role === 'admin' ? 'مسؤول' : 'موظف'),
      role_color: auth.pyraUser.role_color ?? 'gray',
      role_icon: auth.pyraUser.role_icon ?? 'Shield',
    });
  } catch (err) {
    console.error('Auth me GET error:', err);
    return apiServerError();
  }
}
