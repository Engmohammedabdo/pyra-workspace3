import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { hasPermission } from '@/lib/auth/rbac';

// =============================================================
// GET /api/dashboard/attendance/summary
// Monthly attendance summary for a user.
// Query params: ?username=X&month=YYYY-MM
// Returns: { present_days, late_days, absent_days, total_hours, avg_hours_per_day }
// =============================================================
export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiPermission('attendance.view');
    if (isApiError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const canManage = hasPermission(auth.pyraUser.rolePermissions, 'attendance.manage');

    // Determine target username
    let username = searchParams.get('username') || auth.pyraUser.username;
    if (!canManage && username !== auth.pyraUser.username) {
      username = auth.pyraUser.username;
    }

    // Parse month filter (defaults to current month)
    const now = new Date();
    const monthParam = searchParams.get('month');
    let year = now.getFullYear();
    let month = now.getMonth() + 1;

    if (monthParam) {
      const parts = monthParam.split('-');
      if (parts.length === 2) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
      }
    }

    // Build date range for the month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const supabase = createServiceRoleClient();

    // Fetch attendance records for the month
    const { data: records, error } = await supabase
      .from('pyra_attendance')
      .select('date, status, total_hours')
      .eq('username', username)
      .gte('date', startDate)
      .lte('date', endDate);

    if (error) return apiServerError(error.message);

    // Get work schedule for calculating absent days
    const { data: userRecord } = await supabase
      .from('pyra_users')
      .select('work_schedule_id')
      .eq('username', username)
      .single();

    let workDays: number[] = [0, 1, 2, 3, 4]; // Default: Sun-Thu

    if (userRecord?.work_schedule_id) {
      const { data: schedule } = await supabase
        .from('pyra_work_schedules')
        .select('work_days')
        .eq('id', userRecord.work_schedule_id)
        .single();
      if (schedule?.work_days) {
        workDays = schedule.work_days as number[];
      }
    } else {
      const { data: defaultSchedule } = await supabase
        .from('pyra_work_schedules')
        .select('work_days')
        .eq('is_default', true)
        .maybeSingle();
      if (defaultSchedule?.work_days) {
        workDays = defaultSchedule.work_days as number[];
      }
    }

    // Count stats from records
    const present_days = (records || []).filter(r => r.status === 'present').length;
    const late_days = (records || []).filter(r => r.status === 'late').length;
    const total_hours = (records || []).reduce((sum, r) => sum + (r.total_hours || 0), 0);
    const recordedDates = new Set((records || []).map(r => r.date));

    // Calculate expected work days up to today (or end of month)
    const uaeOffset = 4 * 60 * 60 * 1000;
    const uaeNow = new Date(Date.now() + uaeOffset);
    const todayStr = uaeNow.toISOString().slice(0, 10);

    let expectedWorkDays = 0;
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      // Only count past days (up to today)
      if (dateStr > todayStr) break;

      const dayDate = new Date(year, month - 1, d);
      const dayOfWeek = dayDate.getDay(); // 0=Sunday, 6=Saturday
      if (workDays.includes(dayOfWeek)) {
        expectedWorkDays++;
      }
    }

    // Absent = expected work days that have no attendance record
    const attendedDays = present_days + late_days;
    const absent_days = Math.max(0, expectedWorkDays - attendedDays);
    const avg_hours_per_day = attendedDays > 0 ? Math.round((total_hours / attendedDays) * 100) / 100 : 0;

    return apiSuccess({
      present_days,
      late_days,
      absent_days,
      total_hours: Math.round(total_hours * 100) / 100,
      avg_hours_per_day,
      expected_work_days: expectedWorkDays,
    });
  } catch (err) {
    console.error('GET /api/dashboard/attendance/summary error:', err);
    return apiServerError();
  }
}
