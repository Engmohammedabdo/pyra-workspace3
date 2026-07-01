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
import { EMPLOYEE_PAYMENT_STATUS } from '@/lib/constants/statuses';
import { logError } from '@/lib/observability/log-error';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { notify } from '@/lib/notifications/notify';

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
      if (payment.status !== EMPLOYEE_PAYMENT_STATUS.PENDING) {
        return apiError('لا يمكن الموافقة — الحالة الحالية ليست "معلّق"', 409);
      }

      const { data, error } = await supabase
        .from('pyra_employee_payments')
        .update({
          status: EMPLOYEE_PAYMENT_STATUS.APPROVED,
          approved_by: auth.pyraUser.username,
          approved_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, pyra_users(display_name)')
        .single();

      if (error) return apiServerError(error.message);

      // Activity log
      logActivity(
        auth.pyraUser.username,
        auth.pyraUser.display_name,
        `${ENTITY_TYPES.EMPLOYEE_PAYMENT}_${ACTIVITY_ACTIONS.UPDATE}`,
        '/dashboard/payroll',
        { payment_id: id, status: 'approved', source: 'employee_payment_updated' },
        req.headers.get('x-forwarded-for') || 'unknown',
      );

      // Notify the employee their payment was approved
      await notify(supabase, {
        to: payment.username,
        type: 'employee_payment_approved',
        title: 'تم اعتماد دفعة لك',
        message: `${payment.description || payment.source_type}: ${payment.amount} ${payment.currency || 'AED'}`,
        link: '/dashboard/my-payslips',
        entity: { type: 'employee_payment', id },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });

      return apiSuccess(data);
    }

    if (action === 'pay') {
      // Can only pay approved payments
      if (payment.status !== EMPLOYEE_PAYMENT_STATUS.APPROVED) {
        return apiError('لا يمكن الدفع — يجب الموافقة على السجل أولاً', 409);
      }

      const { data, error } = await supabase
        .from('pyra_employee_payments')
        .update({
          status: EMPLOYEE_PAYMENT_STATUS.PAID,
          paid_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, pyra_users(display_name)')
        .single();

      if (error) return apiServerError(error.message);

      // Settle the source task when this is a task payment
      if (payment.source_type === 'task' && payment.source_id) {
        const { error: taskErr } = await supabase
          .from('pyra_tasks')
          .update({ payment_status: EMPLOYEE_PAYMENT_STATUS.PAID, updated_at: new Date().toISOString() })
          .eq('id', payment.source_id);
        if (taskErr) logError({ error: taskErr, request: req, metadata: { route: 'employee-payments/pay', step: 'propagate-task', payment_id: id } });
      }

      // Activity log
      logActivity(
        auth.pyraUser.username,
        auth.pyraUser.display_name,
        `${ENTITY_TYPES.EMPLOYEE_PAYMENT}_${ACTIVITY_ACTIONS.UPDATE}`,
        '/dashboard/payroll',
        { payment_id: id, status: 'paid', source: 'employee_payment_updated' },
        req.headers.get('x-forwarded-for') || 'unknown',
      );

      // Notify the employee their payment was paid
      await notify(supabase, {
        to: payment.username,
        type: 'employee_payment_paid',
        title: 'تم صرف دفعة لك',
        message: `${payment.description || payment.source_type}: ${payment.amount} ${payment.currency || 'AED'}`,
        link: '/dashboard/my-payslips',
        entity: { type: 'employee_payment', id },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });

      return apiSuccess(data);
    }

    return apiValidationError('إجراء غير معروف');
  } catch (err) {
    logError({ error: err, request: req, metadata: { route: 'employee-payments/[id]' } });
    console.error('PATCH /api/dashboard/employee-payments/[id] error:', err);
    return apiServerError();
  }
}
