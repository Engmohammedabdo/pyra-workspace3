'use client';

/**
 * Edit Lead Data dialog — ADMIN-ONLY (gated by `leads.edit_core`).
 *
 * Lets an admin correct/update the lead's own data: identity (name/phone/email),
 * company/firmographics, and commercial fields (deal type, value, source,
 * priority) + the free-text notes column. Submits ONLY the changed data fields
 * through `useUpdateLead` (PATCH /api/crm/leads/[id]) — the API re-gates on
 * `leads.edit_core` (defense-in-depth) and writes a `field_updated` timeline
 * entry per changed field so every edit is traceable.
 *
 * Agents never see this dialog (the button is hidden without the permission) and
 * cannot reach the endpoint (403). Stage moves / follow-ups / activities stay on
 * their own surfaces.
 */

import { useEffect, useState, useCallback, useRef, useId, cloneElement, isValidElement } from 'react';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils/cn';
import { useUpdateLead } from '@/hooks/useLeads';
import { LEAD_DEAL_TYPE_LABELS, LEAD_BILLING_CYCLE_LABELS } from '@/lib/constants/statuses';
import type { PyraSalesLead } from '@/types/database';

const SOURCES = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'referral', label: 'إحالة' },
  { value: 'manual', label: 'يدوي' },
  { value: 'ad', label: 'إعلان' },
  { value: 'social', label: 'سوشيال ميديا' },
  { value: 'website', label: 'الموقع' },
];

const PRIORITIES = [
  { value: 'low', label: 'منخفضة' },
  { value: 'medium', label: 'عادية' },
  { value: 'high', label: 'عالية' },
  { value: 'urgent', label: 'عاجل' },
];

type FormState = {
  name: string;
  phone: string;
  email: string;
  lead_type: 'b2b' | 'b2c';
  company: string;
  industry: string;
  contact_person: string;
  contact_role: string;
  decision_maker: string;
  company_size: string;
  budget_range: string;
  source: string;
  deal_type: string;
  expected_value: string; // string for the number input
  expected_value_currency: string;
  billing_cycle: 'one_time' | 'monthly' | 'quarterly' | 'annual';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  notes: string;
};

function seed(lead: PyraSalesLead): FormState {
  return {
    name: lead.name ?? '',
    phone: lead.phone ?? '',
    email: lead.email ?? '',
    lead_type: (lead.lead_type as 'b2b' | 'b2c') || 'b2b',
    company: lead.company ?? '',
    industry: lead.industry ?? '',
    contact_person: lead.contact_person ?? '',
    contact_role: lead.contact_role ?? '',
    decision_maker: lead.decision_maker ?? '',
    company_size: lead.company_size ?? '',
    budget_range: lead.budget_range ?? '',
    source: lead.source ?? 'manual',
    deal_type: lead.deal_type ?? 'other',
    expected_value: lead.expected_value != null ? String(lead.expected_value) : '',
    expected_value_currency: lead.expected_value_currency || 'AED',
    billing_cycle: (lead.billing_cycle as FormState['billing_cycle']) || 'one_time',
    priority: (lead.priority as FormState['priority']) || 'medium',
    notes: lead.notes ?? '',
  };
}

interface EditLeadDialogProps {
  lead: PyraSalesLead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditLeadDialog({ lead, open, onOpenChange }: EditLeadDialogProps) {
  const [form, setForm] = useState<FormState>(() => seed(lead));
  // Snapshot of the form as it was when the dialog opened. handleSave diffs
  // against this so we PATCH ONLY fields the admin actually changed — this
  // prevents (a) phantom `field_updated` timeline rows on every save and
  // (b) silently writing seeded defaults (deal_type→'other', source→'manual',
  // etc.) onto leads whose DB value was NULL. (Reviewer CONDITIONAL fix.)
  const initialRef = useRef<FormState>(form);
  const update = useUpdateLead();

  // Re-seed whenever the dialog opens (picks up any fresh lead data).
  useEffect(() => {
    if (open) {
      const s = seed(lead);
      setForm(s);
      initialRef.current = s;
    }
  }, [open, lead]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((s) => ({ ...s, [key]: value }));
  }, []);

  async function handleSave() {
    const name = form.name.trim();
    const phone = form.phone.trim();
    if (!name) return toast.error('الاسم مطلوب');
    if (!phone) return toast.error('الهاتف مطلوب');

    // Only the fields the admin actually touched (form vs opened-snapshot).
    const init = initialRef.current;
    const changedKeys = (Object.keys(form) as (keyof FormState)[]).filter(
      (k) => form[k] !== init[k],
    );
    if (changedKeys.length === 0) {
      toast.info('لا توجد تغييرات');
      onOpenChange(false);
      return;
    }

    // Normalize each form field to its DB value (trim, ''→null, number parse).
    const expVal = parseFloat(form.expected_value);
    const normalized: Partial<PyraSalesLead> = {
      name,
      phone,
      email: form.email.trim() || null,
      lead_type: form.lead_type,
      company: form.company.trim() || null,
      industry: form.industry.trim() || null,
      contact_person: form.contact_person.trim() || null,
      contact_role: form.contact_role.trim() || null,
      decision_maker: form.decision_maker.trim() || null,
      company_size: form.company_size.trim() || null,
      budget_range: form.budget_range.trim() || null,
      source: form.source as PyraSalesLead['source'],
      deal_type: form.deal_type || null,
      expected_value: Number.isFinite(expVal) ? expVal : 0,
      expected_value_currency: form.expected_value_currency,
      billing_cycle: form.billing_cycle,
      priority: form.priority,
      notes: form.notes.trim() || null,
    };

    // Pick only the changed keys into the PATCH payload.
    const payload: Partial<PyraSalesLead> = {};
    for (const k of changedKeys) {
      (payload as Record<string, unknown>)[k] = (normalized as Record<string, unknown>)[k];
    }

    try {
      await update.mutateAsync({ id: lead.id, data: payload });
      toast.success('تم تحديث بيانات الـ Lead');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل تحديث البيانات');
    }
  }

