import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiNotFound, apiServerError } from '@/lib/api/response';
import { SALES_LABEL_FIELDS } from '@/lib/supabase/fields';
import { generateId } from '@/lib/utils/id';
import { logActivity } from '@/lib/api/activity';

export async function GET() {
  try {
    const auth = await requireApiPermission('sales.view');
    if (isApiError(auth)) return auth;

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('pyra_sales_labels')
      .select(SALES_LABEL_FIELDS)
      .order('created_at');

    if (error) return apiServerError(error.message);
    return apiSuccess(data);

  } catch (err) {
    console.error('[GET /api/dashboard/sales/labels] error:', err);
    return apiServerError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales.manage');
    if (isApiError(auth)) return auth;

    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const { name, name_ar, color } = body;
    if (!name) return apiError('اسم التصنيف مطلوب');

    const { data, error } = await supabase
      .from('pyra_sales_labels')
      .insert({
        id: generateId('lb'),
        name,
        name_ar: name_ar || null,
        color: color || 'gray',
        created_by: auth.pyraUser.username,
      })
      .select(SALES_LABEL_FIELDS)
      .single();

    if (error) return apiServerError(error.message);
  
    logActivity(auth.pyraUser.username, auth.pyraUser.display_name, 'sales_label_created', '/dashboard/sales/leads', { name: body.name });

  return apiSuccess(data, undefined, 201);

  } catch (err) {
    console.error('[POST /api/dashboard/sales/labels] error:', err);
    return apiServerError();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales.manage');
    if (isApiError(auth)) return auth;

    const supabase = await createServerSupabaseClient();
    const body = await request.json();
    const { id, name, name_ar, color } = body;

    if (!id) return apiError('معرّف التصنيف مطلوب');

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (name_ar !== undefined) updates.name_ar = name_ar;
    if (color !== undefined) updates.color = color;

    const { data, error } = await supabase
      .from('pyra_sales_labels')
      .update(updates)
      .eq('id', id)
      .select(SALES_LABEL_FIELDS)
      .single();

    if (error) return apiServerError(error.message);
    if (!data) return apiNotFound('التصنيف غير موجود');
    return apiSuccess(data);

  } catch (err) {
    console.error('[PATCH /api/dashboard/sales/labels] error:', err);
    return apiServerError();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales.manage');
    if (isApiError(auth)) return auth;

    const supabase = await createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return apiError('معرّف التصنيف مطلوب');

    const { error } = await supabase
      .from('pyra_sales_labels')
      .delete()
      .eq('id', id);

    if (error) return apiServerError(error.message);
    return apiSuccess({ deleted: true });

  } catch (err) {
    console.error('[DELETE /api/dashboard/sales/labels] error:', err);
    return apiServerError();
  }
}
