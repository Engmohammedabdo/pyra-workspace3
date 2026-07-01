import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiError, apiUnauthorized } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/auth/rbac';
import { generateId } from '@/lib/utils/id';
import { TIMESHEET_STATUS } from '@/lib/constants/statuses';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await params;
    const body = await req.json();

    // Gate-then-service-role (Gap #3 Phase 5): auth already checked above;
    // service-role bypasses RLS — ownership scope enforced explicitly below.
    const supabase = createServiceRoleClient();

    // Check if user owns this entry or has manage permission
    const { data: existing } = await supabase.from('pyra_timesheets').select('username, status').eq('id', id).single();
    if (!existing) return apiNotFound('السجل غير موجود');

    const canManage = hasPermission(auth.pyraUser.rolePermissions, 'timesheet.manage');
    const isOwner = existing.username === auth.pyraUser.username;

    if (!isOwner && !canManage) return apiError('غير مصرح', 403);

    // Owners can only edit draft entries
    if (isOwner && !canManage && existing.status !== TIMESHEET_STATUS.DRAFT) {
      return apiError('لا يمكن تعديل سجل تم إرساله', 400);
    }

    const allowed = ['project_id', 'task_id', 'date', 'hours', 'description', 'status', 'is_billable', 'billing_rate'];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    // Handle approval
    if (body.status === TIMESHEET_STATUS.APPROVED || body.status === TIMESHEET_STATUS.REJECTED) {
      if (!hasPermission(auth.pyraUser.rolePermissions, 'timesheet.approve')) {
        return apiError('غير مصرح بالاعتماد', 403);
      }
      // Prevent self-approval
      if (body.status === TIMESHEET_STATUS.APPROVED && existing.username === auth.pyraUser.username) {
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

    // Activity log (reuse the already-service-role supabase client)
    const { error: logErr } = await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'timesheet_entry_updated',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: '/dashboard/timesheet',
      details: { entry_id: id },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });
    if (logErr) console.error('Activity log error:', logErr);

    return apiSuccess(data);

  } catch (err) {
    console.error('[PATCH /api/timesheet/[id]] error:', err);
    return apiServerError();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await params;

    // Gate-then-service-role (Gap #3 Phase 5): auth already checked above;
    // service-role bypasses RLS — ownership scope enforced explicitly below.
    const supabase = createServiceRoleClient();

    const { data: existing } = await supabase.from('pyra_timesheets').select('username, status').eq('id', id).single();
    if (!existing) return apiNotFound('السجل غير موجود');

    const canManage = hasPermission(auth.pyraUser.rolePermissions, 'timesheet.manage');
    const isOwner = existing.username === auth.pyraUser.username;

    if (!isOwner && !canManage) return apiError('غير مصرح', 403);
    if (isOwner && existing.status !== TIMESHEET_STATUS.DRAFT) return apiError('لا يمكن حذف سجل تم إرساله', 400);

    const { error } = await supabase.from('pyra_timesheets').delete().eq('id', id);
    if (error) return apiServerError(error.message);

    // Activity log (reuse the already-service-role supabase client)
    const { error: logErr } = await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'timesheet_entry_deleted',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: '/dashboard/timesheet',
      details: { entry_id: id },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });
    if (logErr) console.error('Activity log error:', logErr);

    return apiSuccess({ deleted: true });

  } catch (err) {
    console.error('[DELETE /api/timesheet/[id]] error:', err);
    return apiServerError();
  }
}
