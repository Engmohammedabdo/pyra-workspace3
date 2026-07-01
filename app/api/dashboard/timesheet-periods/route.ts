import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { hasPermission } from '@/lib/auth/rbac';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiPermission('timesheet.view');
    if (isApiError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    // User-scoping: non-managers can only see their own timesheet periods
    const canManage = hasPermission(auth.pyraUser.rolePermissions, 'timesheet.manage');
    let targetUsername = searchParams.get('username');
    if (!canManage) targetUsername = auth.pyraUser.username;

    // Gate-then-service-role (Gap #3 Phase 5): requireApiPermission checked above;
    // service-role bypasses RLS — user scope enforced explicitly via targetUsername below.
    const supabase = createServiceRoleClient();
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

  } catch (err) {
    console.error('[GET /api/dashboard/timesheet-periods] error:', err);
    return apiServerError();
  }
}

export async function POST(req: NextRequest) {
  try {
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
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.TIMESHEET}_${ACTIVITY_ACTIONS.CREATE}`,
      '/dashboard/timesheet',
      { period_id: data?.id, period_type: period_type || 'weekly', start_date, end_date, source: 'timesheet_period_created' },
      req.headers.get('x-forwarded-for') || 'unknown',
    );

    return apiSuccess(data, undefined, 201);

  } catch (err) {
    console.error('[POST /api/dashboard/timesheet-periods] error:', err);
    return apiServerError();
  }
}
