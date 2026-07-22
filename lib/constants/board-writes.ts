export const BOARD_WRITE_STATUSES = {
  OK: 'ok',
  INVALID_BOARD_INPUT: 'invalid_board_input',
  INVALID_COLUMN_INPUT: 'invalid_column_input',
  INVALID_COLUMNS_PAYLOAD: 'invalid_columns_payload',
  INVALID_LABELS_PAYLOAD: 'invalid_labels_payload',
  PROJECT_NOT_FOUND: 'project_not_found',
  BOARD_NOT_FOUND: 'board_not_found',
  COLUMN_NOT_IN_BOARD: 'column_not_in_board',
  COLUMN_HAS_TASKS: 'column_has_tasks',
  COLUMN_HAS_HISTORY: 'column_has_history',
  WRITE_CONFLICT: 'write_conflict',
} as const;

export type BoardWriteStatus = (
  typeof BOARD_WRITE_STATUSES[keyof typeof BOARD_WRITE_STATUSES]
);

export type AtomicBoardWriteResult = {
  status: BoardWriteStatus;
  board: Record<string, unknown> | null;
  mutation: Record<string, unknown> | null;
};

export type AtomicBoardColumnWriteResult = {
  status: BoardWriteStatus;
  board_column?: Record<string, unknown> | null;
  mutation: Record<string, unknown> | null;
};
