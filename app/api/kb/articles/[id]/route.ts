import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiForbidden, apiNotFound, apiServerError } from '@/lib/api/response';
import { generateSlug } from '@/lib/utils/slug';

const ARTICLE_FULL_FIELDS = 'id, category_id, title, slug, content, excerpt, is_public, sort_order, view_count, author, author_display_name, created_at, updated_at';

/**
 * GET /api/kb/articles/[id]
 * Get a single KB article with full content (admin).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_kb_articles')
      .select(ARTICLE_FULL_FIELDS)
      .eq('id', id)
      .single();

    if (error) {
      console.error('GET /api/kb/articles/[id] error:', error);
      if (error.code === 'PGRST116') return apiNotFound('المقالة غير موجودة');
      return apiServerError();
    }

    return apiSuccess(data);
  } catch {
    return apiServerError();
  }
}

/**
 * PATCH /api/kb/articles/[id]
 * Update a KB article (admin).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await params;
    const body = await request.json();
    const { category_id, title, content, excerpt, is_public, sort_order } = body;

    const supabase = createServiceRoleClient();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (category_id !== undefined) updates.category_id = category_id;
    if (title !== undefined) {
      updates.title = title.trim();
      updates.slug = generateSlug(title.trim());
    }
    if (content !== undefined) updates.content = content.trim();
    if (excerpt !== undefined) updates.excerpt = excerpt?.trim() || null;
    if (is_public !== undefined) updates.is_public = is_public;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    const { data, error } = await supabase
      .from('pyra_kb_articles')
      .update(updates)
      .eq('id', id)
      .select(ARTICLE_FULL_FIELDS)
      .single();

    if (error) {
      console.error('PATCH /api/kb/articles/[id] error:', error);
      if (error.code === 'PGRST116') return apiNotFound('المقالة غير موجودة');
      return apiServerError();
    }

    return apiSuccess(data);
  } catch {
    return apiServerError();
  }
}

/**
 * DELETE /api/kb/articles/[id]
 * Delete a KB article (admin).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from('pyra_kb_articles')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('DELETE /api/kb/articles/[id] error:', error);
      return apiServerError();
    }

    return apiSuccess({ deleted: true });
  } catch {
    return apiServerError();
  }
}
