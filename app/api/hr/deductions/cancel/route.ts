import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiError,
  apiNotFound,
  apiServerError,
  apiSuccess,
  apiValidationError,
} from '@/lib/api/response';
import { logActivity, ACTIVITY_ACTIONS, ENTITY_TYPES } from '@/lib/api/activity';
import { PAYROLL_RPC_STATUS } from '@/lib/constants/payroll';
import { logError } from '@/lib/observability/log-error';
import { createServiceRoleClient } from '@/lib/supabase/server';

interface CancellationRpcResult {
  status: string;
  changed: boolean;
  payment_data: Record<string, unknown> | null;
  run_data: Record<string, unknown> | null;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiPermission('hr.manage');
  if (isApiError(auth)) return auth;

  try {
    const t = await getTranslations('api');
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const paymentId = typeof body?.payment_id === 'string' ? body.payment_id.trim() : '';
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

    if (!paymentId || paymentId.length > 20 || !reason || reason.length > 2000) {
      return apiValidationError(t('deductions.cancellation.invalidPayload'));
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('pyra_cancel_employee_deduction', {
      p_payment_id: paymentId,
      p_cancelled_by: auth.pyraUser.username,
      p_reason: reason,
    });

    if (error) {
      logError({
        error,
        request: req,
        user: { id: auth.pyraUser.username },
        metadata: { route: 'hr/deductions/cancel', step: 'atomic-cancellation' },
      });
      return apiServerError();
    }

    const result = (Array.isArray(data) ? data[0] : data) as CancellationRpcResult | null;
    if (!result) return apiServerError();

    if (result.status === PAYROLL_RPC_STATUS.NOT_FOUND) {
      return apiNotFound(t('deductions.cancellation.notFound'));
    }
    if (result.status === PAYROLL_RPC_STATUS.INVALID_PAYLOAD) {
      return apiValidationError(t('deductions.cancellation.invalidPayload'));
    }
    if ([
      PAYROLL_RPC_STATUS.ALREADY_PAID,
      PAYROLL_RPC_STATUS.CLOSED_PERIOD,
      PAYROLL_RPC_STATUS.PAYMENT_LINKED_TO_CLOSED_RUN,
    ].includes(result.status as 'already_paid' | 'closed_period' | 'payment_linked_to_closed_run')) {
      return apiError(t('deductions.cancellation.closedPayroll'), 409);
    }
    if ([
      PAYROLL_RPC_STATUS.INVALID_STATUS,
      PAYROLL_RPC_STATUS.INTEGRITY_CONFLICT,
      PAYROLL_RPC_STATUS.STATE_CHANGED,
    ].includes(result.status as 'invalid_status' | 'integrity_conflict' | 'state_changed')) {
      return apiError(t('deductions.cancellation.stateChanged'), 409);
    }
    if (result.status === PAYROLL_RPC_STATUS.ALREADY_CANCELLED) {
      return apiSuccess(
        { payment: result.payment_data, payroll_run: result.run_data },
        { idempotent: true, payroll_recalculation_required: false },
      );
    }
    if (result.status !== PAYROLL_RPC_STATUS.OK || !result.payment_data) {
      return apiServerError();
    }

    if (result.changed) {
      logActivity(
        auth.pyraUser.username,
        auth.pyraUser.display_name,
        `${ENTITY_TYPES.DEDUCTION}_${ACTIVITY_ACTIONS.REJECT}`,
        '/dashboard/hr/deductions',
        {
          payment_id: paymentId,
          employee_username: result.payment_data.username ?? null,
          effective_month: result.payment_data.effective_month ?? null,
          reason,
          payroll_recalculation_required: result.run_data !== null,
          source: 'employee_deduction_cancelled',
        },
        req.headers.get('x-forwarded-for') || 'unknown',
      );
    }

    return apiSuccess(
      { payment: result.payment_data, payroll_run: result.run_data },
      {
        idempotent: !result.changed,
        payroll_recalculation_required: result.run_data !== null,
      },
    );
  } catch (error) {
    logError({
      error,
      request: req,
      metadata: { route: 'hr/deductions/cancel', method: 'POST' },
    });
    return apiServerError();
  }
}
