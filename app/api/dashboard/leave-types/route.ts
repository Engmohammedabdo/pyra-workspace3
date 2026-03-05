import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';

// =============================================================
// GET /api/dashboard/leave-types
// List all active leave types, sorted by sort_order.
// =============================================================
export async function GET() {
  try {
    const auth = await requireApiPermission('leave.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_leave_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) return apiServerError(error.message);
    return apiSuccess(data);
  } catch (err) {
    console.error('GET /api/dashboard/leave-types error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/dashboard/leave-types
// Create a new leave type.
// =============================================================
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('leave.manage');
    if (isApiError(auth)) return auth;

    const body = await req.json();
    const { name, name_ar, icon, color, default_days, max_carry_over, requires_attachment, is_paid, sort_order } = body;

    // Validate required fields
    if (!name || !name_ar || default_days == null) {
      return apiValidationError('الاسم والاسم العربي وعدد الأيام الافتراضي مطلوبة');
    }

    const supabase = createServiceRoleClient();

    const id = generateId('lt');

    const { data, error } = await supabase
      .from('pyra_leave_types')
      .insert({
        id,
        name,
        name_ar,
        icon: icon || 'CalendarOff',
        color: color || 'orange',
        default_days: Number(default_days),
        max_carry_over: Number(max_carry_over) || 0,
        requires_attachment: requires_attachment ?? false,
        is_paid: is_paid ?? true,
        is_active: true,
        sort_order: sort_order ?? 0,
      })
      .select()
      .single();

    if (error) return apiServerError(error.message);
    return apiSuccess(data, undefined, 201);
  } catch (err) {
    console.error('POST /api/dashboard/leave-types error:', err);
    return apiServerError();
  }
}
