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
import { logError } from '@/lib/observability/log-error';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { notify } from '@/lib/notifications/notify';
import { EMPLOYEE_PAYMENT_SOURCE_TYPE, PAYROLL_RPC_STATUS } from '@/lib/constants/payroll';

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
      .maybeSingle();

    if (fetchError) return apiServerError();
    if (!payment) {
      return apiNotFound('سجل الدفع غير موجود');
    }

    if (action === 'approve') {
      if (payment.source_type === EMPLOYEE_PAYMENT_SOURCE_TYPE.DEDUCTION) {
        return apiError('الخصومات تُعتمد فقط من مراجعة الخصومات الموثقة', 409); // i18n-exempt: legacy dashboard API response outside MIGRATED_PATHS
      }

      const { data: rpcRows, error: rpcError } = await supabase
        .rpc('pyra_approve_employee_payment', {
          p_payment_id: id,
          p_approved_by: auth.pyraUser.username,
        });
      if (rpcError) {
        logError({
          error: rpcError,
          request: req,
          metadata: { route: 'employee-payments/approve', step: 'atomic-approve', payment_id: id },
        });
        return apiServerError();
      }
      const result = (Array.isArray(rpcRows) ? rpcRows[0] : rpcRows) as {
        status: string;
        changed: boolean;
        payment_data: Record<string, unknown> | null;
      } | null;
      if (!result) return apiServerError();
      if (result.status === PAYROLL_RPC_STATUS.NOT_FOUND) return apiNotFound('سجل الدفع غير موجود');
      if (result.status === PAYROLL_RPC_STATUS.DIRECT_PAY_DISALLOWED) {
        return apiError('الخصومات تُعتمد فقط من مراجعة الخصومات الموثقة', 409); // i18n-exempt: legacy dashboard API response outside MIGRATED_PATHS
      }
      if (result.status === PAYROLL_RPC_STATUS.CLOSED_PERIOD) {
        return apiError('لا يمكن اعتماد الدفعة بعد اعتماد أو صرف مسير رواتب الشهر', 409); // i18n-exempt: legacy dashboard API response outside MIGRATED_PATHS
      }
      if (result.status === PAYROLL_RPC_STATUS.INVALID_STATUS
        || result.status === PAYROLL_RPC_STATUS.INTEGRITY_CONFLICT) {
        return apiError('لا يمكن اعتماد الدفعة بسبب تعارض في حالتها أو فترة الرواتب', 409); // i18n-exempt: legacy dashboard API response outside MIGRATED_PATHS
      }
      if (result.status !== PAYROLL_RPC_STATUS.OK
        && result.status !== PAYROLL_RPC_STATUS.ALREADY_APPROVED) return apiServerError();
      if (!result.payment_data) return apiServerError();
      const data = result.payment_data;

      // Activity log
      if (result.changed) {
        logActivity(
          auth.pyraUser.username,
          auth.pyraUser.display_name,
          `${ENTITY_TYPES.EMPLOYEE_PAYMENT}_${ACTIVITY_ACTIONS.UPDATE}`,
          '/dashboard/payroll',
          { payment_id: id, status: 'approved', source: 'employee_payment_updated' },
          req.headers.get('x-forwarded-for') || 'unknown',
        );
      }

      // Notify the employee their payment was approved
      if (result.changed) {
        await notify(supabase, {
          to: String(data.username),
          type: 'employee_payment_approved',
          title: 'تم اعتماد دفعة لك',
          message: `${data.description || data.source_type}: ${data.amount} ${data.currency || 'AED'}`,
          link: '/dashboard/my-payslips',
          entity: { type: 'employee_payment', id },
          from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
        });
      }

      return apiSuccess(data, { idempotent: !result.changed });
    }

    if (action === 'pay') {
      const { data: rpcRows, error: rpcError } = await supabase
        .rpc('pyra_pay_employee_payment', { p_payment_id: id });
      if (rpcError) {
        logError({ error: rpcError, request: req, metadata: { route: 'employee-payments/pay', step: 'atomic-pay', payment_id: id } });
        return apiServerError();
      }
      const result = (Array.isArray(rpcRows) ? rpcRows[0] : rpcRows) as {
        status: string;
        changed: boolean;
        payment_data: Record<string, unknown> | null;
      } | null;
      if (!result) return apiServerError();
      if (result.status === PAYROLL_RPC_STATUS.NOT_FOUND) return apiNotFound('سجل الدفع غير موجود');
      if (result.status === PAYROLL_RPC_STATUS.PAYMENT_LINKED) {
        return apiError('لا يمكن صرف دفعة مرتبطة بمسير رواتب بشكل منفصل', 409); // i18n-exempt: legacy dashboard API response outside MIGRATED_PATHS
      }
      if (result.status === PAYROLL_RPC_STATUS.DIRECT_PAY_DISALLOWED) {
        return apiError('لا يمكن صرف الخصم مباشرة — يُصرف فقط ضمن مسير الرواتب', 409); // i18n-exempt: legacy dashboard API response outside MIGRATED_PATHS
      }
      if (result.status === PAYROLL_RPC_STATUS.INVALID_STATUS
        || result.status === PAYROLL_RPC_STATUS.INTEGRITY_CONFLICT) {
        return apiError('لا يمكن صرف الدفعة بسبب تعارض في حالتها أو مصدرها', 409); // i18n-exempt: legacy dashboard API response outside MIGRATED_PATHS
      }
      if (result.status !== PAYROLL_RPC_STATUS.OK
        && result.status !== PAYROLL_RPC_STATUS.ALREADY_PAID) return apiServerError();
      if (!result.payment_data) return apiServerError();
      const data = result.payment_data;

      // Activity log
      if (result.changed) {
        logActivity(
          auth.pyraUser.username,
          auth.pyraUser.display_name,
          `${ENTITY_TYPES.EMPLOYEE_PAYMENT}_${ACTIVITY_ACTIONS.UPDATE}`,
          '/dashboard/payroll',
          { payment_id: id, status: 'paid', source: 'employee_payment_updated' },
          req.headers.get('x-forwarded-for') || 'unknown',
        );
      }

      // Notify the employee their payment was paid
      if (result.changed) {
        await notify(supabase, {
          to: String(data.username),
          type: 'employee_payment_paid',
          title: 'تم صرف دفعة لك',
          message: `${data.description || data.source_type}: ${data.amount} ${data.currency || 'AED'}`,
          link: '/dashboard/my-payslips',
          entity: { type: 'employee_payment', id },
          from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
        });
      }

      return apiSuccess(data, { idempotent: !result.changed });
    }

    return apiValidationError('إجراء غير معروف');
  } catch (err) {
    logError({ error: err, request: req, metadata: { route: 'employee-payments/[id]' } });
    console.error('PATCH /api/dashboard/employee-payments/[id] error:', err);
    return apiServerError();
  }
}
