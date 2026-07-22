import {
  PRODUCTION_ATTRIBUTION_STATUS,
  type ProductionAttributionStatus,
} from '@/lib/constants/production';
import { isValidIsoInstant } from './deadlines';

interface FirstReviewAttributionEvent {
  assignees_snapshot?: unknown;
  task_created_at_snapshot?: unknown;
}

interface ProductionAttributionInput {
  currentAssignees: readonly unknown[];
  currentTaskCreatedAt: string;
  firstReviewEvent: FirstReviewAttributionEvent | null;
}

export interface ProductionAttribution {
  status: ProductionAttributionStatus;
  /** Proven owner(s) used for employee productivity and deduction metrics. */
  assignees: string[];
  /**
   * Employee(s) allowed to see the task in own-scope evidence. For legacy
   * reviewed work this is the exact current assignment only; it never proves
   * who owned the task at review time and therefore never enables metrics.
   */
  visibilityAssignees: string[];
  taskCreatedAt: string | null;
  metricsEligible: boolean;
}

function normalizedCurrentAssignees(values: readonly unknown[]): string[] {
  return [...new Set(
    values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean),
  )].sort();
}

function normalizedSnapshotAssignees(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)) {
    return null;
  }
  return [...new Set(value.map((entry) => entry.trim()))].sort();
}

/**
 * Resolves who owns production evidence without reconstructing history.
 * Reviewed work is attributable only when the immutable first-review
 * snapshots are both valid. Current assignees are operational-only input for
 * work that has not reached review yet.
 */
export function resolveProductionAttribution(
  input: ProductionAttributionInput,
): ProductionAttribution {
  const currentAssignees = normalizedCurrentAssignees(input.currentAssignees);
  if (!input.firstReviewEvent) {
    return {
      status: PRODUCTION_ATTRIBUTION_STATUS.CURRENT_OPERATIONAL,
      assignees: currentAssignees,
      visibilityAssignees: currentAssignees,
      taskCreatedAt: input.currentTaskCreatedAt,
      metricsEligible: true,
    };
  }

  const assignees = normalizedSnapshotAssignees(input.firstReviewEvent.assignees_snapshot);
  const taskCreatedAt = input.firstReviewEvent.task_created_at_snapshot;
  if (
    assignees === null
    || typeof taskCreatedAt !== 'string'
    || !isValidIsoInstant(taskCreatedAt)
  ) {
    return {
      status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_UNVERIFIED,
      assignees: [],
      visibilityAssignees: currentAssignees,
      taskCreatedAt: null,
      metricsEligible: false,
    };
  }

  return {
    status: PRODUCTION_ATTRIBUTION_STATUS.SNAPSHOT_VERIFIED,
    assignees,
    visibilityAssignees: assignees,
    taskCreatedAt,
    metricsEligible: true,
  };
}
