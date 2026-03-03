import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { hasPermission } from '@/lib/auth/rbac';
import {
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { escapeLike } from '@/lib/utils/path';

// =============================================================
// GET /api/files/search?q=search_term&limit=50&offset=0
// Search files in pyra_file_index — respects user permissions
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const searchParams = request.nextUrl.searchParams;
    const query = (searchParams.get('q') || '').trim();
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!query) {
      return apiValidationError('يجب إدخال كلمة البحث');
    }

    if (query.length < 2) {
      return apiValidationError('كلمة البحث يجب أن تكون حرفين على الأقل');
    }

    const supabase = await createServerSupabaseClient();
    const searchTerm = escapeLike(query.toLowerCase());

    // Determine if user has full access or restricted path access
    const isFullAccess = hasPermission(auth.pyraUser.rolePermissions, '*')
      || auth.pyraUser.role === 'admin';

    // Build the base query
    let dbQuery = supabase
      .from('pyra_file_index')
      .select('*', { count: 'exact' })
      .ilike('file_name_lower', `%${searchTerm}%`);

    // Apply path restrictions for non-admin users
    if (!isFullAccess) {
      const permissions = auth.pyraUser.permissions as Record<string, unknown> | null;
      const allowedPaths: string[] = (permissions as { allowed_paths?: string[] })?.allowed_paths || [];
      const pathKeys = (permissions as { paths?: Record<string, unknown> })?.paths
        ? Object.keys((permissions as { paths: Record<string, unknown> }).paths)
        : [];
      const allPaths = [...new Set([...allowedPaths, ...pathKeys])];

      if (allPaths.length > 0) {
        // Filter to only files under allowed paths
        const pathFilters = allPaths
          .map((p) => `file_path.like.${p}%`)
          .join(',');
        dbQuery = dbQuery.or(pathFilters);
      } else {
        // No paths allowed — return empty result
        return apiSuccess([], { query, total: 0, limit, offset, hasMore: false });
      }
    }

    const { data, error, count } = await dbQuery
      .order('indexed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Search error:', error);
      return apiServerError('فشل في البحث');
    }

    // Transform results to a consistent shape
    const results = (data || []).map((item) => ({
      name: item.file_name,
      path: item.file_path,
      isFolder: item.is_folder,
      size: item.file_size,
      mimeType: item.mime_type,
      parentPath: item.parent_path,
      indexedAt: item.indexed_at,
    }));

    return apiSuccess(results, {
      query,
      total: count || 0,
      limit,
      offset,
      hasMore: (count || 0) > offset + limit,
    });
  } catch (err) {
    console.error('Search GET error:', err);
    return apiServerError();
  }
}
