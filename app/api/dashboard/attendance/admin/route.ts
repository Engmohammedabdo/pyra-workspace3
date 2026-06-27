import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { generateId } from '@/lib/utils/id';

// =============================================================
// POST /api/dashboard/attendance/admin
// Admin: create or correct any employee's attendance for a given date.
// Body: { username, date, clock_in?, clock_out?, status, notes? }
// Gate: attendance.manage (admin only)
// =============================================================
export async function POST(request: NextRequest) {
  // 1. Permission gate first — service-role client only after auth confirmed.
  const auth = await requireApiPermission('attendance.manage');
  if (isApiError(auth)) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const {
      username,
      date,
      clock_in = null,
      clock_out = null,
      status,
      notes = null,
    } = body ?? {};

    // 2. Validate required fields.
    if (!username || !date || !status) {
      return apiError('الموظف والتاريخ والحالة مطلوبة', 422);
    }

    // 3. Recompute total_hours when both timestamps present.
    let total_hours = 0;
    if (clock_in && clock_out) {
      total_hours = Math.max(
        0,
        (new Date(clock_out).getTime() - new Date(clock_in).getTime()) / 3_600_000,
      );
      total_hours = Math.round(total_hours * 100) / 100;
    }

    // 4. Service-role client (bypasses RLS — attendance is service-role-only per Gap #3).
    const supabase = createServiceRoleClient();

    // 5. Upsert: update if row exists, insert otherwise.
    const { data: existing } = await supabase
      .from('pyra_attendance')
      .select('id')
      .eq('username', username)
      .eq('date', date)
      .maybeSingle();

    let row;
    if (existing) {
      const { data, error } = await supabase
        .from('pyra_attendance')
        .update({ clock_in, clock_out, status, notes, total_hours })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) return apiError('فشل تحديث سجل الحضور', 500);
      row = data;
    } else {
      const { data, error } = await supabase
        .from('pyra_attendance')
        .insert({
          id: generateId('att'),
          username,
          date,
          clock_in,
          clock_out,
          status,
          notes,
          total_hours,
        })
        .select()
        .single();
      if (error) return apiError('فشل إنشاء سجل الحضور', 500);
      row = data;
    }

    // 6. Fire-and-forget activity log.
    const ip = request.headers.get('x-forwarded-for') ?? undefined;
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name ?? auth.pyraUser.username,
      `${ENTITY_TYPES.USER}_${ACTIVITY_ACTIONS.UPDATE}`,
      '/dashboard/attendance',
      { source: 'admin_attendance_edit', username, date, status },
      ip,
    );

    return apiSuccess(row);
  } catch (err) {
    return apiServerError('خطأ في تعديل الحضور', err, request);
  }
}
