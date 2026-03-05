import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/auth/rbac';

export async function GET(req: NextRequest) {
  const auth = await requireApiPermission('timesheet.view');
  if (isApiError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month'); // YYYY-MM

  // User-scoping: non-managers can only see their own overtime summary
  const canManage = hasPermission(auth.pyraUser.rolePermissions, 'timesheet.manage');
  const username = canManage ? searchParams.get('username') : null;

  if (!month) {
    return apiValidationError('الشهر مطلوب بصيغة YYYY-MM');
  }

  // Parse month range
  const [year, monthNum] = month.split('-').map(Number);
  if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
    return apiValidationError('صيغة الشهر غير صالحة');
  }

  const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
  const endDate = monthNum === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(monthNum + 1).padStart(2, '0')}-01`;

  const supabase = await createServerSupabaseClient();

  // Build query for overtime entries
  let query = supabase
    .from('pyra_timesheets')
    .select('hours, overtime_multiplier')
    .eq('is_overtime', true)
    .gte('date', startDate)
    .lt('date', endDate);

  // Scope to username if provided, otherwise use auth user
  const targetUsername = username || auth.pyraUser.username;
  query = query.eq('username', targetUsername);

  const { data: overtimeEntries, error } = await query;
  if (error) return apiServerError(error.message);

  const total_overtime_hours = (overtimeEntries || []).reduce(
    (sum, e) => sum + (e.hours || 0),
    0
  );
  const total_overtime_entries = (overtimeEntries || []).length;

  // Fetch user's hourly_rate for estimated pay
  const { data: userRecord } = await supabase
    .from('pyra_users')
    .select('hourly_rate, salary')
    .eq('username', targetUsername)
    .single();

  // Calculate estimated pay: sum(hours * multiplier * hourly_rate)
  // If no hourly_rate, estimate from salary (salary / 22 work days / 8 hours)
  const hourlyRate = userRecord?.hourly_rate
    || (userRecord?.salary ? userRecord.salary / 22 / 8 : 0);

  const estimated_pay = (overtimeEntries || []).reduce(
    (sum, e) => sum + (e.hours || 0) * (e.overtime_multiplier || 1.5) * hourlyRate,
    0
  );

  return apiSuccess({
    total_overtime_hours: Math.round(total_overtime_hours * 100) / 100,
    total_overtime_entries,
    estimated_pay: Math.round(estimated_pay * 100) / 100,
    hourly_rate: Math.round(hourlyRate * 100) / 100,
    month,
    username: targetUsername,
  });
}
