import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiUnauthorized, apiNotFound, apiServerError } from '@/lib/api/response';

/**
 * GET /api/portal/kb/articles/[id]
 * Get a single public KB article and increment view_count.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // Fetch article — only if public
    const { data, error } = await supabase
      .from('pyra_kb_articles')
      .select('id, category_id, title, slug, content, excerpt, view_count, author_display_name, created_at, updated_at')
      .eq('id', id)
      .eq('is_public', true)
      .single();

    if (error || !data) {
      if (error?.code === 'PGRST116' || !data) return apiNotFound('المقالة غير موجودة');
      console.error('GET /api/portal/kb/articles/[id] error:', error);
      return apiServerError();
    }

    // Increment view_count (fire-and-forget)
    supabase
      .from('pyra_kb_articles')
      .update({ view_count: (data.view_count || 0) + 1 })
      .eq('id', id)
      .then();

    return apiSuccess(data);
  } catch {
    return apiServerError();
  }
}
