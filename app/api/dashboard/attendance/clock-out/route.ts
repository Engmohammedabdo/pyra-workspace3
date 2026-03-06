import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiServerError, apiError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';

// =============================================================
// POST /api/dashboard/attendance/clock-out
// Clock out for today.
// Body: { notes? }
// =============================================================
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('attendance.manage');
    if (isApiError(auth)) return auth;

    const body = await req.json().catch(() => ({}));
    const notes = body.notes || null;

    const username = auth.pyraUser.username;
    const supabase = createServiceRoleClient();

    // Get today's date in UAE timezone
    const nowUtc = new Date();
    const uaeOffset = 4 * 60 * 60 * 1000;
    const uaeNow = new Date(nowUtc.getTime() + uaeOffset);
    const today = uaeNow.toISOString().slice(0, 10);

    // Find today's attendance record
    const { data: existing } = await supabase
      .from('pyra_attendance')
      .select('id, clock_in, clock_out')
      .eq('username', username)
      .eq('date', today)
      .maybeSingle();

    if (!existing) {
      return apiError('لم تسجل الدخول اليوم بعد', 404);
    }

    if (existing.clock_out) {
      return apiError('لقد سجلت الانصراف مسبقاً', 409);
    }

    // Calculate total hours
    const clockInTime = new Date(existing.clock_in!);
    const clockOutTime = nowUtc;
    const diffMs = clockOutTime.getTime() - clockInTime.getTime();
    const totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100; // Round to 2 decimals

    // Build update payload
    const updatePayload: Record<string, unknown> = {
      clock_out: nowUtc.toISOString(),
      total_hours: totalHours,
    };

    // Append notes if provided
    if (notes) updatePayload.notes = notes;

    const { data, error } = await supabase
      .from('pyra_attendance')
      .update(updatePayload)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) return apiServerError(error.message);

    // Activity log
    const { error: logErr } = await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'attendance_clock_out',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: '/dashboard/attendance',
      details: { date: today, total_hours: totalHours },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });
    if (logErr) console.error('Activity log error:', logErr);

    return apiSuccess(data);
  } catch (err) {
    console.error('POST /api/dashboard/attendance/clock-out error:', err);
    return apiServerError();
  }
}
