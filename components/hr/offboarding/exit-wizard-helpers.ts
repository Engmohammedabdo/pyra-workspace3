import type { HandoverDecisions } from '@/lib/hr/handover';

// ────────────────────────────────────────────────────────────────────────────
// Exit-wizard helpers — pure (no hooks). Step keys, form shape, default form and
// per-step validation. Extracted from ExitWizard.tsx to keep the shell lean and
// unit-friendly. Mirrors the onboarding wizard-helpers.ts contract.
// ────────────────────────────────────────────────────────────────────────────

export const EXIT_STEP_KEYS = ['details', 'handover', 'confirm'] as const;
export type ExitStep = (typeof EXIT_STEP_KEYS)[number];

export interface ExitForm {
  last_working_day: string; // YYYY-MM-DD
  exit_reason: string; // one of EXIT_REASONS
  exit_notes: string;
  handover: HandoverDecisions;
}

export function defaultExitForm(todayKey: string): ExitForm {
  return {
    last_working_day: todayKey,
    exit_reason: 'resigned',
    exit_notes: '',
    handover: {},
  };
}

/**
 * Per-step validation. Pure helper (no hooks → can't call useTranslations), so
 * it returns a catalog KEY under `hr.offboarding.*` (or null when valid) and the
 * calling component resolves it via `t(key)` (see ExitWizard.tsx). The keys are
 * relative to the `hr.offboarding` namespace the shell already scopes.
 */
export function validateExitStep(
  step: ExitStep,
  form: ExitForm,
  todayKey: string,
): string | null {
  if (step === 'details') {
    if (!form.last_working_day) return 'errors.lastDayRequired';
    if (form.last_working_day > todayKey) return 'errors.lastDayFuture';
    if (!form.exit_reason) return 'errors.reasonRequired';
  }
  return null;
}
