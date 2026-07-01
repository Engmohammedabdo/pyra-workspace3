import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError, getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiError, apiUnauthorized, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/auth/rbac';
import { canApproveFor } from '@/lib/auth/team-scope';
import { notifyApprovers } from '@/lib/notifications/approvers';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await params;
    const body = await req.json();
    const { action, rejection_note } = body;

    if (!action || !['submit', 'approve', 'reject'].includes(action)) {
      return apiValidationError('الإجراء غير صالح. القيم المسموحة: submit, approve, reject');
    }

    const supabase = await createServerSupabaseClient();
    const serviceClient = createServiceRoleClient();

    // Fetch the existing period
    const { data: period, error: fetchError } = await supabase
      .from('pyra_timesheet_periods')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !period) return apiNotFound('الفترة غير موجودة');

    const isOwner = period.username === auth.pyraUser.username;
    const canApprove = hasPermission(auth.pyraUser.rolePermissions, 'timesheet.approve');
    const canManage = hasPermission(auth.pyraUser.rolePermissions, 'timesheet.manage');

    // Build updates based on action
    const updates: Record<string, unknown> = {};

    if (action === 'submit') {
      if (!isOwner && !canManage) {
        return apiError('فقط صاحب الفترة يمكنه إرسالها', 403);
      }
      if (period.status !== 'open' && period.status !== 'rejected') {
        return apiError('لا يمكن إرسال فترة بالحالة الحالية', 400);
      }
      updates.status = 'submitted';
      updates.submitted_at = new Date().toISOString();
    } else if (action === 'approve' || action === 'reject') {
      if (!canApprove) {
        return apiError('ليس لديك صلاحية الاعتماد', 403);
      }
      if (period.status !== 'submitted') {
        return apiError(
          action === 'approve' ? 'لا يمكن اعتماد فترة لم يتم إرسالها' : 'لا يمكن رفض فترة لم يتم إرسالها',
          400,
        );
      }
      // Manager-scope guard — permission alone gates the action category;
      // this guard enforces "only your direct reports" (admin overrides).
      const allowedToApprove = await canApproveFor(
        serviceClient,
        auth.pyraUser.username,
        auth.pyraUser.role,
        period.username,
      );
      if (!allowedToApprove) {
        return apiError('يمكنك فقط اعتماد جداول الموظفين تحت إدارتك المباشرة', 403);
      }
      updates.status = action === 'approve' ? 'approved' : 'rejected';
      if (action === 'reject') {
        updates.rejection_note = rejection_note || null;
      }
      // NOTE: approved_by/approved_at are used for both approvals and rejections
      // A future migration will rename these to reviewed_by/reviewed_at
      updates.approved_by = auth.pyraUser.username;
      updates.approved_at = new Date().toISOString();
    }

    // Recalculate total_hours from timesheet entries linked to this period
    const { data: entries } = await supabase
      .from('pyra_timesheets')
      .select('hours')
      .eq('period_id', id);

    if (entries && entries.length > 0) {
      updates.total_hours = entries.reduce((sum: number, e: { hours: number }) => sum + (e.hours || 0), 0);
    }

    const { data, error } = await serviceClient
      .from('pyra_timesheet_periods')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return apiServerError(error.message);

    // Activity log
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.TIMESHEET}_${ACTIVITY_ACTIONS.UPDATE}`,
      '/dashboard/timesheet',
      { period_id: id, status: action, source: 'timesheet_period_updated' },
      req.headers.get('x-forwarded-for') || 'unknown',
    );

    // Notify the employee's manager (or fallback: all active admins) that a timesheet awaits approval
    if (action === 'submit') {
      await notifyApprovers(serviceClient, period.username, {
        type: 'timesheet_pending',
        title: `جدول دوام بانتظار الاعتماد من ${auth.pyraUser.display_name}`,
        message: `الفترة من ${period.start_date} إلى ${period.end_date}`,
        link: '/dashboard/approvals',
        entity: { type: 'timesheet_period', id },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });
    }

    return apiSuccess(data);

  } catch (err) {
    console.error('[PATCH /api/dashboard/timesheet-periods/[id]] error:', err);
    return apiServerError();
  }
}
