import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { hasPermission } from '@/lib/auth/rbac';

export async function GET(req: NextRequest) {
  const auth = await requireApiPermission('timesheet.view');
  if (isApiError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  // User-scoping: non-managers can only see their own timesheet periods
  const canManage = hasPermission(auth.pyraUser.rolePermissions, 'timesheet.manage');
  let targetUsername = searchParams.get('username');
  if (!canManage) targetUsername = auth.pyraUser.username;

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from('pyra_timesheet_periods')
    .select('*')
    .order('start_date', { ascending: false });

  if (targetUsername) {
    query = query.eq('username', targetUsername);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query.limit(100);
  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireApiPermission('timesheet.view');
  if (isApiError(auth)) return auth;

  const body = await req.json();
  const { start_date, end_date, period_type } = body;

  if (!start_date || !end_date) {
    return apiValidationError('تاريخ البداية والنهاية مطلوبان');
  }

  if (new Date(end_date) <= new Date(start_date)) {
    return apiValidationError('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
  }

  const serviceClient = createServiceRoleClient();

  const { data, error } = await serviceClient
    .from('pyra_timesheet_periods')
    .insert({
      id: generateId('tsp'),
      username: auth.pyraUser.username,
      start_date,
      end_date,
      period_type: period_type || 'weekly',
      total_hours: 0,
      status: 'open',
    })
    .select()
    .single();

  if (error) return apiServerError(error.message);

  // Activity log
  const { error: logErr } = await serviceClient.from('pyra_activity_log').insert({
    id: generateId('al'),
    action_type: 'timesheet_period_created',
    username: auth.pyraUser.username,
    display_name: auth.pyraUser.display_name,
    target_path: '/dashboard/timesheet',
    details: { period_id: data?.id, period_type: period_type || 'weekly', start_date, end_date },
    ip_address: req.headers.get('x-forwarded-for') || 'unknown',
  });
  if (logErr) console.error('Activity log error:', logErr);

  return apiSuccess(data, undefined, 201);
}
