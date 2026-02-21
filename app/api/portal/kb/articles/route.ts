import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';

/**
 * GET /api/portal/kb/articles
 * List public KB articles for portal users.
 * Query params: category_id, search
 */
export async function GET(request: NextRequest) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const sp = request.nextUrl.searchParams;
    const categoryId = sp.get('category_id')?.trim() || '';
    const search = sp.get('search')?.trim() || '';

    const supabase = createServiceRoleClient();

    let query = supabase
      .from('pyra_kb_articles')
      .select('id, category_id, title, slug, excerpt, view_count, author_display_name, created_at')
      .eq('is_public', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(100);

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    if (search) {
      query = query.ilike('title', `%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('GET /api/portal/kb/articles error:', error);
      return apiServerError();
    }

    return apiSuccess(data || []);
  } catch {
    return apiServerError();
  }
}
