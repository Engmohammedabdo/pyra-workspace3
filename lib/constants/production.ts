export const PRODUCTION_BOARD_ID = 'bd_production';

export const PRODUCTION_ATTRIBUTION_STATUS = {
  CURRENT_OPERATIONAL: 'current_operational',
  SNAPSHOT_VERIFIED: 'snapshot_verified',
  LEGACY_UNVERIFIED: 'legacy_unverified',
} as const;

export type ProductionAttributionStatus =
  (typeof PRODUCTION_ATTRIBUTION_STATUS)[keyof typeof PRODUCTION_ATTRIBUTION_STATUS];
