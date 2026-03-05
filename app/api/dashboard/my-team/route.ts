import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiServerError } from '@/lib/api/response';

// =============================================================
// GET /api/dashboard/my-team
// Return direct reports of the current authenticated user.
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireApiPermission('directory.view');
    if (isApiError(auth)) return auth;

    const currentUsername = auth.pyraUser.username;
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_users')
      .select('username, display_name, email, role, job_title, department, manager_username, avatar_url, status')
      .eq('manager_username', currentUsername)
      .order('display_name', { ascending: true });

    if (error) {
      console.error('GET /api/dashboard/my-team error:', error);
      return apiServerError();
    }

    return apiSuccess(data || []);
  } catch (err) {
    console.error('GET /api/dashboard/my-team error:', err);
    return apiServerError();
  }
}
