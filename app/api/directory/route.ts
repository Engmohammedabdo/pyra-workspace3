import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  const auth = await requireApiPermission('directory.view');
  if (isApiError(auth)) return auth;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('pyra_users')
    .select('id, username, display_name, email, role, role_id, phone, job_title, avatar_url, bio, status, created_at, manager_username, employment_type, work_location, department, pyra_roles!left(name, name_ar, color, icon)')
    .neq('status', 'suspended')
    .order('display_name');

  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}
