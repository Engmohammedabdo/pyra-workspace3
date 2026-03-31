import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// GET — list all business entities
export async function GET() {
  const auth = await requireApiPermission('settings.view');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('pyra_business_entities')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at');

  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

// POST — create a new entity
export async function POST(req: NextRequest) {
  const auth = await requireApiPermission('settings.manage');
  if (isApiError(auth)) return auth;

  const body = await req.json();
  const { name_en, name_ar, license_no, logo_url, is_default } = body;

  if (!name_en || !name_ar) return apiValidationError('الاسم بالعربي والإنجليزي مطلوب');

  const supabase = createServiceRoleClient();

  // If setting as default, unset others
  if (is_default) {
    await supabase.from('pyra_business_entities').update({ is_default: false }).neq('id', 'none');
  }

  const { data, error } = await supabase
    .from('pyra_business_entities')
    .insert({
      id: generateId('ent'),
      name_en,
      name_ar,
      license_no: license_no || null,
      logo_url: logo_url || null,
      is_default: is_default || false,
    })
    .select()
    .single();

  if (error) return apiServerError(error.message);
  return apiSuccess(data, undefined, 201);
}

// PATCH — update entity (body must include `id`)
export async function PATCH(req: NextRequest) {
  const auth = await requireApiPermission('settings.manage');
  if (isApiError(auth)) return auth;

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return apiValidationError('ID مطلوب');

  const supabase = createServiceRoleClient();

  // If setting as default, unset others first
  if (updates.is_default) {
    await supabase.from('pyra_business_entities').update({ is_default: false }).neq('id', id);
  }

  const { data, error } = await supabase
    .from('pyra_business_entities')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

// DELETE — remove entity
export async function DELETE(req: NextRequest) {
  const auth = await requireApiPermission('settings.manage');
  if (isApiError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return apiValidationError('ID مطلوب');

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from('pyra_business_entities').delete().eq('id', id);
  if (error) return apiServerError(error.message);
  return apiSuccess({ deleted: id });
}
