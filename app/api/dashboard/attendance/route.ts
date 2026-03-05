import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiServerError, apiValidationError, apiError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';
import { hasPermission } from '@/lib/auth/rbac';

// =============================================================
// GET /api/dashboard/attendance
// List attendance records for a user in a given month.
// Query params: ?username=X&month=YYYY-MM
// =============================================================
export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiPermission('attendance.view');
    if (isApiError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const canManage = hasPermission(auth.pyraUser.rolePermissions, 'attendance.manage');

    // Determine target username
    let username = searchParams.get('username') || auth.pyraUser.username;
    // Non-admins can only view their own attendance
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

    const { data, error } = await supabase
      .from('pyra_attendance')
      .select('id, username, date, clock_in, clock_out, total_hours, status, notes, ip_address, created_at')
      .eq('username', username)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

    if (error) return apiServerError(error.message);
    return apiSuccess(data || []);
  } catch (err) {
    console.error('GET /api/dashboard/attendance error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/dashboard/attendance
// Clock in for today.
// Body: { notes? }
// =============================================================
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('attendance.view');
    if (isApiError(auth)) return auth;

    const body = await req.json().catch(() => ({}));
    const notes = body.notes || null;

    const username = auth.pyraUser.username;
    const supabase = createServiceRoleClient();

    // Get today's date in YYYY-MM-DD format (UAE timezone = UTC+4)
    const nowUtc = new Date();
    const uaeOffset = 4 * 60 * 60 * 1000;
    const uaeNow = new Date(nowUtc.getTime() + uaeOffset);
    const today = uaeNow.toISOString().slice(0, 10);

    // Check if already clocked in today
    const { data: existing } = await supabase
      .from('pyra_attendance')
      .select('id, clock_in, clock_out')
      .eq('username', username)
      .eq('date', today)
      .maybeSingle();

    if (existing) {
      return apiError('لقد سجلت الدخول مسبقاً اليوم', 409);
    }

    // Get user's work schedule
    const { data: userRecord } = await supabase
      .from('pyra_users')
      .select('work_schedule_id')
      .eq('username', username)
      .single();

    let scheduleStartTime = '09:00';

    if (userRecord?.work_schedule_id) {
      const { data: schedule } = await supabase
        .from('pyra_work_schedules')
        .select('start_time')
        .eq('id', userRecord.work_schedule_id)
        .single();
      if (schedule) {
        scheduleStartTime = schedule.start_time;
      }
    } else {
      // Use default schedule
      const { data: defaultSchedule } = await supabase
        .from('pyra_work_schedules')
        .select('start_time')
        .eq('is_default', true)
        .maybeSingle();
      if (defaultSchedule) {
        scheduleStartTime = defaultSchedule.start_time;
      }
    }

    // Determine status based on clock_in vs schedule start_time using numeric comparison
    const clockInTime = uaeNow.toTimeString().slice(0, 5); // HH:MM
    const [sh, sm] = scheduleStartTime.split(':').map(Number);
    const [ch, cm] = clockInTime.split(':').map(Number);
    const isLate = ch * 60 + cm > sh * 60 + sm;
    const status = isLate ? 'late' : 'present';

    // Get IP address from headers
    const forwarded = req.headers.get('x-forwarded-for');
    const ip_address = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || null;

    const id = generateId('att');

    const { data, error } = await supabase
      .from('pyra_attendance')
      .insert({
        id,
        username,
        date: today,
        clock_in: nowUtc.toISOString(),
        clock_out: null,
        total_hours: 0,
        status,
        notes,
        ip_address,
      })
      .select()
      .single();

    if (error) return apiServerError(error.message);
    return apiSuccess(data, undefined, 201);
  } catch (err) {
    console.error('POST /api/dashboard/attendance error:', err);
    return apiServerError();
  }
}
