'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { dubaiDayKey } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useExitPreview, useSubmitExit } from '@/hooks/useOffboarding';
import { ExitStepDetails, ExitStepHandover, ExitStepConfirm } from './ExitWizardSteps';
import { Stepper, ExitLoading, ExitLoadError } from './ExitWizardParts';
import {
  EXIT_STEP_KEYS,
  defaultExitForm,
  validateExitStep,
  type ExitForm,
} from './exit-wizard-helpers';

interface Props {
  open: boolean;
  username: string;
  onClose: () => void;
}

export function ExitWizard({ open, username, onClose }: Props) {
  const t = useTranslations('hr.offboarding');
  const todayKey = useMemo(() => dubaiDayKey(new Date()), []);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ExitForm>(() => defaultExitForm(dubaiDayKey(new Date())));
  const [confirmOpen, setConfirmOpen] = useState(false);

  const preview = useExitPreview(open ? username : undefined);
  const submit = useSubmitExit();
  const isPending = submit.isPending;

  const steps = EXIT_STEP_KEYS.map((k) => ({ label: t(`steps.${k}`) }));
  const isLast = step === EXIT_STEP_KEYS.length - 1;
  const employeeName = preview.data?.employee.display_name ?? username;

  function patch(update: Partial<ExitForm>) {
    setForm((prev) => ({ ...prev, ...update }));
  }

  function handleClose() {
    setStep(0);
    setForm(defaultExitForm(todayKey));
    setConfirmOpen(false);
    onClose();
  }

  function handleNext() {
    const errKey = validateExitStep(EXIT_STEP_KEYS[step], form, todayKey);
    if (errKey) {
      // errKey is a validated catalog key under hr.offboarding.errors.* — the
      // pure helper can't be typed against next-intl's key union, so cast here.
      toast.error(t(errKey as Parameters<typeof t>[0]));
      return;
    }
    setStep((s) => Math.min(s + 1, EXIT_STEP_KEYS.length - 1));
  }

  async function doSubmit() {
    try {
      const data = await submit.mutateAsync({
        username,
        last_working_day: form.last_working_day,
        exit_reason: form.exit_reason,
        exit_notes: form.exit_notes || undefined,
        handover: form.handover,
      });
      // Honest result: the account-lock can fail while the exit still succeeds
      // (the route returns HTTP 200 with { locked:false }) — surface the truth.
      if (data.locked) toast.success(t('exitDoneLocked'));
      else toast.warning(t('exitDoneLockFailed'));
      // A reassignment/archive step can fail silently inside a 200 body.
      if (data.handover_results?.errors?.length) toast.warning(t('handoverPartialError'));
      handleClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('submitFailedFallback'));
    } finally {
      setConfirmOpen(false);
    }
  }

  // Fail-closed: an errored (or empty) preview MUST block the wizard so the admin
  // can never confirm a blind exit on incomplete handover data.
  const showError = open && !preview.isLoading && (preview.isError || !preview.data);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('title')} — {employeeName}
            </DialogTitle>
          </DialogHeader>

          {preview.isLoading ? (
            <ExitLoading />
          ) : showError ? (
            <ExitLoadError
              title={t('loadError')}
              hint={t('loadErrorHint')}
              retryLabel={t('retry')}
              onRetry={() => preview.refetch()}
            />
          ) : (
            preview.data && (
              <>
                <Stepper current={step} steps={steps} />

                <div className="min-h-[320px] py-2">
                  {step === 0 && (
                    <ExitStepDetails form={form} onChange={patch} todayKey={todayKey} />
                  )}
                  {step === 1 && (
                    <ExitStepHandover handover={preview.data.handover} form={form} onChange={patch} />
                  )}
                  {step === 2 && <ExitStepConfirm settlement={preview.data.settlement_preview} />}
                </div>

                <div className="flex items-center justify-between gap-3 border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={step === 0 ? handleClose : () => setStep((s) => Math.max(s - 1, 0))}
                    disabled={isPending}
                  >
                    {step === 0 ? t('cancel') : t('back')}
                  </Button>
                  {isLast ? (
                    <Button
                      type="button"
                      className="h-11 bg-red-600 text-white hover:bg-red-700"
                      onClick={() => setConfirmOpen(true)}
                      disabled={isPending}
                    >
                      {isPending ? t('submitting') : t('submit')}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="h-11 bg-orange-500 text-white hover:bg-orange-600"
                      onClick={handleNext}
                    >
                      {t('next')}
                    </Button>
                  )}
                </div>
              </>
            )
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmTitle', { name: employeeName })}</AlertDialogTitle>
            <AlertDialogDescription>{t('confirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                doSubmit();
              }}
            >
              {isPending ? t('submitting') : t('confirmCta')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
