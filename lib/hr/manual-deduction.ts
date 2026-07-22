import {
  MANUAL_DEDUCTION_BASIS,
  QUALITY_AVG_ROUNDS_THRESHOLD,
  QUALITY_CONSECUTIVE_MONTHS_REQUIRED,
  QUALITY_REJECTION_RATE_THRESHOLD_PERCENT,
  type ManualDeductionBasis,
} from '@/lib/constants/deductions';
import {
  evaluateQualityEligibility,
  isLegacyDeliveryDelayEvidence,
  type QualityMonthSnapshot,
  type QualityThresholdPolicy,
} from '@/lib/hr/deductions';
import type { DeliveryTaskEvidence } from '@/lib/hr/deductions-report';
import { PRODUCTION_ATTRIBUTION_STATUS } from '@/lib/constants/production';
import { isValidIsoInstant } from '@/lib/production/deadlines';
import { dubaiDayKey } from '@/lib/utils/format';

const EVIDENCE_SOURCE = 'employee_deductions_admin_approval' as const;

export type ManualDeductionEvidenceError =
  | 'invalid_basis'
  | 'invalid_identity'
  | 'owner_attestation_required'
  | 'missing_task_selection'
  | 'invalid_task_selection'
  | 'unexpected_task_selection'
  | 'quality_not_eligible';

interface ManualDeductionEvidenceInput {
  basis: string;
  employee_username: string;
  report_month: string;
  evidence_task_ids: readonly string[];
  owner_attestation: boolean;
  delivery_tasks: readonly DeliveryTaskEvidence[];
  quality_months: readonly QualityMonthSnapshot[];
}

interface ManualDeductionEvidenceBase {
  schema_version: 1;
  source: typeof EVIDENCE_SOURCE;
  basis: ManualDeductionBasis;
  employee_username: string;
  report_month: string;
}

export interface LegacyDeliveryManualDeductionEvidence
  extends ManualDeductionEvidenceBase {
  basis: typeof MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY;
  legacy_delivery: {
    evaluation: 'submitted_after_due_calendar_day_dubai';
    owner_attested: true;
    tasks: Array<{
      task_id: string;
      title: string;
      due_date: string;
      due_at: string | null;
      first_submitted_at: string;
      outcome: DeliveryTaskEvidence['outcome'];
      exclusion_reason: DeliveryTaskEvidence['exclusion_reason'];
      attribution_status: DeliveryTaskEvidence['attribution_status'];
    }>;
  };
}

export interface QualityManualDeductionEvidence
  extends ManualDeductionEvidenceBase {
  basis: typeof MANUAL_DEDUCTION_BASIS.QUALITY_REPEATED_PATTERN;
  quality: {
    policy: {
      avg_rounds_above: number;
      rejection_rate_at_least_percent: number;
      consecutive_months_required: number;
    };
    eligibility: ReturnType<typeof evaluateQualityEligibility>;
    months: QualityMonthSnapshot[];
  };
}

export type TrustedManualDeductionEvidence =
  | LegacyDeliveryManualDeductionEvidence
  | QualityManualDeductionEvidence;

export type ManualDeductionEvidenceResult =
  | { ok: true; evidence: TrustedManualDeductionEvidence }
  | { ok: false; code: ManualDeductionEvidenceError };

function validIdentity(username: string, month: string): boolean {
  return username.trim().length > 0 && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

function isSupportedBasis(value: string): value is ManualDeductionBasis {
  return value === MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY
    || value === MANUAL_DEDUCTION_BASIS.QUALITY_REPEATED_PATTERN;
}

export function isLegacyDeliveryDelayEvidenceForMonth(
  task: DeliveryTaskEvidence,
  reportMonth: string,
): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(reportMonth)
    && isLegacyDeliveryDelayEvidence(task)
    && dubaiDayKey(new Date(task.first_submitted_at!)).slice(0, 7) === reportMonth;
}

