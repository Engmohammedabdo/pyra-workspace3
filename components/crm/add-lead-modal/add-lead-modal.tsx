'use client';

/**
 * Add Lead modal — used from the Pipeline header, Sales Dashboard, etc.
 *
 * Structure:
 *   <Dialog>
 *     <Form>
 *       Contact   — name*, phone* (with debounced /lookup), email
 *       Company   — B2B/B2C, company, industry, contact_person, contact_role
 *                   decision_maker, budget_range, company_size
 *       Deal      — deal_type, expected_value, currency, billing_cycle, priority
 *       Follow-up — optional title + due_at quick-pick (tomorrow / 3d / 1w / custom)
 *       Notes     — free text
 *     </Form>
 *     Footer: Cancel · Save and add another · Create Lead
 *   </Dialog>
 *
 * Q-API-001 (warn but allow): on phone-blur the form calls
 *   GET /api/crm/leads/lookup?phone=… and renders an inline
 *   "هذا الرقم موجود قبل كده — اضغط لفتح الـ Lead الموجود" link with the
 *   matched lead's id. Submit is NOT blocked.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, AlertCircle, ExternalLink } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils/cn';

import { useCreateLead, type CreateLeadInput } from '@/hooks/useLeads';
import { fetchAPI } from '@/hooks/api-helpers';
import {
  LEAD_DEAL_TYPE_LABELS,
  LEAD_BILLING_CYCLE_LABELS,
  PIPELINE_STAGE_IDS,
} from '@/lib/constants/statuses';

interface AddLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DuplicateMatch {
  id: string;
  name: string;
  assigned_display_name: string | null;
}

const SOURCES = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'referral', label: 'إحالة' },
  { value: 'manual', label: 'يدوي' },
  { value: 'ad', label: 'إعلان' },
  { value: 'social', label: 'سوشيال ميديا' },
  { value: 'website', label: 'الموقع' },
];

const PRIORITIES = [
  { value: 'low',    label: 'منخفضة' },
  { value: 'medium', label: 'عادية' },
  { value: 'high',   label: 'عالية' },
  { value: 'urgent', label: 'عاجل' },
];

type FormState = {
  // Contact
  name: string;
  phone: string;
  email: string;
  // Company
  lead_type: 'b2b' | 'b2c';
  company: string;
  industry: string;
  contact_person: string;
  contact_role: string;
  decision_maker: string;
  company_size: string;
  budget_range: string;
  // Deal
  source: string;
  deal_type: string;
  expected_value: string; // string for input control
  expected_value_currency: string;
  billing_cycle: 'one_time' | 'monthly' | 'quarterly' | 'annual';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  // Notes / follow-up
  notes: string;
  follow_up_enabled: boolean;
  follow_up_title: string;
  follow_up_due_at: string; // ISO datetime-local (YYYY-MM-DDTHH:mm)
};

function emptyState(): FormState {
  return {
    name: '',
    phone: '',
    email: '',
    lead_type: 'b2b',
    company: '',
    industry: '',
    contact_person: '',
    contact_role: '',
    decision_maker: '',
    company_size: '',
    budget_range: '',
    source: 'manual',
    deal_type: 'other',
    expected_value: '',
    expected_value_currency: 'AED',
    billing_cycle: 'one_time',
    priority: 'medium',
    notes: '',
    follow_up_enabled: false,
    follow_up_title: 'متابعة أولى',
    follow_up_due_at: '',
  };
}

function quickDateLocal(daysFromNow: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  // datetime-local expects "YYYY-MM-DDTHH:mm"
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AddLeadModal({ open, onOpenChange }: AddLeadModalProps) {
  const router = useRouter();
  const create = useCreateLead();

  const [form, setForm] = useState<FormState>(emptyState());
  const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null);
  const [duplicateLoading, setDuplicateLoading] = useState(false);

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setForm(emptyState());
      setDuplicate(null);
    }
  }, [open]);

  // Phone-duplicate lookup, debounced 400ms.
  const lookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    if (!form.phone || form.phone.replace(/\D/g, '').length < 7) {
      setDuplicate(null);
      return;
    }
    setDuplicateLoading(true);
    lookupTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetchAPI<{ match: DuplicateMatch | null }>(
          `/api/crm/leads/lookup?phone=${encodeURIComponent(form.phone)}`,
        );
        setDuplicate(res?.match ?? null);
      } catch {
        // soft-fail — duplicate detection is non-blocking
        setDuplicate(null);
      } finally {
        setDuplicateLoading(false);
      }
    }, 400);
    return () => {
      if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    };
  }, [form.phone]);

  const update = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((s) => ({ ...s, [key]: value }));
  }, []);

  const buildPayload = useCallback((): CreateLeadInput | null => {
    const name = form.name.trim();
    const phone = form.phone.trim();
    if (!name) {
      toast.error('الاسم مطلوب');
      return null;
    }
    if (!phone) {
      toast.error('الهاتف مطلوب');
      return null;
    }

    const expVal = parseFloat(form.expected_value);
    const payload: CreateLeadInput = {
      name,
      phone,
      email: form.email.trim() || undefined,
      company: form.company.trim() || undefined,
      lead_type: form.lead_type,
      industry: form.industry.trim() || undefined,
      contact_person: form.contact_person.trim() || undefined,
      contact_role: form.contact_role.trim() || undefined,
      source: form.source,
      deal_type: form.deal_type,
      expected_value: Number.isFinite(expVal) ? expVal : 0,
      expected_value_currency: form.expected_value_currency,
      billing_cycle: form.billing_cycle,
      priority: form.priority,
      notes: form.notes.trim() || undefined,
      stage_id: PIPELINE_STAGE_IDS.NEW_INQUIRY,
    };
    if (form.follow_up_enabled && form.follow_up_due_at && form.follow_up_title.trim()) {
      payload.next_follow_up = new Date(form.follow_up_due_at).toISOString();
      payload.follow_up_title = form.follow_up_title.trim();
    }
    return payload;
  }, [form]);

  async function handleSave(navigate: boolean) {
    const payload = buildPayload();
    if (!payload) return;

    try {
      const res = await create.mutateAsync(payload);
      const leadId = (res as unknown as { lead?: { id: string } })?.lead?.id;
      const dupWarn =
        (res as unknown as { duplicate_warning?: { existing_lead_name: string } | null })
          ?.duplicate_warning ?? null;

      if (dupWarn) {
        toast.warning(`تم الإنشاء — لكن لاحظ وجود Lead سابق برقم مشابه (${dupWarn.existing_lead_name}).`);
      } else {
        toast.success('تم إنشاء الـ Lead');
      }

      if (navigate && leadId) {
        onOpenChange(false);
        router.push(`/dashboard/crm/leads/${leadId}`);
      } else {
        // Save and add another → reset, keep open
        setForm(emptyState());
        setDuplicate(null);
      }
    } catch (err) {
      console.error('Create lead failed:', err);
      toast.error('فشل إنشاء الـ Lead');
    }
  }

  const submitting = create.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>Lead جديد</DialogTitle>
          <DialogDescription>
            ملء بيانات العميل المحتمل. الحقول المعلّمة بـ * إلزامية.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave(true);
          }}
          className="space-y-5 py-2"
        >
          {/* Contact ─────────────────────────────────────── */}
          <Section title="بيانات الاتصال">
            <Field label="الاسم" required>
              <Input value={form.name} onChange={(e) => update('name', e.target.value)} required autoFocus />
            </Field>
            <Field label="الهاتف" required hint={duplicateLoading ? 'جاري البحث...' : undefined}>
              <Input
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                inputMode="tel"
                required
              />
            </Field>
            <Field label="الإيميل">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
              />
            </Field>
            {duplicate && <DuplicateNotice match={duplicate} />}
          </Section>

          {/* Company / B2B-B2C ─────────────────────────────── */}
          <Section title="الشركة / النوع">
            <Field label="نوع العميل">
              <div className="inline-flex rounded-lg border border-border p-1 bg-muted/40">
                {(['b2b', 'b2c'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => update('lead_type', v)}
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
            {form.lead_type === 'b2b' && (
              <>
                <Field label="اسم الشركة">
                  <Input value={form.company} onChange={(e) => update('company', e.target.value)} />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="القطاع">
                    <Input value={form.industry} onChange={(e) => update('industry', e.target.value)} />
                  </Field>
                  <Field label="حجم الشركة">
                    <Select value={form.company_size || 'unset'} onValueChange={(v) => update('company_size', v === 'unset' ? '' : v)}>
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
                </div>
              </>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="جهة الاتصال">
                <Input value={form.contact_person} onChange={(e) => update('contact_person', e.target.value)} />
              </Field>
              <Field label="منصب جهة الاتصال">
                <Input value={form.contact_role} onChange={(e) => update('contact_role', e.target.value)} />
              </Field>
            </div>
            {form.lead_type === 'b2b' && (
              <Field label="صاحب القرار">
                <Input value={form.decision_maker} onChange={(e) => update('decision_maker', e.target.value)} />
              </Field>
            )}
          </Section>

          {/* Deal ─────────────────────────────────────────── */}
          <Section title="تفاصيل الصفقة">
            <Field label="نوع الخدمة">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {Object.entries(LEAD_DEAL_TYPE_LABELS).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => update('deal_type', value)}
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
                  onChange={(e) => update('expected_value', e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="العملة">
                <Select value={form.expected_value_currency} onValueChange={(v) => update('expected_value_currency', v)}>
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
                <Select value={form.billing_cycle} onValueChange={(v) => update('billing_cycle', v as FormState['billing_cycle'])}>
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
                <Select value={form.source} onValueChange={(v) => update('source', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="الأولوية">
                <Select value={form.priority} onValueChange={(v) => update('priority', v as FormState['priority'])}>
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

          {/* Follow-up + Notes ───────────────────────────── */}
          <Section title="ملاحظة + متابعة (اختياري)">
            <Field label="ملاحظة">
              <Textarea
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                rows={2}
                placeholder="ملاحظة سريعة عن الـ Lead..."
              />
            </Field>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <Label className="text-sm">جدولة متابعة</Label>
                <p className="text-xs text-muted-foreground">اختر تاريخ المتابعة الأولى</p>
              </div>
              <Switch
                checked={form.follow_up_enabled}
                onCheckedChange={(v) => update('follow_up_enabled', v)}
              />
            </div>
            {form.follow_up_enabled && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'بكره', days: 1 },
                    { label: 'بعد 3 أيام', days: 3 },
                    { label: 'بعد أسبوع', days: 7 },
                    { label: 'بعد أسبوعين', days: 14 },
                  ].map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => update('follow_up_due_at', quickDateLocal(q.days))}
                      className="rounded-full border border-border bg-background px-3 py-1 text-xs hover:bg-muted"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="عنوان المتابعة">
                    <Input
                      value={form.follow_up_title}
                      onChange={(e) => update('follow_up_title', e.target.value)}
                    />
                  </Field>
                  <Field label="الوقت">
                    <Input
                      type="datetime-local"
                      value={form.follow_up_due_at}
                      onChange={(e) => update('follow_up_due_at', e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            )}
          </Section>

          <DialogFooter className="!flex !flex-row gap-2 !justify-between flex-wrap">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              إلغاء
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSave(false)}
                disabled={submitting}
              >
                {submitting ? <Loader2 className="size-4 animate-spin me-1.5" /> : null}
                حفظ + Lead جديد
              </Button>
              <Button type="submit" disabled={submitting} className="bg-orange-500 hover:bg-orange-600 text-white">
                {submitting ? <Loader2 className="size-4 animate-spin me-1.5" /> : null}
                إنشاء الـ Lead
              </Button>
            </div>
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
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive ms-0.5">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DuplicateNotice({ match }: { match: DuplicateMatch }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden />
      <p className="leading-5">
        هذا الرقم موجود قبل كده —{' '}
        <Link
          href={`/dashboard/crm/leads/${match.id}`}
          target="_blank"
          rel="noreferrer"
          className="font-semibold underline underline-offset-2 inline-flex items-center gap-1"
        >
          {match.name}
          <ExternalLink className="size-3" />
        </Link>
        {match.assigned_display_name && (
          <span className="text-amber-700/80 dark:text-amber-400/80"> · مع {match.assigned_display_name}</span>
        )}
        . تقدر تستمر في إنشاء Lead جديد لو كانت صفقة منفصلة.
      </p>
    </div>
  );
}
