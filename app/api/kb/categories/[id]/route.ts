import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, apiForbidden, apiNotFound, apiServerError } from '@/lib/api/response';
import { generateSlug } from '@/lib/utils/slug';

/**
 * PATCH /api/kb/categories/[id]
 * Update a KB category (admin).
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
    const { name, description, icon, sort_order, is_public } = body;

    const supabase = createServiceRoleClient();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return apiError('اسم التصنيف مطلوب');
      }
      updates.name = name.trim();
      updates.slug = generateSlug(name.trim());
    }
    if (description !== undefined) updates.description = description?.trim() || null;
    if (icon !== undefined) updates.icon = icon || null;
    if (sort_order !== undefined) updates.sort_order = sort_order;
    if (is_public !== undefined) updates.is_public = is_public;

    const { data, error } = await supabase
      .from('pyra_kb_categories')
      .update(updates)
      .eq('id', id)
      .select('id, name, slug, description, icon, sort_order, is_public, created_by, created_at, updated_at')
      .single();

    if (error) {
      console.error('PATCH /api/kb/categories/[id] error:', error);
      if (error.code === 'PGRST116') return apiNotFound('التصنيف غير موجود');
      return apiServerError();
    }

    return apiSuccess(data);
  } catch {
    return apiServerError();
  }
}

/**
 * DELETE /api/kb/categories/[id]
 * Delete a KB category and its articles (admin).
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

    // Delete articles in this category first
    await supabase
      .from('pyra_kb_articles')
      .delete()
      .eq('category_id', id);

    // Delete the category
    const { error } = await supabase
      .from('pyra_kb_categories')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('DELETE /api/kb/categories/[id] error:', error);
      return apiServerError();
    }

    return apiSuccess({ deleted: true });
  } catch {
    return apiServerError();
  }
}
