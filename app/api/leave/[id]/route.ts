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

  const { data: existing } = await supabase.from('pyra_leave_requests').select('*').eq('id', id).single();
  if (!existing) return apiNotFound('الطلب غير موجود');

  // Handle approval/rejection
  if (body.status === 'approved' || body.status === 'rejected') {
    if (!hasPermission(auth.pyraUser.rolePermissions, 'leave.approve')) {
      return apiError('غير مصرح بالاعتماد', 403);
    }

    const updates: Record<string, unknown> = {
      status: body.status,
      reviewed_by: auth.pyraUser.username,
      reviewed_at: new Date().toISOString(),
      review_note: body.review_note || null,
    };

    const { data, error } = await supabase.from('pyra_leave_requests').update(updates).eq('id', id).select().single();
    if (error) return apiServerError(error.message);

    // If approved, update leave balance
    if (body.status === 'approved') {
      const year = new Date(existing.start_date).getFullYear();
      const usedKey = `${existing.type}_used`;

      // Upsert balance
      const { data: balance } = await supabase
        .from('pyra_leave_balances')
        .select('*')
        .eq('username', existing.username)
        .eq('year', year)
        .single();

      if (balance) {
        await supabase
          .from('pyra_leave_balances')
          .update({ [usedKey]: ((balance as Record<string, unknown>)[usedKey] as number) + existing.days_count })
          .eq('username', existing.username)
          .eq('year', year);
      } else {
        await supabase
          .from('pyra_leave_balances')
          .insert({
            username: existing.username,
            year,
            [usedKey]: existing.days_count,
          });
      }
    }

    return apiSuccess(data);
  }

  // Cancel own pending request (legacy — simple delete)
  if (body.status === 'cancelled' && existing.username === auth.pyraUser.username && existing.status === 'pending') {
    const { error } = await supabase.from('pyra_leave_requests').delete().eq('id', id);
    if (error) return apiServerError(error.message);
    return apiSuccess({ deleted: true });
  }

  // ─── Cancel action (with reason, supports approved + pending) ───
  if (body.action === 'cancel') {
    const cancellationReason = body.cancellation_reason?.trim();
    if (!cancellationReason) {
      return apiError('سبب الإلغاء مطلوب', 400);
    }

    // Only allow cancellation of pending or approved requests
    if (existing.status !== 'pending' && existing.status !== 'approved') {
      return apiError('لا يمكن إلغاء طلب بهذه الحالة', 400);
    }

    // Permission: owner can cancel their own, or user with leave.approve permission
    const isOwner = existing.username === auth.pyraUser.username;
    const canApprove = hasPermission(auth.pyraUser.rolePermissions, 'leave.approve');
    if (!isOwner && !canApprove) {
      return apiError('غير مصرح بإلغاء هذا الطلب', 403);
    }

    const wasApproved = existing.status === 'approved';

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

    // If the leave was approved, restore the balance
    if (wasApproved) {
      const year = new Date(existing.start_date).getFullYear();
      const usedKey = `${existing.type}_used`;

      // Restore in pyra_leave_balances (legacy table)
      const { data: balance } = await supabase
        .from('pyra_leave_balances')
        .select('*')
        .eq('username', existing.username)
        .eq('year', year)
        .single();

      if (balance) {
        const currentUsed = ((balance as Record<string, unknown>)[usedKey] as number) || 0;
        await supabase
          .from('pyra_leave_balances')
          .update({ [usedKey]: Math.max(0, currentUsed - existing.days_count) })
          .eq('username', existing.username)
          .eq('year', year);
      }

      // Also try pyra_leave_balances_v2
      // Map type to leave_type_id: annual → lt_annual, sick → lt_sick, personal → lt_personal
      const leaveTypeId = `lt_${existing.type}`;
      const { data: balV2 } = await supabase
        .from('pyra_leave_balances_v2')
        .select('id, used_days')
        .eq('username', existing.username)
        .eq('year', year)
        .eq('leave_type_id', leaveTypeId)
        .single();

      if (balV2) {
        await supabase
          .from('pyra_leave_balances_v2')
          .update({ used_days: Math.max(0, balV2.used_days - existing.days_count) })
          .eq('id', balV2.id);
      }
    }

    return apiSuccess(updated);
  }

  return apiError('عملية غير مدعومة', 400);
}
