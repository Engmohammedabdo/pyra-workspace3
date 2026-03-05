import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError, getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiError, apiUnauthorized, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/auth/rbac';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  } else if (action === 'approve') {
    if (!canApprove) {
      return apiError('ليس لديك صلاحية الاعتماد', 403);
    }
    if (period.status !== 'submitted') {
      return apiError('لا يمكن اعتماد فترة لم يتم إرسالها', 400);
    }
    updates.status = 'approved';
    updates.approved_by = auth.pyraUser.username;
    updates.approved_at = new Date().toISOString();
  } else if (action === 'reject') {
    if (!canApprove) {
      return apiError('ليس لديك صلاحية الرفض', 403);
    }
    if (period.status !== 'submitted') {
      return apiError('لا يمكن رفض فترة لم يتم إرسالها', 400);
    }
    updates.status = 'rejected';
    updates.rejection_note = rejection_note || null;
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
  return apiSuccess(data);
}
