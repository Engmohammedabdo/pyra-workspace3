import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiError, apiUnauthorized } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/auth/rbac';
import { canApproveFor } from '@/lib/auth/team-scope';
import { TIMESHEET_STATUS } from '@/lib/constants/statuses';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();
    const t = await getTranslations('api');

    const { id } = await params;
    const body = await req.json();

    // Gate-then-service-role (Gap #3 Phase 5): auth already checked above;
    // service-role bypasses RLS — ownership scope enforced explicitly below.
    const supabase = createServiceRoleClient();

    // Check if user owns this entry or has manage permission
    const { data: existing } = await supabase.from('pyra_timesheets').select('username, status').eq('id', id).single();
    if (!existing) return apiNotFound(t('timesheet.recordNotFound'));

    const canManage = hasPermission(auth.pyraUser.rolePermissions, 'timesheet.manage');
    const isOwner = existing.username === auth.pyraUser.username;

    if (!isOwner && !canManage) return apiError(t('timesheet.notAuthorized'), 403);

    // Owners can only edit draft entries
    if (isOwner && !canManage && existing.status !== TIMESHEET_STATUS.DRAFT) {
      return apiError(t('timesheet.cannotModifySubmitted'), 400);
    }

    const allowed = ['project_id', 'task_id', 'date', 'hours', 'description', 'status', 'is_billable', 'billing_rate'];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    // Handle approval
    if (body.status === TIMESHEET_STATUS.APPROVED || body.status === TIMESHEET_STATUS.REJECTED) {
      if (!hasPermission(auth.pyraUser.rolePermissions, 'timesheet.approve')) {
        return apiError(t('timesheet.notAuthorizedToApprove'), 403);
      }
      // Manager-scope guard — permission alone gates the action category; this
      // enforces "only your direct reports" (admin overrides). Mirrors the
      // period-approval route so entry-level approval can't be done cross-team.
      const allowedToApprove = await canApproveFor(
        supabase,
        auth.pyraUser.username,
        auth.pyraUser.role,
        existing.username,
      );
      if (!allowedToApprove) {
        return apiError(t('timesheet.approvalScopeDenied', { noun: t('timesheet.scopeNounEntries') }), 403);
      }
      // Prevent self-approval
      if (body.status === TIMESHEET_STATUS.APPROVED && existing.username === auth.pyraUser.username) {
        return apiError(t('timesheet.noSelfApproval'), 403);
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
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.TIMESHEET}_${ACTIVITY_ACTIONS.UPDATE}`,
      '/dashboard/timesheet',
      { entry_id: id, source: 'timesheet_entry_updated' },
      req.headers.get('x-forwarded-for') || 'unknown',
    );

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
    const t = await getTranslations('api');

    const { id } = await params;

    // Gate-then-service-role (Gap #3 Phase 5): auth already checked above;
    // service-role bypasses RLS — ownership scope enforced explicitly below.
    const supabase = createServiceRoleClient();

    const { data: existing } = await supabase.from('pyra_timesheets').select('username, status').eq('id', id).single();
    if (!existing) return apiNotFound(t('timesheet.recordNotFound'));

    const canManage = hasPermission(auth.pyraUser.rolePermissions, 'timesheet.manage');
    const isOwner = existing.username === auth.pyraUser.username;

    if (!isOwner && !canManage) return apiError(t('timesheet.notAuthorized'), 403);
    if (isOwner && existing.status !== TIMESHEET_STATUS.DRAFT) return apiError(t('timesheet.cannotDeleteSubmitted'), 400);

    const { error } = await supabase.from('pyra_timesheets').delete().eq('id', id);
    if (error) return apiServerError(error.message);

    // Activity log (reuse the already-service-role supabase client)
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.TIMESHEET}_${ACTIVITY_ACTIONS.DELETE}`,
      '/dashboard/timesheet',
      { entry_id: id, source: 'timesheet_entry_deleted' },
      req.headers.get('x-forwarded-for') || 'unknown',
    );

    return apiSuccess({ deleted: true });

  } catch (err) {
    console.error('[DELETE /api/timesheet/[id]] error:', err);
    return apiServerError();
  }
}
