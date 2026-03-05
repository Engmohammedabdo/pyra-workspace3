import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiServerError,
  apiNotFound,
  apiValidationError,
  apiError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

// =============================================================
// PATCH /api/dashboard/employee-payments/[id]
// Approve or mark an employee payment as paid.
// Body: { action: 'approve' | 'pay' }
// =============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('payroll.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const body = await req.json();
    const { action } = body;

    if (!action || !['approve', 'pay'].includes(action)) {
      return apiValidationError('الإجراء غير صالح — يجب أن يكون approve أو pay');
    }

    const supabase = createServiceRoleClient();

    // Fetch the current payment
    const { data: payment, error: fetchError } = await supabase
      .from('pyra_employee_payments')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !payment) {
      return apiNotFound('سجل الدفع غير موجود');
    }

    if (action === 'approve') {
      // Can only approve pending payments
      if (payment.status !== 'pending') {
        return apiError('لا يمكن الموافقة — الحالة الحالية ليست "معلّق"', 409);
      }

      const { data, error } = await supabase
        .from('pyra_employee_payments')
        .update({
          status: 'approved',
          approved_by: auth.pyraUser.username,
          approved_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, pyra_users(display_name)')
        .single();

      if (error) return apiServerError(error.message);
      return apiSuccess(data);
    }

    if (action === 'pay') {
      // Can only pay approved payments
      if (payment.status !== 'approved') {
        return apiError('لا يمكن الدفع — يجب الموافقة على السجل أولاً', 409);
      }

      const { data, error } = await supabase
        .from('pyra_employee_payments')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, pyra_users(display_name)')
        .single();

      if (error) return apiServerError(error.message);
      return apiSuccess(data);
    }

    return apiValidationError('إجراء غير معروف');
  } catch (err) {
    console.error('PATCH /api/dashboard/employee-payments/[id] error:', err);
    return apiServerError();
  }
}
