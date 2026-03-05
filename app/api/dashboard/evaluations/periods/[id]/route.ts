import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

// =============================================================
// PATCH /api/dashboard/evaluations/periods/[id]
// Update an evaluation period (status, name, dates).
// Body: { status?, name?, name_ar?, start_date?, end_date? }
// =============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('evaluations.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const supabase = createServiceRoleClient();

    // Verify the period exists
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_evaluation_periods')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('فترة التقييم غير موجودة');
    }

    // Validate status if provided
    if (body.status && !['draft', 'active', 'closed'].includes(body.status)) {
      return apiValidationError('الحالة غير صالحة — يجب أن تكون: draft, active, closed');
    }

    // Validate dates if provided
    if (body.start_date && body.end_date && new Date(body.start_date) >= new Date(body.end_date)) {
      return apiValidationError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
    }

    // Build update object
    const updates: Record<string, unknown> = {};
    if (body.status) updates.status = body.status;
    if (body.name) updates.name = body.name;
    if (body.name_ar) updates.name_ar = body.name_ar;
    if (body.start_date) updates.start_date = body.start_date;
    if (body.end_date) updates.end_date = body.end_date;

    if (Object.keys(updates).length === 0) {
      return apiValidationError('لا توجد بيانات للتحديث');
    }

    const { data, error } = await supabase
      .from('pyra_evaluation_periods')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return apiServerError(error.message);
    return apiSuccess(data);
  } catch (err) {
    console.error('PATCH /api/dashboard/evaluations/periods/[id] error:', err);
    return apiServerError();
  }
}
