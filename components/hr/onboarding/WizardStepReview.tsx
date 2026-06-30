'use client';

import { Textarea } from '@/components/ui/textarea';
import type { CreateOnboardingInput } from '@/hooks/useOnboarding';
import { Field } from './WizardStepPersonal';
import { Input } from '@/components/ui/input';

type FormData = CreateOnboardingInput;
type OnChange = (patch: Partial<FormData>) => void;

export function StepReview({
  data,
  onChange,
}: {
  data: FormData;
  onChange: OnChange;
}) {
  const monthly =
    data.basic + data.housing + data.transport + data.communication + data.other;

  return (
    <div className="space-y-6">
      {/* Signatory fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="اسم الموقّع (المفوّض)" required>
          <Input
            className="h-11"
            value={data.signatoryName}
            onChange={(e) => onChange({ signatoryName: e.target.value })}
            placeholder="Mohammed Al-Harbi"
          />
        </Field>
        <Field label="منصب الموقّع" required>
          <Input
            className="h-11"
            value={data.signatoryTitle}
            onChange={(e) => onChange({ signatoryTitle: e.target.value })}
            placeholder="CEO / HR Manager"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="ملاحظات داخلية (اختياري)">
            <Textarea
              className="min-h-[72px] resize-none"
              placeholder="ملاحظات خاصة بسجل التعيين..."
              value={data.notes ?? ''}
              onChange={(e) =>
                onChange({ notes: e.target.value || undefined })
              }
            />
          </Field>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-lg border bg-muted/30 dark:bg-muted/10 p-4 space-y-3 text-sm">
        <p className="font-semibold text-base">ملخص التعيين</p>
        <div className="grid grid-cols-2 gap-y-2 gap-x-6">
          <span className="text-muted-foreground">الاسم</span>
          <span className="font-medium">{data.nameAr || data.nameEn || '—'}</span>
          <span className="text-muted-foreground">المسمى</span>
          <span className="font-medium">{data.titleAr || data.titleEn || '—'}</span>
          <span className="text-muted-foreground">تاريخ الالتحاق</span>
          <span className="font-medium">{data.startDate || '—'}</span>
          <span className="text-muted-foreground">الإجمالي الشهري</span>
          <span className="font-medium text-orange-600 dark:text-orange-400">
            {monthly.toLocaleString('ar-AE')} د.إ
          </span>
          <span className="text-muted-foreground">عدد بنود العهدة</span>
          <span className="font-medium">{data.assets.length}</span>
          <span className="text-muted-foreground">بنود إضافية</span>
          <span className="font-medium">{data.customClauses.length}</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        عند الضغط على «إتمام التعيين» سيتم: إنشاء حساب الموظف، توليد عرض العمل
        واتفاقية السرية ونموذج تسليم العهدة (PDF)، وبدء قائمة مهام الإيبورد.
      </p>
    </div>
  );
}
