import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, apiUnauthorized, apiServerError } from '@/lib/api/response';

/**
 * GET /api/portal/kb/search?q=...
 * Search public KB articles by title and content (ilike).
 */
export async function GET(request: NextRequest) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const q = request.nextUrl.searchParams.get('q')?.trim() || '';
    if (!q) {
      return apiError('مصطلح البحث مطلوب');
    }

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_kb_articles')
      .select('id, category_id, title, slug, excerpt, view_count, author_display_name, created_at')
      .eq('is_public', true)
      .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
      .order('view_count', { ascending: false })
      .limit(30);

    if (error) {
      console.error('GET /api/portal/kb/search error:', error);
      return apiServerError();
    }

    return apiSuccess(data || []);
  } catch {
    return apiServerError();
  }
}
