import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiNotFound, apiServerError } from '@/lib/api/response';
import { SALES_LABEL_FIELDS } from '@/lib/supabase/fields';
import { generateId } from '@/lib/utils/id';

export async function GET() {
  const auth = await requireApiPermission('sales.view');
  if (isApiError(auth)) return auth;

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('pyra_sales_labels')
    .select(SALES_LABEL_FIELDS)
    .order('created_at');

  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

export async function POST(request: NextRequest) {
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
  return apiSuccess(data, undefined, 201);
}

export async function PATCH(request: NextRequest) {
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
}

export async function DELETE(request: NextRequest) {
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
}
