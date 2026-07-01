import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, apiServerError, apiValidationError } from '@/lib/api/response';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';

// =============================================================
// PATCH /api/dashboard/work-schedules/[id]
// Update an existing work schedule.
// =============================================================
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiPermission('attendance.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const body = await req.json();
    const {
      name,
      name_ar,
      work_days,
      start_time,
      end_time,
      break_minutes,
      daily_hours,
      overtime_multiplier,
      weekend_multiplier,
      is_default,
    } = body;

    // Validate required fields
    if (!name || !name_ar) {
      return apiValidationError('الاسم والاسم العربي مطلوبان');
    }

    // Validate work_days — if provided it must be a non-empty array of valid
    // day numbers (0-6); empty [] is rejected (a schedule with no working days
    // is meaningless).
    if (
      work_days !== undefined && work_days !== null &&
      (!Array.isArray(work_days) || work_days.length === 0 || work_days.some((d: number) => d < 0 || d > 6))
    ) {
      return apiValidationError('أيام العمل غير صالحة');
    }
    if (start_time && !/^\d{2}:\d{2}$/.test(start_time)) {
      return apiValidationError('صيغة وقت البداية غير صالحة');
    }
    if (end_time && !/^\d{2}:\d{2}$/.test(end_time)) {
      return apiValidationError('صيغة وقت النهاية غير صالحة');
    }

    const supabase = createServiceRoleClient();

    // Guard: don't allow unsetting the LAST default — attendance late-calc would
    // silently fall back to the hard-coded 09:00 for every unassigned employee.
    if (is_default === false) {
      const { data: current } = await supabase
        .from('pyra_work_schedules')
        .select('is_default')
        .eq('id', id)
        .single();
      if (current?.is_default) {
        return apiError('لا يمكن إلغاء الجدول الافتراضي — عيّن جدولاً افتراضياً آخر أولاً', 400);
      }
    }

    // If setting as default, first clear is_default on all other rows
    if (is_default === true) {
      const { error: clearError } = await supabase
        .from('pyra_work_schedules')
        .update({ is_default: false })
        .neq('id', id);

      if (clearError) {
        console.error('PATCH /api/dashboard/work-schedules/[id] clear default error:', clearError);
        return apiServerError(clearError.message);
      }
    }

    const updatePayload: Record<string, unknown> = {
      name,
      name_ar,
    };
    if (work_days !== undefined) updatePayload.work_days = work_days;
    if (start_time !== undefined) updatePayload.start_time = start_time;
    if (end_time !== undefined) updatePayload.end_time = end_time;
    if (break_minutes !== undefined) updatePayload.break_minutes = break_minutes;
    if (daily_hours !== undefined) updatePayload.daily_hours = daily_hours;
    if (overtime_multiplier !== undefined) updatePayload.overtime_multiplier = overtime_multiplier;
    if (weekend_multiplier !== undefined) updatePayload.weekend_multiplier = weekend_multiplier;
    if (is_default !== undefined) updatePayload.is_default = is_default;

    const { data, error } = await supabase
      .from('pyra_work_schedules')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) return apiServerError(error.message);
    if (!data) return apiError('الجدول غير موجود', 404);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.WORK_SCHEDULE}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/hr/work-schedules`,
      { schedule_id: id, name, source: 'work_schedule_updated' },
      req.headers.get('x-forwarded-for') || 'unknown',
    );

    return apiSuccess(data);
  } catch (err) {
    console.error('PATCH /api/dashboard/work-schedules/[id] error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/dashboard/work-schedules/[id]
// Delete a work schedule if not in use and not the default.
// =============================================================
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiPermission('attendance.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // Fetch the schedule to check is_default
    const { data: schedule, error: fetchError } = await supabase
      .from('pyra_work_schedules')
      .select('id, name, is_default')
      .eq('id', id)
      .single();

    if (fetchError || !schedule) {
      return apiError('الجدول غير موجود', 404);
    }

    // Block delete if it is the default schedule
    if (schedule.is_default) {
      return apiError('لا يمكن حذف الجدول الافتراضي', 400);
    }

    // Block delete if any users are assigned to this schedule
    const { count, error: usersError } = await supabase
      .from('pyra_users')
      .select('username', { count: 'exact', head: true })
      .eq('work_schedule_id', id);

    if (usersError) {
      console.error('DELETE /api/dashboard/work-schedules/[id] users check error:', usersError);
      return apiServerError(usersError.message);
    }

    if (count && count > 0) {
      return apiError(
        `الجدول مستخدم لـ ${count} موظف، أعد تعيينهم أولاً`,
        409,
      );
    }

    // Safe to delete
    const { error: deleteError } = await supabase
      .from('pyra_work_schedules')
      .delete()
      .eq('id', id);

    if (deleteError) return apiServerError(deleteError.message);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.WORK_SCHEDULE}_${ACTIVITY_ACTIONS.DELETE}`,
      `/dashboard/hr/work-schedules`,
      { schedule_id: id, name: schedule.name, source: 'work_schedule_deleted' },
      req.headers.get('x-forwarded-for') || 'unknown',
    );

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/dashboard/work-schedules/[id] error:', err);
    return apiServerError();
  }
}
