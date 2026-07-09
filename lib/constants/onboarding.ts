export const ONBOARDING_STATUS = {
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type OnboardingStatus =
  typeof ONBOARDING_STATUS[keyof typeof ONBOARDING_STATUS];

// i18n Phase 5.8: ONBOARDING_STATUS_LABELS removed — both UI consumers
// (onboarding-client.tsx, onboarding-detail-client.tsx) now read the label
// via useStatusLabels('onboarding') (messages/{ar,en}/statuses.json).

/**
 * Canonical asset-type VALUES — persisted verbatim into `offer_data.assets[].type`
 * (jsonb) and printed directly onto the Arabic asset-handover PDF
 * (lib/pdf/asset-handover-pdf.ts). The stored value stays Arabic regardless of
 * the admin's UI locale — same "persisted data, not translated" treatment as
 * the asset CONDITION values in WizardStepClauses.tsx. Only the wizard's
 * dropdown LABEL is translated, via ASSET_TYPE_KEYS + the
 * hr.onboarding.wizard.assetTypes.* catalog (same index order as this array).
 */
export const ASSET_TYPES_AR = [
  'لابتوب', // i18n-exempt: persisted asset-type value (see ASSET_TYPE_KEYS)
  'هاتف متحرك', // i18n-exempt: persisted asset-type value (see ASSET_TYPE_KEYS)
  'خط هاتف / SIM', // i18n-exempt: persisted asset-type value (see ASSET_TYPE_KEYS)
  'بطاقة دخول', // i18n-exempt: persisted asset-type value (see ASSET_TYPE_KEYS)
  'كاميرا / معدات', // i18n-exempt: persisted asset-type value (see ASSET_TYPE_KEYS)
  'أخرى', // i18n-exempt: persisted asset-type value (see ASSET_TYPE_KEYS)
] as const;

/**
 * ASCII catalog-lookup keys parallel to ASSET_TYPES_AR (same order/index).
 * Used ONLY to resolve the translated display label via
 * `t(\`assetTypes.${ASSET_TYPE_KEYS[i]}\`)` in WizardStepClauses.tsx — never
 * sent to the API / persisted (the Arabic string from ASSET_TYPES_AR is what
 * gets stored as `asset.type`).
 */
export const ASSET_TYPE_KEYS = [
  'laptop',
  'mobilePhone',
  'simCard',
  'accessCard',
  'cameraEquipment',
  'other',
] as const;

export const DEFAULT_ONBOARDING_TASKS: string[] = [
  'تجهيز البريد الإلكتروني',
  'تسليم اللابتوب والعهدة',
  'توقيع عرض العمل ورفع النسخة الموقّعة',
  'توقيع اتفاقية السرية (NDA) ورفع النسخة الموقّعة',
  'توقيع نموذج تسليم العهدة ورفع النسخة الموقّعة',
  'إضافة الموظف للفرق والبوردات',
  'شرح الأنظمة والصلاحيات',
  'تفعيل المصادقة الثنائية (2FA)',
];
