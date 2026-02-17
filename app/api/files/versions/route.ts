import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isPathSafe } from '@/lib/utils/path';

export const dynamic = 'force-dynamic';

// =============================================================
// GET /api/files/versions?file_path=...
// List all versions for a given file path
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const filePath = request.nextUrl.searchParams.get('file_path');
    if (!filePath || !isPathSafe(filePath)) {
      return apiValidationError('مسار الملف غير صالح');
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
