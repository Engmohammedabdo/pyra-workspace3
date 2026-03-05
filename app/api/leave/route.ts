import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiUnauthorized, apiError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { hasPermission } from '@/lib/auth/rbac';

export async function GET(req: NextRequest) {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const supabase = await createServerSupabaseClient();
  const perms = auth.pyraUser.rolePermissions;
  const canManage =
    hasPermission(perms, 'leave.manage') ||
    hasPermission(perms, 'leave.approve') ||
    hasPermission(perms, '*') ||
    auth.pyraUser.role === 'admin';

  let query = supabase
    .from('pyra_leave_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (!canManage) {
    // Non-admin employees: only see their own leave requests
    query = query.eq('username', auth.pyraUser.username);
  }
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

export async function POST(req: NextRequest) {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const { type, start_date, end_date, reason } = await req.json();
  if (!type || !start_date || !end_date) return apiValidationError('النوع وتواريخ البداية والنهاية مطلوبة');

  const start = new Date(start_date);
  const end = new Date(end_date);
  if (end < start) return apiValidationError('تاريخ النهاية يجب أن يكون بعد البداية');

  const days_count = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const supabase = await createServerSupabaseClient();
  const serviceSupabase = createServiceRoleClient();

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
      status: 'pending',
    })
    .select()
    .single();

  if (error) return apiServerError(error.message);
  return apiSuccess(data, undefined, 201);
}
