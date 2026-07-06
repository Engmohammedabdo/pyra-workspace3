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
 *   "this number already exists — click to open the existing Lead" link with
 *   the matched lead's id. Submit is NOT blocked.
 */

import { useState, useCallback, useEffect, useRef, useId, cloneElement, isValidElement } from 'react';
import type { ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { useLocale, useTranslations } from 'next-intl';
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
import { useStatusLabels } from '@/lib/i18n/status-labels';
import {
  LEAD_DEAL_TYPE,
  LEAD_BILLING_CYCLE,
  PIPELINE_STAGE_IDS,
} from '@/lib/constants/statuses';
import { dirFor, type Locale } from '@/lib/i18n/config';

interface AddLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DuplicateMatch {
  id: string;
  name: string;
  assigned_display_name: string | null;
}

// Source + priority option VALUES (labels resolved via t()/accessor at render
// time — Phase 3.4: was a local AR-labeled array, duplicated verbatim in
// edit-lead-dialog; source labels live in crm.lead.sources.*, priority in the
// shared leadPriority entity).
const SOURCE_VALUES = ['whatsapp', 'referral', 'manual', 'ad', 'social', 'website'] as const;
const PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'] as const;

const QUICK_DUE_DAYS = [1, 3, 7, 14] as const;
const QUICK_DUE_KEYS: Record<(typeof QUICK_DUE_DAYS)[number], string> = {
  1: 'tomorrow',
  3: 'in3Days',
  7: 'inWeek',
  14: 'in2Weeks',
};

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

function emptyState(defaultFollowUpTitle: string): FormState {
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
    follow_up_title: defaultFollowUpTitle,
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
  const t = useTranslations('crm.modals.addLead');
  const tCommon = useTranslations('common.actions');
  const tQuickDue = useTranslations('crm.modals.quickDue');
  const locale = useLocale() as Locale;
  const dealTypeLabelFor = useStatusLabels('leadDealType');
  const billingCycleLabelFor = useStatusLabels('leadBillingCycle');
  const sourceLabelFor = useTranslations('crm.lead.sources');
  const priorityLabelFor = useStatusLabels('leadPriority');
  const SOURCES = SOURCE_VALUES.map((value) => ({ value, label: sourceLabelFor(value) }));
  const PRIORITIES = PRIORITY_VALUES.map((value) => ({ value, label: priorityLabelFor(value) }));
  const router = useRouter();
  const create = useCreateLead();

  const [form, setForm] = useState<FormState>(() => emptyState(t('defaultFollowUpTitle')));
  const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null);
  const [duplicateLoading, setDuplicateLoading] = useState(false);

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setForm(emptyState(t('defaultFollowUpTitle')));
      setDuplicate(null);
    }
  }, [open, t]);

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
      toast.error(t('requiredName'));
      return null;
    }
    if (!phone) {
      toast.error(t('requiredPhone'));
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
  }, [form, t]);

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
        toast.warning(t('duplicateWarning', { name: dupWarn.existing_lead_name }));
      } else {
        toast.success(t('createSuccess'));
      }

      if (navigate && leadId) {
        onOpenChange(false);
        router.push(`/dashboard/crm/leads/${leadId}`);
      } else {
        // Save and add another → reset, keep open
        setForm(emptyState(t('defaultFollowUpTitle')));
        setDuplicate(null);
      }
    } catch (err) {
      console.error('Create lead failed:', err);
      toast.error(t('createError'));
    }
  }

  const submitting = create.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" dir={dirFor(locale)}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description')}
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
          <Section title={t('sections.contact')}>
            <Field label={t('fields.name')} required>
              <Input value={form.name} onChange={(e) => update('name', e.target.value)} required autoFocus />
            </Field>
            <Field label={t('fields.phone')} required hint={duplicateLoading ? t('phoneSearching') : undefined}>
              <Input
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                inputMode="tel"
                required
              />
            </Field>
            <Field label={t('fields.email')}>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
              />
            </Field>
            {duplicate && <DuplicateNotice match={duplicate} />}
          </Section>

          {/* Company / B2B-B2C ─────────────────────────────── */}
          <Section title={t('sections.company')}>
            <Field label={t('fields.leadTypeB2b')}>
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
                    {v === 'b2b' ? t('fields.leadTypeB2b') : t('fields.leadTypeB2c')}
                  </button>
                ))}
              </div>
            </Field>
            {form.lead_type === 'b2b' && (
              <>
                <Field label={t('fields.company')}>
                  <Input value={form.company} onChange={(e) => update('company', e.target.value)} />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label={t('fields.industry')}>
                    <Input value={form.industry} onChange={(e) => update('industry', e.target.value)} />
                  </Field>
                  <Field label={t('fields.companySize')}>
                    <Select value={form.company_size || 'unset'} onValueChange={(v) => update('company_size', v === 'unset' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder={t('companySizePlaceholder')} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">{t('companySizePlaceholder')}</SelectItem>
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
              <Field label={t('fields.contactPerson')}>
                <Input value={form.contact_person} onChange={(e) => update('contact_person', e.target.value)} />
              </Field>
              <Field label={t('fields.contactRole')}>
                <Input value={form.contact_role} onChange={(e) => update('contact_role', e.target.value)} />
              </Field>
            </div>
            {form.lead_type === 'b2b' && (
              <Field label={t('fields.decisionMaker')}>
                <Input value={form.decision_maker} onChange={(e) => update('decision_maker', e.target.value)} />
              </Field>
            )}
          </Section>

          {/* Deal ─────────────────────────────────────────── */}
          <Section title={t('sections.deal')}>
            <Field label={t('fields.dealType')}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {Object.values(LEAD_DEAL_TYPE).map((value) => (
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
                    {dealTypeLabelFor(value)}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label={t('fields.expectedValue')}>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.expected_value}
                  onChange={(e) => update('expected_value', e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label={t('fields.currency')}>
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
              <Field label={t('fields.billingCycle')}>
                <Select value={form.billing_cycle} onValueChange={(v) => update('billing_cycle', v as FormState['billing_cycle'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.values(LEAD_BILLING_CYCLE).map((v) => (
                      <SelectItem key={v} value={v}>{billingCycleLabelFor(v)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('fields.source')}>
                <Select value={form.source} onValueChange={(v) => update('source', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('fields.priority')}>
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
          <Section title={t('sections.notesFollowUp')}>
            <Field label={t('fields.note')}>
              <Textarea
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                rows={2}
                placeholder={t('notePlaceholder')}
              />
            </Field>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <Label className="text-sm">{t('scheduleFollowUp')}</Label>
                <p className="text-xs text-muted-foreground">{t('scheduleFollowUpHint')}</p>
              </div>
              <Switch
                checked={form.follow_up_enabled}
                onCheckedChange={(v) => update('follow_up_enabled', v)}
              />
            </div>
            {form.follow_up_enabled && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_DUE_DAYS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => update('follow_up_due_at', quickDateLocal(days))}
                      className="rounded-full border border-border bg-background px-3 py-1 text-xs hover:bg-muted"
                    >
                      {tQuickDue(QUICK_DUE_KEYS[days] as Parameters<typeof tQuickDue>[0])}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label={t('followUpTitle')}>
                    <Input
                      value={form.follow_up_title}
                      onChange={(e) => update('follow_up_title', e.target.value)}
                    />
                  </Field>
                  <Field label={t('followUpTime')}>
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
              {tCommon('cancel')}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSave(false)}
                disabled={submitting}
              >
                {submitting ? <Loader2 className="size-4 animate-spin me-1.5" /> : null}
                {t('saveAndAddAnother')}
              </Button>
              <Button type="submit" disabled={submitting} className="bg-orange-500 hover:bg-orange-600 text-white">
                {submitting ? <Loader2 className="size-4 animate-spin me-1.5" /> : null}
                {t('createLead')}
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
  // Associate the <Label> with its control for a11y (was a bare sibling with no
  // htmlFor, so screen readers announced "edit text, blank"). Derive a stable id
  // and inject it into the single child control (preserving any existing id).
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
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DuplicateNotice({ match }: { match: DuplicateMatch }) {
  const t = useTranslations('crm.modals.addLead.duplicateNotice');
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden />
      <p className="leading-5">
        {t('prefix')}
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
          <span className="text-amber-700/80 dark:text-amber-400/80">
            {t('assignedSuffix', { name: match.assigned_display_name })}
          </span>
        )}
        {t('suffix')}
      </p>
    </div>
  );
}
