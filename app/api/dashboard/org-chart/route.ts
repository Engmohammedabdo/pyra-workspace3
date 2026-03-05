import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiServerError } from '@/lib/api/response';

// =============================================================
// GET /api/dashboard/org-chart
// Return all active users with manager_username to build an org tree.
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireApiPermission('directory.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_users')
      .select('username, display_name, email, role, job_title, department, manager_username, avatar_url')
      .or('status.neq.inactive,status.is.null')
      .order('display_name', { ascending: true });

    if (error) {
      console.error('GET /api/dashboard/org-chart error:', error);
      return apiServerError();
    }

    return apiSuccess(data || []);
  } catch (err) {
    console.error('GET /api/dashboard/org-chart error:', err);
    return apiServerError();
  }
}