/**
 * Builds the immutable evidence sent to the approval RPC. The caller supplies
 * only server-loaded report data; client-provided evidence objects are never
 * accepted or persisted.
 */
export function buildManualDeductionEvidence(
  input: ManualDeductionEvidenceInput,
): ManualDeductionEvidenceResult {
  if (!isSupportedBasis(input.basis)) {
    return { ok: false, code: 'invalid_basis' };
  }
  if (!validIdentity(input.employee_username, input.report_month)) {
    return { ok: false, code: 'invalid_identity' };
  }

  const base = {
    schema_version: 1 as const,
    source: EVIDENCE_SOURCE,
    basis: input.basis,
    employee_username: input.employee_username,
    report_month: input.report_month,
  };

  if (input.basis === MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY) {
    if (input.evidence_task_ids.length === 0) {
      return { ok: false, code: 'missing_task_selection' };
    }
    if (input.owner_attestation !== true) {
      return { ok: false, code: 'owner_attestation_required' };
    }
    const canonicalIds = [...input.evidence_task_ids].sort();
    if (
      canonicalIds.some((taskId) => !taskId)
      || new Set(canonicalIds).size !== canonicalIds.length
    ) {
      return { ok: false, code: 'invalid_task_selection' };
    }
    const tasksById = new Map(input.delivery_tasks.map((task) => [task.task_id, task]));
    const selectedTasks = canonicalIds.map((taskId) => tasksById.get(taskId));
    if (selectedTasks.some((task) =>
      !task
      || !isLegacyDeliveryDelayEvidenceForMonth(task, input.report_month))) {
      return { ok: false, code: 'invalid_task_selection' };
    }

    return {
      ok: true,
      evidence: {
        ...base,
        basis: MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY,
        legacy_delivery: {
          evaluation: 'submitted_after_due_calendar_day_dubai',
          owner_attested: true,
          tasks: selectedTasks.map((task) => {
            const verifiedTask = task!;
            return {
              task_id: verifiedTask.task_id,
              title: verifiedTask.title,
              due_date: verifiedTask.due_date!,
              // A migration sentinel is not evidence of an exact hour. Keep
              // only the independently documented calendar date in that case.
              due_at: verifiedTask.deadline_unverified ? null : verifiedTask.due_at,
              first_submitted_at: verifiedTask.first_submitted_at!,
              outcome: verifiedTask.outcome,
              exclusion_reason: verifiedTask.exclusion_reason,
              attribution_status: verifiedTask.attribution_status,
            };
          }),
        },
      },
    };
  }

  if (input.evidence_task_ids.length > 0) {
    return { ok: false, code: 'unexpected_task_selection' };
  }
  if (input.quality_months.at(-1)?.month !== input.report_month) {
    return { ok: false, code: 'quality_not_eligible' };
  }
  const eligibility = evaluateQualityEligibility(input.quality_months);
  if (!eligibility.eligible) {
    return { ok: false, code: 'quality_not_eligible' };
  }

  return {
    ok: true,
    evidence: {
      ...base,
      basis: MANUAL_DEDUCTION_BASIS.QUALITY_REPEATED_PATTERN,
      quality: {
        policy: {
          avg_rounds_above: QUALITY_AVG_ROUNDS_THRESHOLD,
          rejection_rate_at_least_percent: QUALITY_REJECTION_RATE_THRESHOLD_PERCENT,
          consecutive_months_required: QUALITY_CONSECUTIVE_MONTHS_REQUIRED,
        },
        eligibility,
        months: input.quality_months.map((month) => ({ ...month })),
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isExactQualityMonth(value: unknown): value is QualityMonthSnapshot {
  if (!isRecord(value)) return false;
  return typeof value.month === 'string'
    && /^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)
    && isNullableFiniteNumber(value.avg_rounds)
    && isNullableFiniteNumber(value.outright_rejection_rate)
    && typeof value.review_rounds_total === 'number'
    && typeof value.reviewed_task_count === 'number'
    && typeof value.outright_rejection_count === 'number'
    && Number.isInteger(value.review_rounds_total)
    && Number.isInteger(value.reviewed_task_count)
    && Number.isInteger(value.outright_rejection_count)
    && Number(value.review_rounds_total) >= 0
    && Number(value.reviewed_task_count) >= 0
    && Number(value.outright_rejection_count) >= 0;
}

/** Rejects old, client-authored, or tampered evidence before audit display/retry. */
export function parseTrustedManualDeductionEvidence(
  value: unknown,
): TrustedManualDeductionEvidence | null {
  if (
    !isRecord(value)
    || value.schema_version !== 1
    || value.source !== EVIDENCE_SOURCE
    || typeof value.employee_username !== 'string'
    || !validIdentity(value.employee_username, String(value.report_month ?? ''))
    || typeof value.report_month !== 'string'
    || !isSupportedBasis(String(value.basis ?? ''))
  ) {
    return null;
  }

  if (value.basis === MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY) {
    const legacy = value.legacy_delivery;
    if (
      !isRecord(legacy)
      || legacy.evaluation !== 'submitted_after_due_calendar_day_dubai'
      || legacy.owner_attested !== true
      || !Array.isArray(legacy.tasks)
      || legacy.tasks.length === 0
    ) {
      return null;
    }
    const taskIds: string[] = [];
    for (const task of legacy.tasks) {
      if (
        !isRecord(task)
        || typeof task.task_id !== 'string'
        || !task.task_id
        || typeof task.title !== 'string'
        || typeof task.due_date !== 'string'
        || (task.due_at !== null && typeof task.due_at !== 'string')
        || (typeof task.due_at === 'string' && !isValidIsoInstant(task.due_at))
        || (task.exclusion_reason === 'unverified_legacy_deadline' && task.due_at !== null)
        || typeof task.first_submitted_at !== 'string'
        || task.outcome !== 'excluded'
        || (task.exclusion_reason !== 'unverified_legacy_deadline'
          && task.exclusion_reason !== 'legacy_unverified_attribution')
        || !Object.values(PRODUCTION_ATTRIBUTION_STATUS).includes(
          task.attribution_status as (typeof PRODUCTION_ATTRIBUTION_STATUS)[keyof typeof PRODUCTION_ATTRIBUTION_STATUS],
        )
        || !isLegacyDeliveryDelayEvidence({
          due_date: task.due_date,
          first_submitted_at: task.first_submitted_at,
          exclusion_reason: task.exclusion_reason,
        })
        || dubaiDayKey(new Date(task.first_submitted_at)).slice(0, 7) !== value.report_month
      ) {
        return null;
      }
      taskIds.push(task.task_id);
    }
    if (
      new Set(taskIds).size !== taskIds.length
      || taskIds.some((taskId, index) => taskId !== [...taskIds].sort()[index])
    ) {
      return null;
    }
    return value as unknown as LegacyDeliveryManualDeductionEvidence;
  }

  const quality = value.quality;
  if (!isRecord(quality) || !isRecord(quality.policy) || !isRecord(quality.eligibility)) {
    return null;
  }
  const storedPolicy = quality.policy as Partial<QualityThresholdPolicy>;
  if (
    typeof storedPolicy.avg_rounds_above !== 'number'
    || typeof storedPolicy.rejection_rate_at_least_percent !== 'number'
    || typeof storedPolicy.consecutive_months_required !== 'number'
    || !Array.isArray(quality.months)
    || !quality.months.every(isExactQualityMonth)
    || quality.months.at(-1)?.month !== value.report_month
  ) {
    return null;
  }
  try {
    const eligibility = evaluateQualityEligibility(
      quality.months,
      storedPolicy as QualityThresholdPolicy,
    );
    if (
      eligibility.eligible !== true
      || quality.eligibility.current_below_band !== eligibility.current_below_band
      || quality.eligibility.consecutive_months !== eligibility.consecutive_months
      || quality.eligibility.eligible !== eligibility.eligible
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return value as unknown as QualityManualDeductionEvidence;
}
