export const TASK_TRANSITION_STATUSES = {
  OK: 'ok',
  TASK_NOT_FOUND: 'task_not_found',
  INVALID_BOARD: 'invalid_board',
  INVALID_DESTINATION: 'invalid_destination',
  CURRENT_COLUMN_NOT_FOUND: 'current_column_not_found',
  ALREADY_LAST_STAGE: 'already_last_stage',
  NEXT_STAGE_REQUIRES_APPROVAL: 'next_stage_requires_approval',
  TRANSITION_CONFLICT: 'transition_conflict',
  GATED_DESTINATION: 'gated_destination',
  GATED_SOURCE: 'gated_source',
  INVALID_POSITION: 'invalid_position',
  PRODUCTION_DEADLINE_REQUIRED: 'production_deadline_required',
  PRODUCTION_DEADLINE_INVALID: 'production_deadline_invalid',
  PRODUCTION_DEADLINE_LOCKED: 'production_deadline_locked',
  ATTACHMENT_REQUIRED: 'attachment_required',
  ATTACHMENT_INVALID: 'attachment_invalid',
  ATTACHMENT_UNEXPECTED: 'attachment_unexpected',
  INVALID_TRANSITION_INPUT: 'invalid_transition_input',
} as const;

export const TASK_TRANSITION_MUTATION_FIELDS = ['column_id', 'position'] as const;

export type TaskTransitionStatus = (
  typeof TASK_TRANSITION_STATUSES[keyof typeof TASK_TRANSITION_STATUSES]
);

export type AtomicTaskTransitionResult = {
  status: TaskTransitionStatus;
  task: Record<string, unknown> | null;
  transition: Record<string, unknown> | null;
};

export const ATOMIC_TASK_WRITE_STATUSES = {
  OK: 'ok',
  TASK_NOT_FOUND: 'task_not_found',
  INVALID_BOARD: 'invalid_board',
  INVALID_DESTINATION: 'invalid_destination',
  GATED_DESTINATION: 'gated_destination',
  PRODUCTION_DEADLINE_REQUIRED: 'production_deadline_required',
  PRODUCTION_DEADLINE_INVALID: 'production_deadline_invalid',
  TASK_WRITE_CONFLICT: 'task_write_conflict',
  INVALID_TASK_INPUT: 'invalid_task_input',
  INVALID_ASSIGNEES: 'invalid_assignees',
  INVALID_RELATION_IDS: 'invalid_relation_ids',
  INVALID_RELATION_INPUT: 'invalid_relation_input',
  INVALID_LABEL: 'invalid_label',
  RELATION_NOT_FOUND: 'relation_not_found',
  SOURCE_RELATION_CONFLICT: 'source_relation_conflict',
} as const;

export type AtomicTaskWriteStatus = (
  typeof ATOMIC_TASK_WRITE_STATUSES[keyof typeof ATOMIC_TASK_WRITE_STATUSES]
);

export type AtomicTaskWriteResult = {
  status: AtomicTaskWriteStatus;
  task: Record<string, unknown> | null;
  mutation: Record<string, unknown> | null;
};
