'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { useUsers } from '@/hooks/useUsers';
import {
  StepPersonal,
  StepPosition,
  StepCompensation,
  StepClauses,
  StepReview,
} from './WizardSteps';

// ────────────────────────────────────────────────────────────────────────────
// Default form data
// ────────────────────────────────────────────────────────────────────────────

function defaultForm(): CreateOnboardingInput {
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
    basic: 0,
    housing: 0,
    transport: 0,
    communication: 0,
    other: 0,
    commissionRate: undefined,
    monthlyTarget: undefined,
    customClauses: [],
    assets: [],
    signatoryName: '',
    signatoryTitle: '',
    notes: undefined,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Step metadata
// ────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { label: 'بيانات شخصية' },
  { label: 'الوظيفة' },
  { label: 'التعويض' },
  { label: 'البنود والعهدة' },
  { label: 'مراجعة' },
];

// ────────────────────────────────────────────────────────────────────────────
// Stepper indicator
// ────────────────────────────────────────────────────────────────────────────

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {STEPS.map((s, i) => {
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
            {i < STEPS.length - 1 && (
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
// Validation per step
// ────────────────────────────────────────────────────────────────────────────

function validateStep(step: number, data: CreateOnboardingInput): string | null {
  switch (step) {
    case 0:
      if (!data.nameEn.trim()) return 'الاسم بالإنجليزية مطلوب';
      if (!data.nameAr.trim()) return 'الاسم بالعربية مطلوب';
      if (!data.username.trim()) return 'اسم المستخدم مطلوب';
      if (!data.password.trim() || data.password.length < 8)
        return 'كلمة المرور يجب أن تكون 8 أحرف على الأقل';
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
      return null;
    default:
      return null;
  }
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
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CreateOnboardingInput>(defaultForm);

  const { data: usersData = [] } = useUsers();
  const createOnboarding = useCreateOnboarding();

  function patch(update: Partial<CreateOnboardingInput>) {
    setForm((prev) => ({ ...prev, ...update }));
  }

  function handleClose() {
    setStep(0);
    setForm(defaultForm());
    onClose();
  }

  function handleNext() {
    const err = validateStep(step, form);
    if (err) {
      toast.error(err);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit() {
    const err = validateStep(step, form);
    if (err) {
      toast.error(err);
      return;
    }

    try {
      const result = await createOnboarding.mutateAsync(form);
      toast.success('تم إنشاء سجل التعيين بنجاح 🎉');
      handleClose();
      router.push(`/dashboard/hr/onboarding/${result.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'حدث خطأ أثناء التعيين';
      toast.error(msg);
    }
  }

  const isLast = step === STEPS.length - 1;
  const isPending = createOnboarding.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تعيين موظف جديد</DialogTitle>
        </DialogHeader>

        <Stepper current={step} />

        <div className="min-h-[300px] py-2">
          {step === 0 && <StepPersonal data={form} onChange={patch} />}
          {step === 1 && (
            <StepPosition data={form} onChange={patch} allUsers={usersData} />
          )}
          {step === 2 && <StepCompensation data={form} onChange={patch} />}
          {step === 3 && <StepClauses data={form} onChange={patch} />}
          {step === 4 && <StepReview data={form} onChange={patch} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={step === 0 ? handleClose : handleBack}
            disabled={isPending}
          >
            {step === 0 ? 'إلغاء' : 'السابق'}
          </Button>
          {isLast ? (
            <Button
              type="button"
              className="bg-orange-500 hover:bg-orange-600 text-white h-11"
              onClick={handleSubmit}
              disabled={isPending}
            >
              {isPending ? 'جاري التعيين...' : 'إتمام التعيين'}
            </Button>
          ) : (
            <Button
              type="button"
              className="bg-orange-500 hover:bg-orange-600 text-white h-11"
              onClick={handleNext}
            >
              التالي
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
