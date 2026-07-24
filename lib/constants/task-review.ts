export const TASK_REVIEW_ACTIONS = {
  APPROVE: 'approve',
  REJECT: 'reject',
} as const;

export const PRODUCTION_REVIEW_DELETE_BLOCKED_ERROR =
  'PYRA_PRODUCTION_REVIEW_DELETE_BLOCKED';

export type TaskReviewAction = (
  typeof TASK_REVIEW_ACTIONS[keyof typeof TASK_REVIEW_ACTIONS]
);

export const TASK_REVIEW_ACTIVITY_ACTIONS = {
  APPROVED: 'stage_approved',
  REJECTED: 'stage_rejected',
} as const;

export const TASK_REJECTION_KINDS = {
  REVISION: 'revision',
  OUTRIGHT: 'outright',
} as const;

export type TaskRejectionKind = (
  typeof TASK_REJECTION_KINDS[keyof typeof TASK_REJECTION_KINDS]
);

export function isTaskRejectionKind(value: unknown): value is TaskRejectionKind {
  return value === TASK_REJECTION_KINDS.REVISION
    || value === TASK_REJECTION_KINDS.OUTRIGHT;
}

export const TASK_REVIEW_STATUSES = {
  OK: 'ok',
  TASK_NOT_FOUND: 'task_not_found',
  INVALID_BOARD: 'invalid_board',
  CURRENT_COLUMN_NOT_FOUND: 'current_column_not_found',
  NO_PENDING_REVIEW: 'no_pending_review',
  TRANSITION_CONFLICT: 'transition_conflict',
  INVALID_REVIEW_INPUT: 'invalid_review_input',
} as const;

export type TaskReviewStatus = (
  typeof TASK_REVIEW_STATUSES[keyof typeof TASK_REVIEW_STATUSES]
);

export type AtomicTaskReviewResult = {
  status: TaskReviewStatus;
  task: Record<string, unknown> | null;
  decision: Record<string, unknown> | null;
};
