import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiUnauthorized, apiError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { hasPermission } from '@/lib/auth/rbac';

export async function GET(req: NextRequest) {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const supabase = await createServerSupabaseClient();
  const canManage = hasPermission(auth.pyraUser.rolePermissions, 'leave.manage');

  let query = supabase
    .from('pyra_leave_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (!canManage) {
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

  // Check balance
  const year = start.getFullYear();
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
