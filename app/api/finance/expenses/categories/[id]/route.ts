import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiError, apiForbidden, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { EXPENSE_CATEGORY_FIELDS } from '@/lib/supabase/fields';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    const body = await req.json();
    const { data, error } = await supabase
      .from('pyra_expense_categories')
      .update(body)
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
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

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
