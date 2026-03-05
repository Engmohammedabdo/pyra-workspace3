import { NextRequest } from 'next/server';
import { getApiAuth, requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiUnauthorized } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { hasPermission } from '@/lib/auth/rbac';

export async function GET(req: NextRequest) {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');
  const week = searchParams.get('week'); // ISO date of week start
  const status = searchParams.get('status');

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from('pyra_timesheets')
    .select('*, pyra_projects!left(id, name)')
    .order('date', { ascending: false });

  // Users with manage or approve permissions can see all; otherwise only own entries
  const perms = auth.pyraUser.rolePermissions;
  const canManage =
    hasPermission(perms, 'timesheet.manage') ||
    hasPermission(perms, 'timesheet.approve') ||
    hasPermission(perms, '*') ||
    auth.pyraUser.role === 'admin';

  if (username && canManage) {
    query = query.eq('username', username);
  } else if (!canManage) {
    // Non-admin employees: only see their own timesheet entries
    query = query.eq('username', auth.pyraUser.username);
  }

  if (week) {
    const startDate = new Date(week);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    query = query.gte('date', startDate.toISOString().split('T')[0]).lte('date', endDate.toISOString().split('T')[0]);
  }

  if (status) query = query.eq('status', status);

  const { data, error } = await query.limit(100);
  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

export async function POST(req: NextRequest) {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const body = await req.json();
  const { project_id, task_id, date, hours, description } = body;

  if (!date || !hours) return apiValidationError('التاريخ والساعات مطلوبة');
  if (hours <= 0 || hours > 24) return apiValidationError('الساعات يجب أن تكون بين 0 و 24');

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('pyra_timesheets')
    .insert({
      id: generateId('ts'),
      username: auth.pyraUser.username,
      project_id: project_id || null,
      task_id: task_id || null,
      date,
      hours,
      description: description || null,
      status: 'draft',
    })
    .select('*, pyra_projects!left(id, name)')
    .single();

  if (error) return apiServerError(error.message);
  return apiSuccess(data, undefined, 201);
}
