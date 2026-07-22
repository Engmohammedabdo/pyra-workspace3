import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiError, apiNotFound, apiServerError, apiSuccess, apiValidationError } from '@/lib/api/response';
import { logActivity, ACTIVITY_ACTIONS, ENTITY_TYPES } from '@/lib/api/activity';
import {
  MANUAL_DEDUCTION_BASIS,
  MONTHLY_DEDUCTION_CAP_PERCENT,
  QUALITY_DEDUCTION_APPROVAL_ENABLED,
  type ManualDeductionBasis,
} from '@/lib/constants/deductions';
import { EMPLOYEE_PAYMENT_SOURCE_TYPE, PAYROLL_RPC_STATUS } from '@/lib/constants/payroll';
import { EMPLOYEE_PAYMENT_STATUS } from '@/lib/constants/statuses';
import {
  loadMonthlyDeductionsReport,
  type DeductionPaymentEvidence,
  type MonthlyDeductionsReport,
} from '@/lib/hr/deductions-report';
import {
  buildManualDeductionEvidence,
  parseTrustedManualDeductionEvidence,
} from '@/lib/hr/manual-deduction';
import { logError } from '@/lib/observability/log-error';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { dubaiDayKey } from '@/lib/utils/format';
import type { PyraManualDeduction } from '@/types/database';

interface ManualDeductionRpcRow {
  status: string;
  changed: boolean;
  manual_data: Record<string, unknown> | null;
  payment_data: Record<string, unknown> | null;
}

type ManualPaymentRow = DeductionPaymentEvidence & { source_type: string };

const IDEMPOTENCY_KEY_PATTERN = /^md_[A-Za-z0-9_-]{8,17}$/;
const PERIOD_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-01$/;
const MAX_EVIDENCE_TASKS = 100;
const MAX_REASON_LENGTH = 2000;

function isManualDeductionBasis(value: string): value is ManualDeductionBasis {
  return value === MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY
    || value === MANUAL_DEDUCTION_BASIS.QUALITY_REPEATED_PATTERN;
}

function parseTaskIds(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_EVIDENCE_TASKS) return null;
  if (value.some((taskId) => typeof taskId !== 'string' || !taskId || taskId.length > 20)) {
    return null;
  }
  const taskIds = [...value].sort();
  return new Set(taskIds).size === taskIds.length ? taskIds : null;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function trustedEvidenceTaskIds(evidence: ReturnType<
  typeof parseTrustedManualDeductionEvidence
>): string[] {
  return evidence?.basis === MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY
    ? evidence.legacy_delivery.tasks.map((task) => task.task_id)
    : [];
}

function sameTaskIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((taskId, index) => taskId === right[index]);
}

function existingIntentMatches(
  existing: PyraManualDeduction,
  input: {
    username: string;
    periodMonth: string;
    requestedAmount: number;
    reason: string;
    basis: ManualDeductionBasis;
    taskIds: string[];
    ownerAttestation: boolean;
  },
): boolean {
  const evidence = parseTrustedManualDeductionEvidence(existing.evidence);
  if (
    !evidence
    || existing.basis !== input.basis
    || evidence.basis !== input.basis
    || evidence.employee_username !== existing.employee_username
    || `${evidence.report_month}-01` !== existing.period_month
  ) return false;
  if (
    input.basis === MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY
    && input.ownerAttestation !== true
  ) {
    return false;
  }
  return existing.employee_username === input.username
    && existing.period_month === input.periodMonth
    && roundMoney(Number(existing.requested_amount)) === input.requestedAmount
    && existing.reason === input.reason
    && sameTaskIds(trustedEvidenceTaskIds(evidence), input.taskIds);
}

