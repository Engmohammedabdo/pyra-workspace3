import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, apiForbidden, apiServerError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';
import { generateSlug } from '@/lib/utils/slug';

const ARTICLE_FIELDS = 'id, category_id, title, slug, excerpt, is_public, sort_order, view_count, author, author_display_name, created_at, updated_at';

/**
 * GET /api/kb/articles
 * List KB articles with optional filters (admin).
 * Query params: category_id, search, page, limit
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const sp = request.nextUrl.searchParams;
    const categoryId = sp.get('category_id')?.trim() || '';
    const search = sp.get('search')?.trim() || '';
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    const supabase = createServiceRoleClient();

    let query = supabase
      .from('pyra_kb_articles')
      .select(ARTICLE_FIELDS, { count: 'exact' })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    if (search) {
      query = query.ilike('title', `%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('GET /api/kb/articles error:', error);
      return apiServerError();
    }

    return apiSuccess(data || [], { total: count || 0, page, limit });
  } catch {
    return apiServerError();
  }
}

/**
 * POST /api/kb/articles
 * Create a new KB article (admin).
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const body = await request.json();
    const { category_id, title, content, excerpt, is_public, sort_order } = body;

    if (!category_id || typeof category_id !== 'string') {
      return apiError('التصنيف مطلوب');
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
      return apiError('عنوان المقالة مطلوب');
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      return apiError('محتوى المقالة مطلوب');
    }

    const supabase = createServiceRoleClient();
    const id = generateId('ka');
    const slug = generateSlug(title.trim());

    const { data, error } = await supabase
      .from('pyra_kb_articles')
      .insert({
        id,
        category_id,
        title: title.trim(),
        slug,
        content: content.trim(),
        excerpt: excerpt?.trim() || null,
        is_public: is_public ?? true,
        sort_order: sort_order ?? 0,
        view_count: 0,
        author: admin.pyraUser.username,
        author_display_name: admin.pyraUser.display_name,
      })
      .select('id, category_id, title, slug, excerpt, is_public, sort_order, view_count, author, author_display_name, created_at, updated_at')
      .single();

    if (error) {
      console.error('POST /api/kb/articles error:', error);
      return apiServerError();
    }

    return apiSuccess(data, undefined, 201);
  } catch {
    return apiServerError();
  }
}
