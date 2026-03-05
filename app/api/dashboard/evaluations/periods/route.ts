import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// =============================================================
// GET /api/dashboard/evaluations/periods
// List all evaluation periods, ordered by start_date DESC.
// =============================================================
export async function GET(_req: NextRequest) {
  try {
    const auth = await requireApiPermission('evaluations.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_evaluation_periods')
      .select('*')
      .order('start_date', { ascending: false });

    if (error) return apiServerError(error.message);
    return apiSuccess(data || []);
  } catch (err) {
    console.error('GET /api/dashboard/evaluations/periods error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/dashboard/evaluations/periods
// Create a new evaluation period.
// Body: { name, name_ar, start_date, end_date }
// =============================================================
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('evaluations.manage');
    if (isApiError(auth)) return auth;

    const body = await req.json().catch(() => ({}));
    const { name, name_ar, start_date, end_date } = body;

    if (!name || !name_ar || !start_date || !end_date) {
      return apiValidationError('جميع الحقول مطلوبة: الاسم، الاسم بالعربية، تاريخ البداية، تاريخ النهاية');
    }

    if (new Date(start_date) >= new Date(end_date)) {
      return apiValidationError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
    }

    const supabase = createServiceRoleClient();
    const id = generateId('evp');

    const { data, error } = await supabase
      .from('pyra_evaluation_periods')
      .insert({
        id,
        name,
        name_ar,
        start_date,
        end_date,
        status: 'draft',
        created_by: auth.pyraUser.username,
      })
      .select()
      .single();

    if (error) return apiServerError(error.message);
    return apiSuccess(data, undefined, 201);
  } catch (err) {
    console.error('POST /api/dashboard/evaluations/periods error:', err);
    return apiServerError();
  }
}
