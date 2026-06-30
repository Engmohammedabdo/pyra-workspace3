export const ONBOARDING_STATUS = {
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type OnboardingStatus =
  typeof ONBOARDING_STATUS[keyof typeof ONBOARDING_STATUS];

export const ONBOARDING_STATUS_LABELS: Record<OnboardingStatus, string> = {
  in_progress: 'جاري التعيين',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};

export const ASSET_TYPES_AR = [
  'لابتوب',
  'هاتف متحرك',
  'خط هاتف / SIM',
  'بطاقة دخول',
  'كاميرا / معدات',
  'أخرى',
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
