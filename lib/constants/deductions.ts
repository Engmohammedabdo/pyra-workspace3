export const MANUAL_DEDUCTION_BASIS = {
  OWNER_ATTESTED_LEGACY_DELIVERY: 'owner_attested_legacy_delivery',
  QUALITY_REPEATED_PATTERN: 'quality_repeated_pattern',
} as const;

export type ManualDeductionBasis =
  (typeof MANUAL_DEDUCTION_BASIS)[keyof typeof MANUAL_DEDUCTION_BASIS];

export const DELIVERY_DEDUCTION_PERCENT = { MINOR: 3, MODERATE: 7, MAJOR: 12 } as const;
/** Delivery, quality, and manual disciplinary money only; attendance is exempt. */
export const MONTHLY_DEDUCTION_CAP_PERCENT = 25;
export const DELIVERY_MIN_LEAD_TIME_HOURS = 24;
export const QUALITY_AVG_ROUNDS_THRESHOLD = 2;
export const QUALITY_REJECTION_RATE_THRESHOLD_PERCENT = 20;
export const QUALITY_CONSECUTIVE_MONTHS_REQUIRED = 2;
/**
 * Money timing for quality is still awaiting the owner's explicit choice
 * between a changing current month and two completed months. Warning evidence
 * stays visible, but new quality-money approvals fail closed meanwhile.
 */
export const QUALITY_DEDUCTION_APPROVAL_ENABLED = false;

export const ATTENDANCE_DEDUCTION_UNITS = {
  FREE: 0,
  QUARTER: 0.25,
  HALF: 0.5,
  FULL: 1,
} as const;
export const ATTENDANCE_QUARTER_DAY_MAX_MINUTES = 60;
export const ATTENDANCE_HALF_DAY_MAX_MINUTES = 120;
