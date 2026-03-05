import { NextRequest } from 'next/server';
import { getApiAuth, requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiUnauthorized } from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
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

// UAE default work schedule: Sunday-Thursday, 09:00-18:00, 8 hours/day
const UAE_DEFAULT_SCHEDULE = {
  work_days: [0, 1, 2, 3, 4], // Sun=0, Mon=1, ..., Thu=4
  start_time: '09:00',
  end_time: '18:00',
  daily_hours: 8,
  overtime_multiplier: 1.5,
  weekend_multiplier: 2.0,
};

/**
 * Detect if a timesheet entry is overtime based on the user's work schedule.
 * Returns { is_overtime, overtime_multiplier } or null if not overtime.
 */
async function detectOvertime(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  username: string,
  date: string,
  hours: number,
  workScheduleId?: string | null,
): Promise<{ is_overtime: boolean; overtime_multiplier: number } | null> {
  // Determine the schedule
  let schedule = UAE_DEFAULT_SCHEDULE;

  if (workScheduleId) {
    const { data: ws } = await supabase
      .from('pyra_work_schedules')
      .select('work_days, start_time, end_time, daily_hours, overtime_multiplier, weekend_multiplier')
      .eq('id', workScheduleId)
      .single();
    if (ws) {
      schedule = {
        work_days: ws.work_days || UAE_DEFAULT_SCHEDULE.work_days,
        start_time: ws.start_time || UAE_DEFAULT_SCHEDULE.start_time,
        end_time: ws.end_time || UAE_DEFAULT_SCHEDULE.end_time,
        daily_hours: ws.daily_hours || UAE_DEFAULT_SCHEDULE.daily_hours,
        overtime_multiplier: ws.overtime_multiplier || 1.5,
        weekend_multiplier: ws.weekend_multiplier || 2.0,
      };
    }
  }

  const entryDate = new Date(date);
  // JavaScript getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
  const dayOfWeek = entryDate.getDay();

  // Check if entry day is a non-work day (weekend)
  if (!schedule.work_days.includes(dayOfWeek)) {
    return { is_overtime: true, overtime_multiplier: schedule.weekend_multiplier };
  }

  // Check if total hours for this day exceed daily_hours
  const { data: dayEntries } = await supabase
    .from('pyra_timesheets')
    .select('hours')
    .eq('username', username)
    .eq('date', date);

  const existingDayHours = (dayEntries || []).reduce((sum, e) => sum + (e.hours || 0), 0);

  if (existingDayHours + hours > schedule.daily_hours) {
    return { is_overtime: true, overtime_multiplier: schedule.overtime_multiplier };
  }

  return null;
}

export async function POST(req: NextRequest) {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const body = await req.json();
  const { project_id, task_id, date, hours, description, period_id } = body;

  if (!date || !hours) return apiValidationError('التاريخ والساعات مطلوبة');
  if (hours <= 0 || hours > 24) return apiValidationError('الساعات يجب أن تكون بين 0 و 24');

  const supabase = await createServerSupabaseClient();

  // Insert the timesheet entry
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
      period_id: period_id || null,
    })
    .select('*, pyra_projects!left(id, name)')
    .single();

  if (error) return apiServerError(error.message);

  // Auto-detect overtime after creation
  try {
    const overtimeResult = await detectOvertime(
      supabase,
      auth.pyraUser.username,
      date,
      hours,
      auth.pyraUser.work_schedule_id,
    );

    if (overtimeResult) {
      const serviceClient = createServiceRoleClient();
      const { data: updated } = await serviceClient
        .from('pyra_timesheets')
        .update({
          is_overtime: overtimeResult.is_overtime,
          overtime_multiplier: overtimeResult.overtime_multiplier,
        })
        .eq('id', data.id)
        .select('*, pyra_projects!left(id, name)')
        .single();

      if (updated) {
        return apiSuccess(updated, undefined, 201);
      }
    }
  } catch {
    // If overtime detection fails, still return the created entry
  }

  return apiSuccess(data, undefined, 201);
}
