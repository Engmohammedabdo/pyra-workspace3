export const OFFBOARDING_STATUS = {
  COMPLETED: 'completed',
  REVERSED: 'reversed', // reserved: an exit undone by mistake (not written in v1)
} as const;

export type OffboardingStatus =
  typeof OFFBOARDING_STATUS[keyof typeof OFFBOARDING_STATUS];

// Stored verbatim in pyra_offboarding.exit_reason. ASCII enum keys (NOT Arabic) —
// the dropdown LABEL is translated via t(`offboarding.exitReasons.${key}`).
export const EXIT_REASONS = [
  'resigned',
  'terminated',
  'contract_ended',
  'other',
] as const;

export type ExitReason = typeof EXIT_REASONS[number];
export const EXIT_REASON_KEYS = EXIT_REASONS; // alias for the parallel-key convention
