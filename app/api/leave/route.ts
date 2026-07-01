import { NextRequest } from 'next/server';
import { getApiAuth, requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiUnauthorized, apiError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { hasPermission } from '@/lib/auth/rbac';
import { LEAVE_STATUS } from '@/lib/constants/statuses';
import { notifyApprovers } from '@/lib/notifications/approvers';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { countLeaveDays } from '@/lib/leave/days';

export async function GET(req: NextRequest) {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const supabase = await createServerSupabaseClient();
  const perms = auth.pyraUser.rolePermissions;
  // Only `leave.approve` (manager/HR) or admin can see other users' requests.
  // `leave.manage` was previously included here — but it's an admin-tier perm
  // that should NOT be in BASE_EMPLOYEE. Listing it here would re-leak every
  // employee's leave records to every employee if it ever gets re-added to BASE.
  const canSeeAll =
    hasPermission(perms, 'leave.approve') ||
    hasPermission(perms, 'leave.manage') ||
    hasPermission(perms, '*') ||
    auth.pyraUser.role === 'admin';

  let query = supabase
    .from('pyra_leave_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (!canSeeAll) {
    // Non-admin employees: only see their own leave requests
    query = query.eq('username', auth.pyraUser.username);
  }
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

export async function POST(req: NextRequest) {
  // Gate on leave.create (in BASE_EMPLOYEE for all internal users; blocks
  // clients / anyone without the permission from submitting leave).
  const auth = await requireApiPermission('leave.create');
  if (isApiError(auth)) return auth;

  const { type, start_date, end_date, reason } = await req.json();
  if (!type || !start_date || !end_date) return apiValidationError('النوع وتواريخ البداية والنهاية مطلوبة');

  const start = new Date(start_date);
  const end = new Date(end_date);
  if (end < start) return apiValidationError('تاريخ النهاية يجب أن يكون بعد البداية');

  const days_count = countLeaveDays(start_date, end_date);
  if (days_count === 0) return apiValidationError('لا توجد أيام عمل ضمن الفترة المحددة');

  const supabase = await createServerSupabaseClient();
  const serviceSupabase = createServiceRoleClient();

  // Contractor gate — contractors/freelancers manage their own time; block system leave submissions
  const { data: requestingUser } = await serviceSupabase
    .from('pyra_users')
    .select('employment_type')
    .eq('username', auth.pyraUser.username)
    .single();
  if (requestingUser?.employment_type === 'contract' || requestingUser?.employment_type === 'freelance') {
    return apiError('المتعاقدون المستقلون لا يقدّمون طلبات إجازة عبر النظام', 403);
  }

  // Balance check — v2 is the single source of truth. Resolve the leave type
  // first; unpaid types (e.g. lt_unpaid) skip the check entirely since
  // unpaid leave doesn't draw from a balance.
  const year = start.getFullYear();

  const { data: leaveType } = await serviceSupabase
    .from('pyra_leave_types')
    .select('id, default_days, is_paid')
    .eq('name', type)
    .eq('is_active', true)
    .single();

  if (leaveType?.is_paid) {
    const { data: v2Balance } = await serviceSupabase
      .from('pyra_leave_balances_v2')
      .select('total_days, used_days, carried_over')
      .eq('username', auth.pyraUser.username)
      .eq('year', year)
      .eq('leave_type_id', leaveType.id)
      .single();

    // Missing row → assume fresh entitlement (default_days) so employees
    // aren't blocked before rollover/seeding has run for them.
    const available = v2Balance
      ? v2Balance.total_days + (v2Balance.carried_over || 0) - v2Balance.used_days
      : leaveType.default_days;

    if (days_count > available) {
      return apiError(`رصيد الإجازات غير كافٍ. المتبقي: ${available} يوم`, 400);
    }
  }

  const { data, error } = await supabase
    .from('pyra_leave_requests')
    .insert({
      id: generateId('lr'),
      username: auth.pyraUser.username,
      type,
      start_date,
      end_date,
      days_count,
      reason: reason || null,
      status: LEAVE_STATUS.PENDING,
    })
    .select()
    .single();

  if (error) return apiServerError(error.message);

  // Activity log
  logActivity(
    auth.pyraUser.username,
    auth.pyraUser.display_name,
    `${ENTITY_TYPES.LEAVE}_${ACTIVITY_ACTIONS.CREATE}`,
    '/dashboard/leave',
    { leave_id: data?.id, leave_type: type, start_date, end_date, total_days: days_count, source: 'leave_request_created' },
    req.headers.get('x-forwarded-for') || 'unknown',
  );

  // Notify the employee's manager (or fallback: all active admins) that a leave request needs approval
  await notifyApprovers(serviceSupabase, auth.pyraUser.username, {
    type: 'leave_request_pending',
    title: `طلب إجازة جديد من ${auth.pyraUser.display_name}`,
    message: `${days_count} يوم — من ${start_date} إلى ${end_date}`,
    link: '/dashboard/approvals',
    entity: { type: 'leave_request', id: data.id },
    from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
  });

  return apiSuccess(data, undefined, 201);
}