  const submitting = update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل بيانات الـ Lead</DialogTitle>
          <DialogDescription>
            تعديل بيانات العميل المحتمل. الحقول المعلّمة بـ * إلزامية. (متاح للمشرف فقط)
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
          className="space-y-5 py-2"
        >
          {/* Contact */}
          <Section title="بيانات الاتصال">
            <Field label="الاسم" required>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} required autoFocus />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="الهاتف" required>
                <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" required />
              </Field>
              <Field label="الإيميل">
                <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
              </Field>
            </div>
          </Section>

          {/* Company */}
          <Section title="الشركة / النوع">
            <Field label="نوع العميل">
              <div className="inline-flex rounded-lg border border-border p-1 bg-muted/40">
                {(['b2b', 'b2c'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set('lead_type', v)}
                    className={cn(
                      'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
                      form.lead_type === v
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {v === 'b2b' ? 'شركة (B2B)' : 'فرد (B2C)'}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="اسم الشركة">
                <Input value={form.company} onChange={(e) => set('company', e.target.value)} />
              </Field>
              <Field label="القطاع">
                <Input value={form.industry} onChange={(e) => set('industry', e.target.value)} />
              </Field>
              <Field label="جهة الاتصال">
                <Input value={form.contact_person} onChange={(e) => set('contact_person', e.target.value)} />
              </Field>
              <Field label="منصب جهة الاتصال">
                <Input value={form.contact_role} onChange={(e) => set('contact_role', e.target.value)} />
              </Field>
              <Field label="صاحب القرار">
                <Input value={form.decision_maker} onChange={(e) => set('decision_maker', e.target.value)} />
              </Field>
              <Field label="حجم الشركة">
                <Select value={form.company_size || 'unset'} onValueChange={(v) => set('company_size', v === 'unset' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">—</SelectItem>
                    <SelectItem value="1-10">1–10</SelectItem>
                    <SelectItem value="11-50">11–50</SelectItem>
                    <SelectItem value="51-200">51–200</SelectItem>
                    <SelectItem value="200+">+200</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="الميزانية">
                <Input value={form.budget_range} onChange={(e) => set('budget_range', e.target.value)} />
              </Field>
            </div>
          </Section>

          {/* Deal */}
          <Section title="تفاصيل الصفقة">
            <Field label="نوع الخدمة">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {Object.entries(LEAD_DEAL_TYPE_LABELS).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set('deal_type', value)}
                    className={cn(
                      'rounded-lg border px-2 py-2 text-xs font-medium transition-colors text-center',
                      form.deal_type === value
                        ? 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300'
                        : 'border-border bg-muted/30 hover:bg-muted text-muted-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="القيمة المتوقعة">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.expected_value}
                  onChange={(e) => set('expected_value', e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="العملة">
                <Select value={form.expected_value_currency} onValueChange={(v) => set('expected_value_currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AED">AED</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="SAR">SAR</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="دورة الفوترة">
                <Select value={form.billing_cycle} onValueChange={(v) => set('billing_cycle', v as FormState['billing_cycle'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(LEAD_BILLING_CYCLE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="المصدر">
                <Select value={form.source} onValueChange={(v) => set('source', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="الأولوية">
                <Select value={form.priority} onValueChange={(v) => set('priority', v as FormState['priority'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          {/* Notes */}
          <Section title="ملاحظات">
            <Field label="ملاحظة">
              <Textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                rows={3}
                placeholder="ملاحظات عن الـ Lead..."
              />
            </Field>
          </Section>

          <DialogFooter className="!flex !flex-row gap-2 !justify-end flex-wrap">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting} className="bg-orange-500 hover:bg-orange-600 text-white">
              {submitting ? <Loader2 className="size-4 animate-spin me-1.5" /> : null}
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label, required, children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  // Associate the <Label> with its control for a11y (mirrors add-lead-modal).
  const generatedId = useId();
  const child = isValidElement(children)
    ? (children as ReactElement<{ id?: string }>)
    : null;
  const controlId = child?.props.id ?? generatedId;
  return (
    <div className="space-y-1">
      <Label htmlFor={controlId} className="text-xs">
        {label}
        {required && <span className="text-destructive ms-0.5">*</span>}
      </Label>
      {child ? cloneElement(child, { id: controlId }) : children}
    </div>
  );
}
