import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';

const ASSIGNMENT_FIELDS = `id, remote_jid, instance_name, assigned_to, assigned_by, assigned_at, is_pinned, is_archived`;

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/dashboard/sales/whatsapp/assignments/[id]
 * Update assignment (reassign, pin, archive).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireApiPermission('sales_whatsapp.view');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;
  if (body.is_pinned !== undefined) updates.is_pinned = body.is_pinned;
  if (body.is_archived !== undefined) updates.is_archived = body.is_archived;

  if (Object.keys(updates).length === 0) {
    return apiError('لا توجد حقول للتحديث');
  }

  const { data, error } = await supabase
    .from('pyra_whatsapp_assignments')
    .update(updates)
    .eq('id', id)
    .select(ASSIGNMENT_FIELDS)
    .single();

  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

/**
 * DELETE /api/dashboard/sales/whatsapp/assignments/[id]
 * Remove assignment. Admin only.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireApiPermission('sales_pipeline.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from('pyra_whatsapp_assignments')
    .delete()
    .eq('id', id);

  if (error) return apiServerError(error.message);
  return apiSuccess({ deleted: true });
}
