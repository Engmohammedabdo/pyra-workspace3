import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';

// =============================================================
// GET /api/dashboard/work-schedules
// List all work schedules.
// =============================================================
export async function GET() {
  try {
    const auth = await requireApiPermission('attendance.manage');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_work_schedules')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name', { ascending: true });

    if (error) return apiServerError(error.message);
    return apiSuccess(data || []);
  } catch (err) {
    console.error('GET /api/dashboard/work-schedules error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/dashboard/work-schedules
// Create a new work schedule.
// =============================================================
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('attendance.manage');
    if (isApiError(auth)) return auth;

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
    } = body;

    // Validate required fields
    if (!name || !name_ar) {
      return apiValidationError('الاسم والاسم العربي مطلوبان');
    }

    const supabase = createServiceRoleClient();
    const id = generateId('ws');

    const { data, error } = await supabase
      .from('pyra_work_schedules')
      .insert({
        id,
        name,
        name_ar,
        work_days: work_days || [0, 1, 2, 3, 4],
        start_time: start_time || '09:00',
        end_time: end_time || '18:00',
        break_minutes: break_minutes ?? 60,
        daily_hours: daily_hours ?? 8,
        overtime_multiplier: overtime_multiplier ?? 1.5,
        weekend_multiplier: weekend_multiplier ?? 2.0,
        is_default: false,
      })
      .select()
      .single();

    if (error) return apiServerError(error.message);
    return apiSuccess(data, undefined, 201);
  } catch (err) {
    console.error('POST /api/dashboard/work-schedules error:', err);
    return apiServerError();
  }
}
