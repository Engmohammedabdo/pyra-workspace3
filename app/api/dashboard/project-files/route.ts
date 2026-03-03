import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/dashboard/project-files?file_path=...
 * Look up a project file association by storage path.
 * Returns { project_id, id } if the file belongs to a project, null otherwise.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const filePath = request.nextUrl.searchParams.get('file_path');
    if (!filePath) return apiValidationError('file_path مطلوب');

    const supabase = await createServerSupabaseClient();

    const { data } = await supabase
      .from('pyra_project_files')
      .select('id, project_id')
      .eq('file_path', filePath)
      .limit(1)
      .maybeSingle();

    return apiSuccess(data || null);
  } catch (err) {
    console.error('project-files lookup error:', err);
    return apiServerError();
  }
}
