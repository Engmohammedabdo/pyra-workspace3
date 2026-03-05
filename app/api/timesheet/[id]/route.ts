import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiError, apiUnauthorized } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/auth/rbac';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const { id } = await params;
  const body = await req.json();

  const supabase = await createServerSupabaseClient();

  // Check if user owns this entry or has manage permission
  const { data: existing } = await supabase.from('pyra_timesheets').select('username, status').eq('id', id).single();
  if (!existing) return apiNotFound('السجل غير موجود');

  const canManage = hasPermission(auth.pyraUser.rolePermissions, 'timesheet.manage');
  const isOwner = existing.username === auth.pyraUser.username;

  if (!isOwner && !canManage) return apiError('غير مصرح', 403);

  // Owners can only edit draft entries
  if (isOwner && !canManage && existing.status !== 'draft') {
    return apiError('لا يمكن تعديل سجل تم إرساله', 400);
  }

  const allowed = ['project_id', 'task_id', 'date', 'hours', 'description', 'status'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  // Handle approval
  if (body.status === 'approved' || body.status === 'rejected') {
    if (!hasPermission(auth.pyraUser.rolePermissions, 'timesheet.approve')) {
      return apiError('غير مصرح بالاعتماد', 403);
    }
    // Prevent self-approval
    if (body.status === 'approved' && existing.username === auth.pyraUser.username) {
      return apiError('لا يمكنك اعتماد إدخالاتك الخاصة', 403);
    }
    updates.approved_by = auth.pyraUser.username;
    updates.approved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('pyra_timesheets')
    .update(updates)
    .eq('id', id)
    .select('*, pyra_projects!left(id, name)')
    .single();

  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase.from('pyra_timesheets').select('username, status').eq('id', id).single();
  if (!existing) return apiNotFound('السجل غير موجود');

  const canManage = hasPermission(auth.pyraUser.rolePermissions, 'timesheet.manage');
  const isOwner = existing.username === auth.pyraUser.username;

  if (!isOwner && !canManage) return apiError('غير مصرح', 403);
  if (isOwner && existing.status !== 'draft') return apiError('لا يمكن حذف سجل تم إرساله', 400);

  const { error } = await supabase.from('pyra_timesheets').delete().eq('id', id);
  if (error) return apiServerError(error.message);
  return apiSuccess({ deleted: true });
}
