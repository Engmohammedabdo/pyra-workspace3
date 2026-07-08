'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, Plus } from 'lucide-react';
import { ASSET_TYPES_AR } from '@/lib/constants/onboarding';
import type { CreateOnboardingInput } from '@/hooks/useOnboarding';
import { Field } from './WizardStepPersonal';

type FormData = CreateOnboardingInput;
type OnChange = (patch: Partial<FormData>) => void;

export function StepClauses({
  data,
  onChange,
}: {
  data: FormData;
  onChange: OnChange;
}) {
  const currency = data.currency || 'AED';

  const addClause = () =>
    onChange({
      customClauses: [...data.customClauses, { title: '', body: '' }],
    });

  const updateClause = (
    i: number,
    patch: Partial<{ title: string; body: string }>,
  ) => {
    const next = [...data.customClauses];
    next[i] = { ...next[i], ...patch };
    onChange({ customClauses: next });
  };

  const removeClause = (i: number) => {
    const next = [...data.customClauses];
    next.splice(i, 1);
    onChange({ customClauses: next });
  };

  const addAsset = () =>
    onChange({
      assets: [
        ...data.assets,
        {
          type: ASSET_TYPES_AR[0],
          description: '',
          serial: '',
          condition: 'جيد',
          value: '',
          notes: '',
        },
      ],
    });

  const updateAsset = (i: number, patch: Partial<FormData['assets'][0]>) => {
    const next = [...data.assets];
    next[i] = { ...next[i], ...patch };
    onChange({ assets: next });
  };

  const removeAsset = (i: number) => {
    const next = [...data.assets];
    next.splice(i, 1);
    onChange({ assets: next });
  };

  return (
    <div className="space-y-8">
      {/* Custom clauses */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">بنود إضافية في عرض العمل</h3>
          <Button type="button" variant="outline" size="sm" onClick={addClause}>
            <Plus className="h-4 w-4 me-1" />
            إضافة بند
          </Button>
        </div>
        {data.customClauses.map((clause, i) => (
          <div key={i} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                className="h-9 flex-1"
                placeholder="عنوان البند (اختياري)"
                value={clause.title ?? ''}
                onChange={(e) => updateClause(i, { title: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => removeClause(i)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              className="min-h-[72px] resize-none"
              placeholder="نص البند..."
              value={clause.body}
              onChange={(e) => updateClause(i, { body: e.target.value })}
            />
          </div>
        ))}
        {data.customClauses.length === 0 && (
          <p className="text-sm text-muted-foreground">لا توجد بنود إضافية</p>
        )}
      </div>

      {/* Assets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">العهدة (الأجهزة والأصول)</h3>
          <Button type="button" variant="outline" size="sm" onClick={addAsset}>
            <Plus className="h-4 w-4 me-1" />
            إضافة بند عهدة
          </Button>
        </div>
        {data.assets.map((asset, i) => (
          <div key={i} className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">بند #{i + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => removeAsset(i)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="النوع">
                <Select
                  value={asset.type || ASSET_TYPES_AR[0]}
                  onValueChange={(v) => updateAsset(i, { type: v })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES_AR.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="الوصف">
                <Input
                  className="h-11"
                  placeholder="MacBook Pro 14-inch"
                  value={asset.description}
                  onChange={(e) => updateAsset(i, { description: e.target.value })}
                />
              </Field>
              <Field label="الرقم التسلسلي">
                <Input
                  className="h-11"
                  placeholder="SN-XXXXXXXX"
                  value={asset.serial}
                  onChange={(e) => updateAsset(i, { serial: e.target.value })}
                  dir="ltr"
                />
              </Field>
              <Field label="الحالة">
                <Select
                  value={asset.condition || 'جيد'}
                  onValueChange={(v) => updateAsset(i, { condition: v })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="جديد">جديد</SelectItem>
                    <SelectItem value="جيد">جيد</SelectItem>
                    <SelectItem value="متوسط">متوسط</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={`القيمة التقديرية (${currency})`}>
                <Input
                  className="h-11"
                  placeholder="0"
                  value={asset.value}
                  onChange={(e) => updateAsset(i, { value: e.target.value })}
                />
              </Field>
              <Field label="ملاحظات">
                <Input
                  className="h-11"
                  placeholder="ملاحظات اختيارية"
                  value={asset.notes}
                  onChange={(e) => updateAsset(i, { notes: e.target.value })}
                />
              </Field>
            </div>
          </div>
        ))}
        {data.assets.length === 0 && (
          <p className="text-sm text-muted-foreground">لا توجد عهدة</p>
        )}
      </div>
    </div>
  );
}
