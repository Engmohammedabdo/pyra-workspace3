import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isPathSafe } from '@/lib/utils/path';
import { canAccessPath } from '@/lib/auth/file-access';

export const dynamic = 'force-dynamic';

// =============================================================
// GET /api/files/versions?file_path=...
// List all versions for a given file path
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiPermission('files.view');
    if (isApiError(authResult)) return authResult;
    const auth = authResult;

    const filePath = request.nextUrl.searchParams.get('file_path');
    if (!filePath || !isPathSafe(filePath)) {
      return apiValidationError('مسار الملف غير صالح');
    }

    // Path-based access control
    if (!(await canAccessPath(auth, filePath))) {
      return apiForbidden();
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('pyra_file_versions')
      .select('*')
      .eq('file_path', filePath)
      .order('version_number', { ascending: false });

    if (error) {
      console.error('Versions list error:', error);
      return apiServerError();
    }

    return apiSuccess(data || []);
  } catch (err) {
    console.error('GET /api/files/versions error:', err);
    return apiServerError();
  }
}
