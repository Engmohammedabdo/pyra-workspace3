import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, logActivity } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { dubaiDayKey } from '@/lib/utils/format';

const DATE_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function isCalendarDate(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiPermission('hr.manage');
  if (isApiError(auth)) return auth;
  const t = await getTranslations('api');

  try {
    const body = await request.json().catch(() => ({}));
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const startedOn = typeof body?.started_on === 'string' ? body.started_on.trim() : '';
    if (!username || !isCalendarDate(startedOn) || startedOn > dubaiDayKey()) {
      return apiError(t('deductions.attendanceTrackingInvalid'), 422);
    }

    const supabase = createServiceRoleClient();
    const { data: employee, error: employeeError } = await supabase
      .from('pyra_users')
      .select(
        'username, role, status, hire_date, attendance_tracking_started_on, attendance_tracking_start_source',
      )
      .eq('username', username)
      .maybeSingle();
    if (employeeError) {
      logError({
        error: employeeError,
        request,
        metadata: { action: 'attendance_tracking_employee_lookup', username },
      });
      return apiError(t('deductions.attendanceTrackingLoadFailed'), 500);
    }
    if (!employee || employee.role !== 'employee' || employee.status !== 'active') {
      return apiError(t('deductions.employeeNotFound'), 404);
    }
    if (employee.attendance_tracking_started_on
      || employee.attendance_tracking_start_source) {
      return apiError(t('deductions.attendanceTrackingAlreadyDocumented'), 409);
    }
    const hireDate = employee.hire_date ? String(employee.hire_date).slice(0, 10) : null;
    if (hireDate && startedOn < hireDate) {
      return apiError(t('deductions.attendanceTrackingBeforeHire'), 422);
    }

    const { data: updated, error: updateError } = await supabase
      .from('pyra_users')
      .update({
        attendance_tracking_started_on: startedOn,
        attendance_tracking_start_source: 'admin',
      })
      .eq('username', username)
      .is('attendance_tracking_started_on', null)
      .is('attendance_tracking_start_source', null)
      .select(
        'username, attendance_tracking_started_on, attendance_tracking_start_source',
      )
      .maybeSingle();
    if (updateError) {
      logError({
        error: updateError,
        request,
        metadata: { action: 'attendance_tracking_update', username, startedOn },
      });
      return apiError(t('deductions.attendanceTrackingUpdateFailed'), 500);
    }
    if (!updated) {
      return apiError(t('deductions.attendanceTrackingAlreadyDocumented'), 409);
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name ?? auth.pyraUser.username,
      `${ENTITY_TYPES.USER}_${ACTIVITY_ACTIONS.UPDATE}`,
      '/dashboard/hr/deductions',
      {
        source: 'attendance_tracking_start_admin',
        username,
        started_on: startedOn,
      },
      request.headers.get('x-forwarded-for') ?? undefined,
    );

    return apiSuccess(updated);
  } catch (error) {
    logError({
      error,
      request,
      metadata: { action: 'attendance_tracking_start' },
    });
    return apiError(t('deductions.attendanceTrackingUpdateFailed'), 500);
  }
}
