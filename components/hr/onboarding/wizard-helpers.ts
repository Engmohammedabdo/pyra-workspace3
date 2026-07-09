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

/**
 * Maps each WIZARD_DOC_KEYS entry to its hr.onboarding.docNames.* catalog key.
 * i18n Phase 5.8: replaces the old WIZARD_DOC_LABELS Arabic map, which had
 * drifted to a 4th, divergent phrasing for the offer letter versus the
 * majority phrasing used in the 3 other spots across the onboarding surface
 * (see docNames.offerLetter in messages/{ar,en}/hr.json for the converged text).
 * This is a pure key→key lookup (no translated text) so it can live in this
 * hook-free helper file; WizardStepReview.tsx resolves the actual label via
 * `t(\`docNames.${WIZARD_DOC_NAME_KEYS[key]}\`)`.
 */
export const WIZARD_DOC_NAME_KEYS: Record<
  (typeof WIZARD_DOC_KEYS)[number],
  'offerLetter' | 'nda' | 'assetHandover'
> = {
  offer_letter:   'offerLetter',
  nda:            'nda',
  asset_handover: 'assetHandover',
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

/**
 * Per-step validation. Existing mode skips username/password entry checks.
 *
 * i18n Phase 5.8 — RETURN-KEY pattern: this is a pure helper (no hooks, so it
 * cannot call `useTranslations`). It returns a fully-qualified catalog KEY
 * (or `null` when the step is valid) — the calling component resolves the
 * message via a root translator: `t(key, { min: PASSWORD_MIN_LENGTH })`
 * (NewHireWizard.tsx). Extra interpolation params are harmless no-ops for
 * keys that don't reference them.
 */
export function validateStep(
  step: number,
  data: CreateOnboardingInput,
  mode: WizardMode,
): string | null {
  switch (step) {
    case 0:
      if (mode === 'existing' && !data.username.trim())
        return 'hr.onboarding.wizard.validation.selectEmployeeFirst';
      if (!data.nameEn.trim())
        return 'hr.onboarding.wizard.validation.nameEnRequired';
      if (!data.nameAr.trim())
        return 'hr.onboarding.wizard.validation.nameArRequired';
      if (mode === 'new') {
        if (!data.username.trim())
          return 'hr.onboarding.wizard.validation.usernameRequired';
        if (!data.password?.trim() || data.password.length < PASSWORD_MIN_LENGTH)
          return 'hr.onboarding.wizard.validation.passwordMinLength';
      }
      return null;
    case 1:
      if (!data.titleEn.trim())
        return 'hr.onboarding.wizard.validation.titleRequired';
      if (!data.startDate)
        return 'hr.onboarding.wizard.validation.startDateRequired';
      return null;
    case 2:
      if (data.basic <= 0)
        return 'hr.onboarding.wizard.validation.basicSalaryRequired';
      return null;
    case 3:
      return null; // clauses + assets are optional
    case 4:
      if (!data.signatoryName.trim())
        return 'hr.onboarding.wizard.validation.signatoryNameRequired';
      if (!data.signatoryTitle.trim())
        return 'hr.onboarding.wizard.validation.signatoryTitleRequired';
      if (mode === 'existing' && (data.documents ?? []).length === 0)
        return 'hr.onboarding.wizard.validation.selectAtLeastOneDocument';
      return null;
    default:
      return null;
  }
}
