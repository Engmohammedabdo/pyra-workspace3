import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiError, apiNotFound, apiServerError, apiSuccess, apiValidationError } from '@/lib/api/response';
import { logActivity, ACTIVITY_ACTIONS, ENTITY_TYPES } from '@/lib/api/activity';
import { buildComputedDeductionApprovalSnapshot } from '@/lib/hr/deduction-approval';
import { loadMonthlyDeductionsReport } from '@/lib/hr/deductions-report';
import { logError } from '@/lib/observability/log-error';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { dubaiDayKey } from '@/lib/utils/format';
import { generateId } from '@/lib/utils/id';
import type { PyraDeductionCase } from '@/types/database';

const PERIOD_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-01$/;

function rpcErrorCode(message: string): string | null {
  const codes = [
    'invalid_deduction_payload',
    'zero_deduction_not_approvable',
    'deduction_future_period',
    'deduction_current_period',
    'deduction_closed_period',
    'deduction_employee_state_conflict',
    'deduction_ambiguous_period',
    'deduction_currency_conflict',
    'deduction_cap_exhausted',
    'deduction_idempotency_conflict',
    'deduction_case_integrity_conflict',
  ];
  return codes.find((code) => message.includes(code)) ?? null;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiPermission('hr.manage');
  if (isApiError(auth)) return auth;

  try {
    const t = await getTranslations('api');
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const periodMonth = typeof body?.period_month === 'string' ? body.period_month.trim() : '';

    if (!username || username.length > 100 || !PERIOD_MONTH_PATTERN.test(periodMonth)) {
      return apiValidationError(t('deductions.computedApproval.invalidPayload'));
    }

    const requestInstant = new Date();
    const currentInstant = requestInstant.toISOString();
    const todayKey = dubaiDayKey(requestInstant);
    const currentMonth = todayKey.slice(0, 7);
    if (periodMonth !== `${currentMonth}-01`) {
      return apiError(t('deductions.computedApproval.currentMonthOnly'), 409);
    }

    const supabase = createServiceRoleClient();
    const report = await loadMonthlyDeductionsReport(supabase, {
      month: currentMonth,
      today_key: todayKey,
      current_instant: currentInstant,
      usernames: [username],
      include_unattributed: false,
    });
    const employee = report.employees.find((candidate) => candidate.username === username);
    if (!employee) return apiNotFound(t('deductions.computedApproval.employeeNotFound'));

    if (
      employee.existing_case?.payment
      && employee.integrity_blockers.length === 0
    ) {
      return apiSuccess(
        { deduction_case: employee.existing_case.case },
        { idempotent: true },
        200,
      );
    }

    let snapshot: ReturnType<typeof buildComputedDeductionApprovalSnapshot>;
    try {
      snapshot = buildComputedDeductionApprovalSnapshot(employee, report);
    } catch {
      return apiError(t('deductions.computedApproval.notApprovable'), 409);
    }

    const caseId = generateId('dc');
    const paymentId = generateId('ep');
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'pyra_approve_employee_deduction',
      {
        p_case_id: caseId,
        p_payment_id: paymentId,
        p_employee_username: snapshot.employee_username,
        p_period_month: snapshot.period_month,
        p_salary_snapshot: snapshot.salary_snapshot,
        p_salary_currency: snapshot.salary_currency,
        p_attendance_units: snapshot.attendance_units,
        p_attendance_amount: snapshot.attendance_amount,
        p_delivery_on_time_pct: snapshot.delivery_on_time_pct,
        p_delivery_band: snapshot.delivery_band,
        p_delivery_amount: snapshot.delivery_amount,
        p_delivery_percentage: snapshot.delivery_percentage,
        p_quality_avg_rounds: snapshot.quality_avg_rounds,
        p_quality_outright_rejection_rate: snapshot.quality_outright_rejection_rate,
        p_quality_below_band: snapshot.quality_below_band,
        p_quality_consecutive_months: snapshot.quality_consecutive_months,
        p_quality_eligible: snapshot.quality_eligible,
        p_quality_amount: snapshot.quality_amount,
        p_monthly_cap_percentage: snapshot.monthly_cap_percentage,
        p_evidence: snapshot.evidence,
        p_policy_snapshot: snapshot.policy_snapshot,
        p_admin_note: null,
        p_payment_description: t('deductions.computedApproval.paymentDescription', {
          month: report.month,
        }),
        p_approved_by: auth.pyraUser.username,
      },
    );

    if (rpcError) {
      const code = rpcErrorCode(rpcError.message ?? '');
      if (code === 'invalid_deduction_payload') {
        return apiValidationError(t('deductions.computedApproval.invalidPayload'));
      }
      if (code === 'deduction_closed_period') {
        return apiError(t('deductions.computedApproval.closedPeriod'), 409);
      }
      if (code === 'deduction_cap_exhausted') {
        return apiError(t('deductions.computedApproval.capExhausted'), 409);
      }
      if (code) {
        return apiError(t('deductions.computedApproval.stateChanged'), 409);
      }
      logError({
        error: rpcError,
        request: req,
        user: { id: auth.pyraUser.username },
        metadata: { route: 'hr/deductions/approve', step: 'atomic-approval' },
      });
      return apiServerError();
    }

    const deductionCase = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as PyraDeductionCase | null;
    if (!deductionCase) return apiServerError();
    const changed = deductionCase.id === caseId;

    if (changed) {
      logActivity(
        auth.pyraUser.username,
        auth.pyraUser.display_name,
        `${ENTITY_TYPES.DEDUCTION}_${ACTIVITY_ACTIONS.APPROVE}`,
        '/dashboard/hr/deductions',
        {
          deduction_case_id: deductionCase.id,
          payment_id: deductionCase.payment_id,
          employee_username: username,
          effective_month: periodMonth,
          source: 'computed_employee_deduction_approved',
        },
        req.headers.get('x-forwarded-for') || 'unknown',
      );
    }

    return apiSuccess(
      { deduction_case: deductionCase },
      { idempotent: !changed },
      changed ? 201 : 200,
    );
  } catch (error) {
    logError({ error, request: req, metadata: { route: 'hr/deductions/approve', method: 'POST' } });
    return apiServerError();
  }
}