function existingPaymentMatches(
  manual: PyraManualDeduction,
  payment: ManualPaymentRow | null,
): boolean {
  return Boolean(
    payment
    && payment.username === manual.employee_username
    && payment.source_type === EMPLOYEE_PAYMENT_SOURCE_TYPE.DEDUCTION
    && payment.source_id === manual.id
    && payment.effective_month === manual.period_month
    && payment.currency === manual.salary_currency
    && roundMoney(Number(payment.amount)) === roundMoney(Number(manual.approved_amount))
    && roundMoney(Number(payment.deduction_cap_exempt_amount)) === 0
    && [EMPLOYEE_PAYMENT_STATUS.APPROVED, EMPLOYEE_PAYMENT_STATUS.PAID]
      .includes(payment.status as 'approved' | 'paid'),
  );
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('hr.manage');
    if (isApiError(auth)) return auth;
    const t = await getTranslations('api');

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const idempotencyKey = typeof body?.idempotency_key === 'string'
      ? body.idempotency_key.trim()
      : '';
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const periodMonth = typeof body?.period_month === 'string' ? body.period_month.trim() : '';
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    const rawRequestedAmount = Number(body?.amount);
    const requestedAmount = roundMoney(rawRequestedAmount);
    const basisValue = typeof body?.basis === 'string' ? body.basis : '';
    const taskIds = parseTaskIds(body?.evidence_task_ids);
    const ownerAttestation = body?.owner_attestation === true;
    const hasClientEvidence = Boolean(
      body && Object.prototype.hasOwnProperty.call(body, 'evidence'),
    );

    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)
      || !username
      || !PERIOD_MONTH_PATTERN.test(periodMonth)
      || !reason
      || reason.length > MAX_REASON_LENGTH
      || !Number.isFinite(rawRequestedAmount)
      || requestedAmount <= 0
      || requestedAmount !== rawRequestedAmount
      || !isManualDeductionBasis(basisValue)
      || taskIds === null
      || hasClientEvidence
      || (body?.owner_attestation !== undefined
        && typeof body?.owner_attestation !== 'boolean')
      || (basisValue === MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY
        && (!ownerAttestation || taskIds.length === 0))
      || (basisValue === MANUAL_DEDUCTION_BASIS.QUALITY_REPEATED_PATTERN
        && (ownerAttestation || taskIds.length > 0))) {
      return apiValidationError(t('payroll.manualDeduction.invalidPayload'));
    }
    const basis = basisValue;

    const supabase = createServiceRoleClient();
    const { data: existingManualData, error: existingManualError } = await supabase
      .from('pyra_manual_deductions')
      .select('*')
      .eq('id', idempotencyKey)
      .maybeSingle();

    if (existingManualError) {
      logError({
        error: existingManualError,
        request: req,
        metadata: { route: 'hr/deductions/manual', step: 'idempotency-read' },
      });
      return apiServerError();
    }

    const existingManual = existingManualData as PyraManualDeduction | null;
    if (existingManual) {
      if (!existingIntentMatches(existingManual, {
        username,
        periodMonth,
        requestedAmount,
        reason,
        basis,
        taskIds,
        ownerAttestation,
      })) {
        return apiError(t('payroll.manualDeduction.idempotencyConflict'), 409);
      }
      const { data: paymentData, error: paymentError } = await supabase
        .from('pyra_employee_payments')
        .select(
          'id, username, source_type, source_id, description, amount, deduction_cap_exempt_amount, currency, status, payroll_id, effective_month, approved_at, paid_at, created_at',
        )
        .eq('id', existingManual.payment_id)
        .maybeSingle();
      if (paymentError) {
        logError({
          error: paymentError,
          request: req,
          metadata: { route: 'hr/deductions/manual', step: 'idempotency-payment-read' },
        });
        return apiServerError();
      }
      const existingPayment = paymentData as ManualPaymentRow | null;
      if (!existingPaymentMatches(existingManual, existingPayment)) {
        return apiError(t('payroll.manualDeduction.existingIntegrityConflict'), 409);
      }
      return apiSuccess(
        { manual_deduction: existingManual, payment: existingPayment },
        { idempotent: true },
        200,
      );
    }

    if (
      basis === MANUAL_DEDUCTION_BASIS.QUALITY_REPEATED_PATTERN
      && !QUALITY_DEDUCTION_APPROVAL_ENABLED
    ) {
      return apiError(t('payroll.manualDeduction.qualityTimingUnconfirmed'), 409);
    }

    const requestInstant = new Date();
    const currentInstant = requestInstant.toISOString();
    const todayKey = dubaiDayKey(requestInstant);
    const currentDubaiMonth = `${todayKey.slice(0, 7)}-01`;
    if (periodMonth < currentDubaiMonth) {
      return apiError(t('payroll.manualDeduction.pastPeriodUnavailable'), 409);
    }
    if (periodMonth > currentDubaiMonth) {
      return apiError(t('payroll.manualDeduction.futurePeriod'), 409);
    }

    let report: MonthlyDeductionsReport;
    try {
      report = await loadMonthlyDeductionsReport(supabase, {
        month: todayKey.slice(0, 7),
        today_key: todayKey,
        current_instant: currentInstant,
        usernames: [username],
        include_unattributed: false,
      });
    } catch (error) {
      logError({
        error,
        request: req,
        metadata: { route: 'hr/deductions/manual', step: 'trusted-report-load' },
      });
      return apiServerError();
    }

    const employee = report.employees.find((candidate) => candidate.username === username);
    if (!employee) return apiNotFound(t('payroll.manualDeduction.employeeNotFound'));
    if (
      employee.salary === null
      || !employee.currency
      || !employee.cap_ledger
    ) {
      return apiError(t('payroll.manualDeduction.employeeStateChanged'), 409);
    }
    if (requestedAmount > employee.cap_ledger.remaining_amount) {
      return apiError(t('payroll.manualDeduction.capChanged'), 409);
    }

    const trustedEvidence = buildManualDeductionEvidence({
      basis,
      employee_username: username,
      report_month: todayKey.slice(0, 7),
      evidence_task_ids: taskIds,
      owner_attestation: ownerAttestation,
      delivery_tasks: employee.delivery_tasks,
      quality_months: employee.quality_months,
    });
    if (!trustedEvidence.ok) {
      const evidenceMessage = trustedEvidence.code === 'quality_not_eligible'
        ? t('payroll.manualDeduction.qualityNotEligible')
        : trustedEvidence.code === 'owner_attestation_required'
          ? t('payroll.manualDeduction.ownerAttestationRequired')
          : t('payroll.manualDeduction.invalidEvidence');
      return apiValidationError(evidenceMessage);
    }

    const { data: rpcRows, error: rpcError } = await supabase
      .rpc('pyra_approve_manual_deduction', {
        p_manual_id: idempotencyKey,
        p_payment_id: idempotencyKey,
        p_employee_username: username,
        p_period_month: periodMonth,
        p_salary_snapshot: employee.salary,
        p_salary_currency: employee.currency,
        p_requested_amount: requestedAmount,
        p_monthly_cap_percentage: MONTHLY_DEDUCTION_CAP_PERCENT,
        p_basis: basis,
        p_reason: reason,
        p_evidence: trustedEvidence.evidence,
        p_approved_by: auth.pyraUser.username,
      });

    if (rpcError) {
      logError({
        error: rpcError,
        request: req,
        user: { id: auth.pyraUser.username },
        metadata: { route: 'hr/deductions/manual', step: 'atomic-approval' },
      });
      return apiServerError();
    }

    const result = (Array.isArray(rpcRows) ? rpcRows[0] : rpcRows) as ManualDeductionRpcRow | null;
    if (!result) return apiServerError();

    if (result.status === PAYROLL_RPC_STATUS.INVALID_PAYLOAD) {
      return apiValidationError(t('payroll.manualDeduction.invalidPayload'));
    }
    if (result.status === PAYROLL_RPC_STATUS.CAP_EXHAUSTED) {
      return apiError(t('payroll.manualDeduction.capExhausted'), 409);
    }
    if (result.status === PAYROLL_RPC_STATUS.CAP_CHANGED) {
      return apiError(t('payroll.manualDeduction.capChanged'), 409);
    }
    if (result.status === PAYROLL_RPC_STATUS.AMBIGUOUS_PERIOD) {
      return apiError(t('payroll.manualDeduction.ambiguousPeriod'), 409);
    }
    if (result.status === PAYROLL_RPC_STATUS.CLOSED_PERIOD) {
      return apiError(t('payroll.manualDeduction.closedPeriod'), 409);
    }
    if (result.status === PAYROLL_RPC_STATUS.CURRENT_MONTH_ONLY) {
      return apiError(t('payroll.manualDeduction.currentMonthOnly'), 409);
    }
    if (result.status === PAYROLL_RPC_STATUS.CURRENCY_CONFLICT) {
      return apiError(t('payroll.manualDeduction.currencyConflict'), 409);
    }
    if (result.status === PAYROLL_RPC_STATUS.BLOCKED_INPUT) {
      return apiError(t('payroll.manualDeduction.employeeStateChanged'), 409);
    }
    if (result.status === PAYROLL_RPC_STATUS.IDEMPOTENCY_CONFLICT) {
      return apiError(t('payroll.manualDeduction.idempotencyConflict'), 409);
    }
    if (result.status === PAYROLL_RPC_STATUS.DUPLICATE_CAUSE) {
      return apiError(t('payroll.manualDeduction.duplicateCause'), 409);
    }
    if (result.status === PAYROLL_RPC_STATUS.QUALITY_TIMING_UNCONFIRMED) {
      return apiError(t('payroll.manualDeduction.qualityTimingUnconfirmed'), 409);
    }
    if (result.status !== PAYROLL_RPC_STATUS.OK
      && result.status !== PAYROLL_RPC_STATUS.ALREADY_APPROVED) {
      logError({
        error: new Error(`Unexpected manual deduction RPC status: ${result.status}`),
        request: req,
        metadata: { route: 'hr/deductions/manual', step: 'unexpected-status' },
      });
      return apiServerError();
    }

    if (result.changed) {
      logActivity(
        auth.pyraUser.username,
        auth.pyraUser.display_name,
        `${ENTITY_TYPES.DEDUCTION}_${ACTIVITY_ACTIONS.APPROVE}`,
        '/dashboard/hr/deductions',
        {
          payment_id: idempotencyKey,
          employee_username: username,
          effective_month: periodMonth,
          basis,
          source: 'manual_employee_deduction_approved',
        },
        req.headers.get('x-forwarded-for') || 'unknown',
      );
    }

    return apiSuccess(
      { manual_deduction: result.manual_data, payment: result.payment_data },
      { idempotent: !result.changed },
      result.changed ? 201 : 200,
    );
  } catch (error) {
    logError({ error, request: req, metadata: { route: 'hr/deductions/manual', method: 'POST' } });
    return apiServerError();
  }
}
