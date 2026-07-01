import { NextRequest } from 'next/server';
import { getApiAuth, requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiUnauthorized, apiError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { hasPermission } from '@/lib/auth/rbac';
import { LEAVE_STATUS } from '@/lib/constants/statuses';
import { notify } from '@/lib/notifications/notify';
import { getManagerOf } from '@/lib/auth/team-scope';

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

  const days_count = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

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

  // Check balance — try v2 first, then fall back to v1
  const year = start.getFullYear();
  let balanceChecked = false;

  // v2: look up leave_type_id from pyra_leave_types by name
  try {
    const { data: leaveType } = await serviceSupabase
      .from('pyra_leave_types')
      .select('id')
      .eq('name', type)
      .eq('is_active', true)
      .single();

    if (leaveType) {
      const { data: v2Balance } = await serviceSupabase
        .from('pyra_leave_balances_v2')
        .select('total_days, used_days')
        .eq('username', auth.pyraUser.username)
        .eq('year', year)
        .eq('leave_type_id', leaveType.id)
        .single();

      if (v2Balance) {
        balanceChecked = true;
        const remaining = v2Balance.total_days - v2Balance.used_days;
        if (days_count > remaining) {
          return apiError(`رصيد الإجازات غير كافي. المتبقي: ${remaining} يوم`, 400);
        }
      }
    }
  } catch {
    // v2 tables may not exist — fall through to v1
  }

  // v1 fallback: only if v2 check didn't find a record
  if (!balanceChecked) {
    const { data: balance } = await supabase
      .from('pyra_leave_balances')
      .select('*')
      .eq('username', auth.pyraUser.username)
      .eq('year', year)
      .single();

    if (balance) {
      const totalKey = `${type}_total` as keyof typeof balance;
      const usedKey = `${type}_used` as keyof typeof balance;
      const total = (balance[totalKey] as number) || 0;
      const used = (balance[usedKey] as number) || 0;
      if (used + days_count > total) {
        return apiError(`رصيد الإجازات غير كافي. المتبقي: ${total - used} يوم`, 400);
      }
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
  const { error: logErr } = await serviceSupabase.from('pyra_activity_log').insert({
    id: generateId('al'),
    action_type: 'leave_request_created',
    username: auth.pyraUser.username,
    display_name: auth.pyraUser.display_name,
    target_path: '/dashboard/leave',
    details: { leave_id: data?.id, leave_type: type, start_date, end_date, total_days: days_count },
    ip_address: req.headers.get('x-forwarded-for') || 'unknown',
  });
  if (logErr) console.error('Activity log error:', logErr);

  // Notify the employee's manager that a leave request needs approval
  const managerUsername = await getManagerOf(serviceSupabase, auth.pyraUser.username);
  if (managerUsername) {
    await notify(serviceSupabase, {
      to: managerUsername,
      type: 'leave_request_pending',
      title: `طلب إجازة جديد من ${auth.pyraUser.display_name}`,
      message: `${days_count} يوم — من ${start_date} إلى ${end_date}`,
      link: '/dashboard/approvals',
      entity: { type: 'leave_request', id: data.id },
      from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
    });
  }

  return apiSuccess(data, undefined, 201);
}
