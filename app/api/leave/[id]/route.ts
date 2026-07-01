import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiError, apiUnauthorized } from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/auth/rbac';
import { canApproveFor } from '@/lib/auth/team-scope';
import { generateId } from '@/lib/utils/id';
import { LEAVE_STATUS } from '@/lib/constants/statuses';
import { notify } from '@/lib/notifications/notify';
import { notifyApprovers } from '@/lib/notifications/approvers';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { countLeaveDays } from '@/lib/leave/days';
import { dubaiDayKey } from '@/lib/utils/format';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const { id } = await params;
  const body = await req.json();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase.from('pyra_leave_requests').select('*').eq('id', id).single();
  if (!existing) return apiNotFound('الطلب غير موجود');

  // Handle approval/rejection
  if (body.status === LEAVE_STATUS.APPROVED || body.status === LEAVE_STATUS.REJECTED) {
    // Two-layer authorization (CRM/ERP standard):
    //   1. Permission gate — does the role even allow approving leave?
    //   2. Scope gate    — is the approver this employee's direct manager
    //                       (or admin override)?
    // Either alone is insufficient: a custom HR role might have leave.approve
    // org-wide, but should still only approve THEIR direct reports.
    if (!hasPermission(auth.pyraUser.rolePermissions, 'leave.approve')) {
      return apiError('غير مصرح بالاعتماد', 403);
    }
    const allowed = await canApproveFor(
      supabase,
      auth.pyraUser.username,
      auth.pyraUser.role,
      existing.username,
    );
    if (!allowed) {
      return apiError('يمكنك فقط اعتماد طلبات الموظفين تحت إدارتك المباشرة', 403);
    }

    const updates: Record<string, unknown> = {
      status: body.status,
      reviewed_by: auth.pyraUser.username,
      reviewed_at: new Date().toISOString(),
      review_note: body.review_note || null,
    };

    const { data, error } = await supabase.from('pyra_leave_requests').update(updates).eq('id', id).select().single();
    if (error) return apiServerError(error.message);

    // If approved, update leave balance (v2 — the single source of truth)
    if (body.status === LEAVE_STATUS.APPROVED) {
      const year = new Date(existing.start_date).getFullYear();
      const serviceSupabase = createServiceRoleClient();

      const { data: leaveType } = await serviceSupabase
        .from('pyra_leave_types')
        .select('id, default_days')
        .eq('name', existing.type)
        .single();

      if (leaveType) {
        const { data: v2Balance } = await serviceSupabase
          .from('pyra_leave_balances_v2')
          .select('id, used_days')
          .eq('username', existing.username)
          .eq('year', year)
          .eq('leave_type_id', leaveType.id)
          .single();

        if (v2Balance) {
          await serviceSupabase
            .from('pyra_leave_balances_v2')
            .update({ used_days: v2Balance.used_days + existing.days_count })
            .eq('id', v2Balance.id);
        } else {
          // Upsert: create v2 record if it doesn't exist
          await serviceSupabase
            .from('pyra_leave_balances_v2')
            .insert({
              id: generateId('lb'),
              username: existing.username,
              year,
              leave_type_id: leaveType.id,
              total_days: leaveType.default_days,
              used_days: existing.days_count,
            });
        }
      }
    }

    // Activity log
    const serviceForLog = createServiceRoleClient();
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.LEAVE}_${ACTIVITY_ACTIONS.UPDATE}`,
      '/dashboard/leave',
      { leave_id: id, action: body.status === LEAVE_STATUS.APPROVED ? 'approve' : 'reject', source: 'leave_request_updated' },
      req.headers.get('x-forwarded-for') || 'unknown',
    );

    // Notify the employee of the outcome (fire-and-forget)
    void notify(serviceForLog, {
      to: existing.username,
      type: body.status === LEAVE_STATUS.APPROVED ? 'leave_approved' : 'leave_rejected',
      title: body.status === LEAVE_STATUS.APPROVED
        ? 'تمت الموافقة على طلب إجازتك'
        : 'تم رفض طلب إجازتك',
      message: body.review_note
        ? body.review_note
        : body.status === LEAVE_STATUS.APPROVED
          ? `وافق ${auth.pyraUser.display_name} على طلب إجازتك`
          : `رفض ${auth.pyraUser.display_name} طلب إجازتك`,
      link: '/dashboard/leave',
      entity: { type: 'leave_request', id },
      from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
    }).then(() => {});

    return apiSuccess(data);
  }

  // Cancel own pending request (legacy path — soft-cancel)
  if (body.status === 'cancelled' && existing.username === auth.pyraUser.username && existing.status === LEAVE_STATUS.PENDING) {
    const { data: cancelled, error } = await supabase
      .from('pyra_leave_requests')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: auth.pyraUser.username,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return apiServerError(error.message);

    // Restore only the UNUSED (future) portion of the leave in v2 — a
    // request may span dates already partially elapsed by cancellation time.
    const year = new Date(existing.start_date).getFullYear();
    const serviceSupabase = createServiceRoleClient();

    const today = dubaiDayKey();
    const tomorrow = dubaiDayKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const restoreStart = existing.start_date > tomorrow ? existing.start_date : tomorrow;
    const restoreDays = restoreStart > existing.end_date ? 0 : countLeaveDays(restoreStart, existing.end_date);

    if (restoreDays > 0) {
      const { data: leaveType } = await serviceSupabase
        .from('pyra_leave_types')
        .select('id')
        .eq('name', existing.type)
        .single();

      if (leaveType) {
        const { data: balV2 } = await serviceSupabase
          .from('pyra_leave_balances_v2')
          .select('id, used_days')
          .eq('username', existing.username)
          .eq('year', year)
          .eq('leave_type_id', leaveType.id)
          .single();

        if (balV2 && balV2.used_days > 0) {
          await serviceSupabase
            .from('pyra_leave_balances_v2')
            .update({ used_days: Math.max(0, balV2.used_days - restoreDays) })
            .eq('id', balV2.id);
        }
      }
    }

    // Activity log
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.LEAVE}_${ACTIVITY_ACTIONS.UPDATE}`,
      '/dashboard/leave',
      { leave_id: id, action: 'cancel', source: 'leave_request_updated' },
      req.headers.get('x-forwarded-for') || 'unknown',
    );

    // Notify the manager/approver that the leave was cancelled
    await notifyApprovers(serviceSupabase, existing.username, {
      type: 'leave_cancelled',
      title: `تم إلغاء إجازة — ${existing.username}`,
      message: `${existing.type} من ${existing.start_date} إلى ${existing.end_date}`,
      link: '/dashboard/approvals',
      entity: { type: 'leave_request', id },
      from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
    });

    return apiSuccess(cancelled);
  }

  // ─── Cancel action (with reason, supports approved + pending) ───
  if (body.action === 'cancel') {
    const cancellationReason = body.cancellation_reason?.trim();
    if (!cancellationReason) {
      return apiError('سبب الإلغاء مطلوب', 400);
    }

    // Only allow cancellation of pending or approved requests
    if (existing.status !== LEAVE_STATUS.PENDING && existing.status !== LEAVE_STATUS.APPROVED) {
      return apiError('لا يمكن إلغاء طلب بهذه الحالة', 400);
    }

    // Permission: owner can cancel their own, or user with leave.approve permission
    const isOwner = existing.username === auth.pyraUser.username;
    const canApprove = hasPermission(auth.pyraUser.rolePermissions, 'leave.approve');
    if (!isOwner && !canApprove) {
      return apiError('غير مصرح بإلغاء هذا الطلب', 403);
    }

    const wasApproved = existing.status === LEAVE_STATUS.APPROVED;

    // Update leave request to cancelled
    const { data: updated, error: updateError } = await supabase
      .from('pyra_leave_requests')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: auth.pyraUser.username,
        cancellation_reason: cancellationReason,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) return apiServerError(updateError.message);

    // If the leave was approved, restore only the UNUSED (future) portion in
    // v2 — a leave already partially taken by cancellation time shouldn't
    // hand back days that were actually used.
    if (wasApproved) {
      const year = new Date(existing.start_date).getFullYear();
      const serviceSupabase = createServiceRoleClient();

      const today = dubaiDayKey();
      const tomorrow = dubaiDayKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
      const restoreStart = existing.start_date > tomorrow ? existing.start_date : tomorrow;
      const restoreDays = restoreStart > existing.end_date ? 0 : countLeaveDays(restoreStart, existing.end_date);

      if (restoreDays > 0) {
        // Look up actual leave_type_id from pyra_leave_types (custom types have random IDs)
        const { data: leaveType } = await serviceSupabase
          .from('pyra_leave_types')
          .select('id')
          .eq('name', existing.type)
          .single();

        if (leaveType) {
          const { data: balV2 } = await serviceSupabase
            .from('pyra_leave_balances_v2')
            .select('id, used_days')
            .eq('username', existing.username)
            .eq('year', year)
            .eq('leave_type_id', leaveType.id)
            .single();

          if (balV2) {
            await serviceSupabase
              .from('pyra_leave_balances_v2')
              .update({ used_days: Math.max(0, balV2.used_days - restoreDays) })
              .eq('id', balV2.id);
          }
        }
      }
    }

    // Activity log
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.LEAVE}_${ACTIVITY_ACTIONS.UPDATE}`,
      '/dashboard/leave',
      { leave_id: id, action: 'cancel', source: 'leave_request_updated' },
      req.headers.get('x-forwarded-for') || 'unknown',
    );

    // Notify the manager/approver that the leave was cancelled
    await notifyApprovers(createServiceRoleClient(), existing.username, {
      type: 'leave_cancelled',
      title: `تم إلغاء إجازة — ${existing.username}`,
      message: `${existing.type} من ${existing.start_date} إلى ${existing.end_date}`,
      link: '/dashboard/approvals',
      entity: { type: 'leave_request', id },
      from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
    });

    return apiSuccess(updated);
  }

  return apiError('عملية غير مدعومة', 400);
}
