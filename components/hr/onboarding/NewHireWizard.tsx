'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreateOnboarding, type CreateOnboardingInput } from '@/hooks/useOnboarding';
import { useUsers, type User } from '@/hooks/useUsers';
import {
  StepPersonal,
  StepPosition,
  StepCompensation,
  StepClauses,
  StepReview,
} from './WizardSteps';
import { ExistingEmployeePicker } from './ExistingEmployeePicker';
import {
  defaultForm,
  prefillFromUser,
  validateStep,
  type WizardMode,
} from './wizard-helpers';
import { PASSWORD_MIN_LENGTH } from '@/lib/constants/auth';

// ────────────────────────────────────────────────────────────────────────────
// Step metadata — ASCII keys resolved to labels via t(`steps.${key}`) inside
// the component (translated labels can't live in this module-level constant).
// ────────────────────────────────────────────────────────────────────────────

const STEP_KEYS = ['personal', 'position', 'compensation', 'clauses', 'review'] as const;

// ────────────────────────────────────────────────────────────────────────────
// Stepper indicator
// ────────────────────────────────────────────────────────────────────────────

function Stepper({ current, steps }: { current: number; steps: { label: string }[] }) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center">
            <div
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                done
                  ? 'bg-orange-500 text-white'
                  : active
                  ? 'bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400 ring-2 ring-orange-500'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {done ? '✓' : i + 1}
            </div>
            <span
              className={cn(
                'ms-1.5 me-3 text-xs font-medium whitespace-nowrap',
                active ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground',
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'h-px w-4 me-1 shrink-0',
                  done ? 'bg-orange-500' : 'bg-border',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NewHireWizard({ open, onClose }: Props) {
  const router = useRouter();
  const t = useTranslations('hr.onboarding.wizard');
  // Root translator (no namespace) — resolves the fully-qualified catalog
  // keys returned by the pure validateStep() helper, which cannot call
  // useTranslations itself. See wizard-helpers.ts.
  const tRoot = useTranslations();
  const [mode, setMode] = useState<WizardMode>('new');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CreateOnboardingInput>(defaultForm);

  const { data: usersData = [], isLoading: usersLoading } = useUsers();
  const createOnboarding = useCreateOnboarding();

  const steps = STEP_KEYS.map((key) => ({ label: t(`steps.${key}`) }));

  function patch(update: Partial<CreateOnboardingInput>) {
    setForm((prev) => ({ ...prev, ...update }));
  }

  function switchMode(next: WizardMode) {
    if (next === mode) return;
    setMode(next);
    setStep(0);
    setForm(defaultForm());
  }

  function handlePickEmployee(user: User) {
    setForm(prefillFromUser(user));
    // Re-picking replaces the whole form — restart the steps so the admin
    // re-walks (and re-validates) the prefilled data instead of continuing
    // mid-wizard on top of a silently swapped employee.
    setStep(0);
  }

  function handleClose() {
    setMode('new');
    setStep(0);
    setForm(defaultForm());
    onClose();
  }

  function handleNext() {
    const errKey = validateStep(step, form, mode);
    if (errKey) {
      toast.error(tRoot(errKey as Parameters<typeof tRoot>[0], { min: PASSWORD_MIN_LENGTH }));
      return;
    }
    setStep((s) => Math.min(s + 1, STEP_KEYS.length - 1));
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit() {
    const errKey = validateStep(step, form, mode);
    if (errKey) {
      toast.error(tRoot(errKey as Parameters<typeof tRoot>[0], { min: PASSWORD_MIN_LENGTH }));
      return;
    }

    const isExisting = mode === 'existing';
    const payload: CreateOnboardingInput = {
      ...form,
      // Only honored by the API in existing mode; omit otherwise for a clean body
      existing_employee: isExisting ? true : undefined,
      documents: isExisting ? form.documents : undefined,
      // Existing mode never touches the account — never send a password
      password: isExisting ? undefined : form.password,
    };

    try {
      const result = await createOnboarding.mutateAsync(payload);
      toast.success(
        isExisting
          ? t('toasts.submitSuccessExisting')
          : t('toasts.submitSuccessNew'),
      );
      handleClose();
      router.push(`/dashboard/hr/onboarding/${result.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('toasts.submitFailedFallback');
      toast.error(msg);
    }
  }

  const isLast = step === STEP_KEYS.length - 1;
  const isPending = createOnboarding.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'existing' ? t('dialogTitleExisting') : t('dialogTitleNew')}
          </DialogTitle>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('modeGroupAria')}>
          <Button
            type="button"
            variant={mode === 'new' ? 'default' : 'outline'}
            className={cn(
              'h-11',
              mode === 'new' && 'bg-orange-500 hover:bg-orange-600 text-white',
            )}
            onClick={() => switchMode('new')}
            disabled={isPending}
          >
            {t('modeNew')}
          </Button>
          <Button
            type="button"
            variant={mode === 'existing' ? 'default' : 'outline'}
            className={cn(
              'h-11',
              mode === 'existing' && 'bg-orange-500 hover:bg-orange-600 text-white',
            )}
            onClick={() => switchMode('existing')}
            disabled={isPending}
          >
            {t('modeExisting')}
          </Button>
        </div>

        {/* Existing-employee picker (prefills the form on selection) */}
        {mode === 'existing' && (
          <ExistingEmployeePicker
            users={usersData}
            value={form.username}
            onSelect={handlePickEmployee}
            loading={usersLoading}
          />
        )}

        <Stepper current={step} steps={steps} />

        <div className="min-h-[300px] py-2">
          {step === 0 && <StepPersonal data={form} onChange={patch} mode={mode} />}
          {step === 1 && (
            <StepPosition data={form} onChange={patch} allUsers={usersData} />
          )}
          {step === 2 && <StepCompensation data={form} onChange={patch} />}
          {step === 3 && <StepClauses data={form} onChange={patch} />}
          {step === 4 && <StepReview data={form} onChange={patch} mode={mode} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={step === 0 ? handleClose : handleBack}
            disabled={isPending}
          >
            {step === 0 ? t('cancel') : t('back')}
          </Button>
          {isLast ? (
            <Button
              type="button"
              className="bg-orange-500 hover:bg-orange-600 text-white h-11"
              onClick={handleSubmit}
              disabled={isPending}
            >
              {isPending
                ? t('submitting')
                : mode === 'existing'
                ? t('submitExisting')
                : t('submitNew')}
            </Button>
          ) : (
            <Button
              type="button"
              className="bg-orange-500 hover:bg-orange-600 text-white h-11"
              onClick={handleNext}
            >
              {t('next')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
