import {
  TASK_REJECTION_KINDS,
  TASK_REVIEW_ACTIONS,
  TASK_REVIEW_ACTIVITY_ACTIONS,
  isTaskRejectionKind,
} from '@/lib/constants/task-review';
import type {
  QualityRejectionEvent,
  QualityReviewDecisionEvent,
  StageEvent,
} from './metrics';

export interface TaskActivityQualityInput {
  task_id: string;
  action: string;
  details: unknown;
  created_at: string;
}

export interface TaskReviewDecisionQualityInput {
  history_id: string;
  task_id: string;
  board_id: string;
  action: string;
  rejection_kind: unknown;
  decided_at: string;
}

export interface TaskRejectionActivityDisplay {
  kind: 'revision' | 'outright';
  note: string | null;
}

function nativeDetails(details: unknown): Record<string, unknown> | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  return details as Record<string, unknown>;
}

function legacyDetailsForDisplay(details: unknown): Record<string, unknown> | null {
  if (typeof details !== 'string') return null;
  try {
    return nativeDetails(JSON.parse(details) as unknown);
  } catch {
    return null;
  }
}

/**
 * Normalizes only explicit structured quality decisions.
 *
 * Existing stage_rejected rows predate `rejection_kind` and are revisions by
 * policy. Only a native JSON object is structured evidence. A JSON-looking
 * string remains legacy evidence and can never be promoted to outright.
 */
export function normalizeQualityRejectionEvent(
  activity: TaskActivityQualityInput,
): QualityRejectionEvent | null {
  if (activity.action !== TASK_REVIEW_ACTIVITY_ACTIONS.REJECTED) return null;

  const parsed = nativeDetails(activity.details);
  const explicitKind = parsed?.rejection_kind;
  return {
    task_id: activity.task_id,
    created_at: activity.created_at,
    kind: isTaskRejectionKind(explicitKind)
      ? explicitKind
      : TASK_REJECTION_KINDS.REVISION,
  };
}

/**
 * Convert one append-only review decision to a quality event only when its
 * exact stage-history row proves the task, board, review source, and timestamp.
 * Any malformed native evidence fails closed instead of being silently ignored.
 */
export function normalizeReviewDecisionQualityEvent(
  decision: TaskReviewDecisionQualityInput,
  history: StageEvent | undefined,
  expectedBoardId: string,
  reviewColumnId: string,
): QualityReviewDecisionEvent {
  if (
    decision.action !== TASK_REVIEW_ACTIONS.APPROVE
    && decision.action !== TASK_REVIEW_ACTIONS.REJECT
  ) {
    throw new Error('review decision action is invalid');
  }
  if (decision.board_id !== expectedBoardId) {
    throw new Error('review decision board does not match the requested board');
  }
  if (!history || history.id !== decision.history_id) {
    throw new Error('review decision history link is missing or mismatched');
  }
  if (history.board_id !== expectedBoardId) {
    throw new Error('review decision history board is mismatched');
  }
  if (history.task_id !== decision.task_id) {
    throw new Error('review decision task does not match its history row');
  }
  if (history.from_column_id !== reviewColumnId) {
    throw new Error('review decision history did not leave the review column');
  }
  if (history.created_at !== decision.decided_at) {
    throw new Error('review decision timestamp does not match its history row');
  }
  if (decision.action === TASK_REVIEW_ACTIONS.REJECT) {
    if (!isTaskRejectionKind(decision.rejection_kind)) {
      throw new Error('review decision rejection kind is invalid');
    }
  } else if (decision.rejection_kind !== null) {
    throw new Error('review decision approval kind must be null');
  }
  return {
    task_id: decision.task_id,
    created_at: history.created_at,
    action: decision.action,
    kind: decision.action === TASK_REVIEW_ACTIONS.REJECT
      ? decision.rejection_kind as 'revision' | 'outright'
      : null,
  };
}

/** UI-only normalization: legacy strings may reveal their note, never their kind. */
export function getTaskRejectionActivityDisplay(
  activity: TaskActivityQualityInput,
): TaskRejectionActivityDisplay | null {
  if (activity.action !== TASK_REVIEW_ACTIVITY_ACTIONS.REJECTED) return null;
  const structured = nativeDetails(activity.details);
  const displayDetails = structured ?? legacyDetailsForDisplay(activity.details);
  const rawNote = displayDetails?.note;
  return {
    kind: structured && isTaskRejectionKind(structured.rejection_kind)
      ? structured.rejection_kind
      : TASK_REJECTION_KINDS.REVISION,
    note: typeof rawNote === 'string' && rawNote.trim() ? rawNote.trim() : null,
  };
}
