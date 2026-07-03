import type { CreateOnboardingInput } from '@/hooks/useOnboarding';
import type { User } from '@/hooks/useUsers';
import { PASSWORD_MIN_LENGTH } from '@/lib/constants/auth';
import { dubaiDayKey } from '@/lib/utils/format';

// ────────────────────────────────────────────────────────────────────────────
// Wizard helpers — default form, per-step validation, and existing-employee
// prefill. Extracted from NewHireWizard.tsx to keep the component <300 lines.
// ────────────────────────────────────────────────────────────────────────────

export type WizardMode = 'new' | 'existing';

/** Document keys the API accepts — mirror ONBOARDING_DOC_KEYS server-side. */
export const WIZARD_DOC_KEYS = ['offer_letter', 'nda', 'asset_handover'] as const;

export const WIZARD_DOC_LABELS: Record<string, string> = {
  offer_letter:   'خطاب العرض',
  nda:            'اتفاقية السرية',
  asset_handover: 'نموذج تسليم العهدة',
};

export function defaultForm(): CreateOnboardingInput {
  return {
    nameEn: '',
    nameAr: '',
    nationality: '',
    passport: '',
    idNumber: '',
    dateOfBirth: undefined,
    phone: undefined,
    email: undefined,
    username: '',
    password: '',
    titleEn: '',
    titleAr: '',
    deptEn: '',
    deptAr: '',
    reportsTo: '',
    startDate: '',
    isSales: false,
    employment_type: 'full_time',
    work_location: 'onsite',
    basic: 0,
    housing: 0,
    transport: 0,
    communication: 0,
    other: 0,
    commissionRate: undefined,
    monthlyTarget: undefined,
    currency: 'AED',
    documents: [...WIZARD_DOC_KEYS],
    customClauses: [],
    assets: [],
    signatoryName: '',
    signatoryTitle: '',
    notes: undefined,
  };
}

/**
 * Prefill the wizard form from an existing `pyra_users` row (existing mode).
 * `useUsers()` has no email / salary_breakdown → basic = full salary with
 * allowances 0, email left blank. All fields remain editable after prefill.
 */
export function prefillFromUser(u: User): CreateOnboardingInput {
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  return {
    ...defaultForm(),
    nameAr:          str(u.display_name),
    nameEn:          str(u.display_name),
    username:        str(u.username),
    titleAr:         str(u.job_title),
    basic:           Number(u.salary) || 0,
    currency:        str(u.salary_currency) || 'AED',
    idNumber:        str(u.national_id),
    phone:           str(u.phone) || undefined,
    dateOfBirth:     str(u.date_of_birth).slice(0, 10) || undefined,
    startDate:       str(u.hire_date).slice(0, 10) || dubaiDayKey(),
    employment_type: str(u.employment_type) || 'full_time',
    work_location:   str(u.work_location) || 'onsite',
    reportsTo:       str(u.manager_username),
    isSales:         u.role === 'sales_agent',
    commissionRate:
      u.commission_rate == null || u.commission_rate === ''
        ? undefined
        : Number(u.commission_rate),
  };
}

/** Per-step validation. Existing mode skips username/password entry checks. */
export function validateStep(
  step: number,
  data: CreateOnboardingInput,
  mode: WizardMode,
): string | null {
  switch (step) {
    case 0:
      if (mode === 'existing' && !data.username.trim()) return 'اختر الموظف أولاً';
      if (!data.nameEn.trim()) return 'الاسم بالإنجليزية مطلوب';
      if (!data.nameAr.trim()) return 'الاسم بالعربية مطلوب';
      if (mode === 'new') {
        if (!data.username.trim()) return 'اسم المستخدم مطلوب';
        if (!data.password?.trim() || data.password.length < PASSWORD_MIN_LENGTH)
          return `كلمة المرور يجب أن تكون ${PASSWORD_MIN_LENGTH} أحرف على الأقل`;
      }
      return null;
    case 1:
      if (!data.titleEn.trim()) return 'المسمى الوظيفي مطلوب';
      if (!data.startDate) return 'تاريخ الالتحاق مطلوب';
      return null;
    case 2:
      if (data.basic <= 0) return 'الراتب الأساسي يجب أن يكون أكبر من صفر';
      return null;
    case 3:
      return null; // clauses + assets are optional
    case 4:
      if (!data.signatoryName.trim()) return 'اسم الموقّع مطلوب';
      if (!data.signatoryTitle.trim()) return 'منصب الموقّع مطلوب';
      if (mode === 'existing' && (data.documents ?? []).length === 0)
        return 'اختر وثيقة واحدة على الأقل';
      return null;
    default:
      return null;
  }
}
