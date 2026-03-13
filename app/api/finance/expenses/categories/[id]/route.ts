import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { EXPENSE_CATEGORY_FIELDS } from '@/lib/supabase/fields';

// Allowed fields for category update
const ALLOWED_FIELDS = new Set(['name', 'name_en', 'color', 'icon', 'sort_order']);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    const body = await req.json();

    // Whitelist allowed fields
    const safeUpdate: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (ALLOWED_FIELDS.has(key)) safeUpdate[key] = body[key];
    }
    if (Object.keys(safeUpdate).length === 0) {
      return apiError('لا توجد حقول صالحة للتحديث', 400);
    }

    const { data, error } = await supabase
      .from('pyra_expense_categories')
      .update(safeUpdate)
      .eq('id', id)
      .select(EXPENSE_CATEGORY_FIELDS)
      .single();

    if (error || !data) return apiNotFound();
    return apiSuccess(data);
  } catch {
    return apiServerError();
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    // Check if default
    const { data: cat } = await supabase
      .from('pyra_expense_categories')
      .select('is_default')
      .eq('id', id)
      .single();

    if (cat?.is_default) {
      return apiError('لا يمكن حذف تصنيف افتراضي', 422);
    }

    // Check if any expenses use this category
    const { count } = await supabase
      .from('pyra_expenses')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id);

    if (count && count > 0) {
      return apiError(`لا يمكن حذف التصنيف — يوجد ${count} مصروف مرتبط به`, 422);
    }

    const { error } = await supabase
      .from('pyra_expense_categories')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return apiSuccess({ deleted: true });
  } catch {
    return apiServerError();
  }
}
