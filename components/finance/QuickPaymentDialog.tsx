'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations, useLocale } from 'next-intl';
import { toast } from 'sonner';
import {
  Zap, Copy, Loader2, ExternalLink, MessageCircle, ChevronDown, CheckCircle2, UserCheck,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { fetchAPI, ApiError } from '@/hooks/api-helpers';
import {
  useQuickPaymentLink, useQuickPaymentMatch, type QuickPaymentLinkResult,
} from '@/hooks/useInvoices';
import { calcSurcharge } from '@/lib/stripe/surcharge';
import { isMatchablePhone } from '@/lib/finance/quick-payment-match';
import { whatsAppHref } from '@/lib/utils/whatsapp';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { Locale } from '@/lib/i18n/config';

interface QuickPaymentDefaults {
  surcharge_percent: number;
  default_currency: string;
  currencies: string[];
  max_surcharge_percent: number;
  stripe_enabled: boolean;
}

/**
 * Name + amount → a payable link, in one dialog.
 *
 * Two-phase and deliberately does NOT close on success: the URL it just minted
 * is the entire product of the interaction, and it exists nowhere else in the
 * UI afterwards. Closing on success would throw it away, which is the failure
 * mode the quote link dialog documents at length (S-5).
 */
export function QuickPaymentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('finance.invoices.quickPay');
  const locale = useLocale() as Locale;
  const mutation = useQuickPaymentLink();

  const defaultsQuery = useQuery<QuickPaymentDefaults>({
    queryKey: ['quick-payment-defaults'],
    queryFn: () => fetchAPI('/api/finance/quick-payment-link'),
    // Only ask once the dialog is actually open — the toolbar button should
    // not cost a request on every invoices-page render.
    enabled: open,
    staleTime: 60_000,
  });

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('');
  const [surchargeInput, setSurchargeInput] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [result, setResult] = useState<QuickPaymentLinkResult | null>(null);

  // ── Phone match ──
  // Debounced so the lookup fires on a settled number, not per keystroke.
  const [debouncedPhone, setDebouncedPhone] = useState('');
  // The operator's explicit "no, different person" — the match is offered by
  // default (they typed the number to find them) but never forced.
  const [rejectedMatch, setRejectedMatch] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedPhone(phone.trim()), 500);
    return () => clearTimeout(timer);
  }, [phone]);

  const matchQuery = useQuickPaymentMatch(
    debouncedPhone,
    open && !result && isMatchablePhone(debouncedPhone),
  );
  const match = matchQuery.data;

  // A new number is a new question — an earlier "not them" must not silently
  // suppress the match for whoever is standing at the counter now.
  useEffect(() => { setRejectedMatch(false); }, [debouncedPhone]);

  // A matched lead wins over a matched client: it resolves to the same customer
  // when the lead already has one, and carries the CRM link when it does not.
  const activeLead = !rejectedMatch ? match?.lead ?? null : null;
  const activeClient = !rejectedMatch && !activeLead ? match?.client ?? null : null;
  const hasActiveMatch = !!(activeLead || activeClient);

  // Fresh form every time the dialog opens. Without this, the previous
  // walk-in's name and amount are pre-filled for the next one — the exact way
  // a wrong amount gets charged to the wrong person.
  useEffect(() => {
    if (!open) return;
    setName('');
    setAmount('');
    setSurchargeInput('');
    setDescription('');
    setEmail('');
    setPhone('');
    setShowMore(false);
    setResult(null);
    setDebouncedPhone('');
    setRejectedMatch(false);
    mutation.reset();
    // `mutation` is recreated each render by useMutation; depending on it here
    // would re-run this effect constantly and wipe the form as the user types.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Seed the currency and surcharge from the server defaults once they land,
  // without clobbering anything the user has already changed.
  const defaults = defaultsQuery.data;
  useEffect(() => {
    if (!defaults) return;
    setCurrency((c) => c || defaults.default_currency);
    setSurchargeInput((s) => (s === '' ? String(defaults.surcharge_percent) : s));
  }, [defaults]);

  const parsedAmount = Number(amount);
  const parsedSurcharge = Number(surchargeInput);
  const maxSurcharge = defaults?.max_surcharge_percent ?? 10;

  const preview = useMemo(() => {
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return null;
    // The same pure function the server uses, so the number quoted at the
    // counter is the number Stripe charges — additive, never multiplicative.
    return calcSurcharge(parsedAmount, Number.isFinite(parsedSurcharge) ? parsedSurcharge : 0);
  }, [parsedAmount, parsedSurcharge]);

  const surchargeOutOfRange =
    surchargeInput !== '' &&
    (!Number.isFinite(parsedSurcharge) || parsedSurcharge < 0 || parsedSurcharge > maxSurcharge);

  // A matched customer supplies the name, so the field stops being required
  // once one is accepted — the operator should not have to retype a name the
  // system just showed them.
  const canSubmit =
    (!!name.trim() || hasActiveMatch) &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    !surchargeOutOfRange &&
    !mutation.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      const res = await mutation.mutateAsync({
        // The matched customer's own name is the better label, and the server
        // overrides it with their stored details anyway — but `name` is
        // required by the API, so fall back to it rather than sending blank.
        name: name.trim() || activeLead?.name || activeClient?.name || '',
        amount: parsedAmount,
        currency: currency || undefined,
        description: description.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        // ALWAYS send the exact rate the preview used, never "only when it
        // differs from the default". An emptied field reads as 0 in the
        // preview above, so omitting it there would let the server re-apply
        // the configured default and charge a fee the operator was shown as
        // zero. Preview and charge must be the same number by construction.
        surcharge_percent: Number.isFinite(parsedSurcharge) ? parsedSurcharge : 0,
        // Only ever an id the operator was shown and did not reject. The server
        // re-verifies both, so a stale id here fails loudly rather than
        // attaching the payment to the wrong account.
        lead_id: activeLead?.id,
        client_id: activeClient?.id,
      });
      setResult(res);
      toast.success(t('createdToast', { invoiceNumber: res.invoice_number }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('createError'));
    }
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('copiedToast'));
    } catch {
      toast.error(t('copyFailed'));
    }
  };

  const waHref = result
    ? whatsAppHref(phone, t('whatsappMessage', { url: result.public_url }))
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-orange-600 dark:text-orange-400" aria-hidden="true" />
            {result ? t('resultTitle') : t('title')}
          </DialogTitle>
          <DialogDescription>
            {result ? t('resultDescription') : t('description')}
          </DialogDescription>
        </DialogHeader>

        {defaultsQuery.data?.stripe_enabled === false && !result && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300">
            {t('stripeDisabled')}
          </p>
        )}

        {result ? (
          /* ── Phase 2: the link ── */
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800/40 dark:bg-green-950/30 dark:text-green-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {t('createdSummary', {
                  invoiceNumber: result.invoice_number,
                  amount: formatCurrency(result.gross, result.currency),
                })}
              </span>
            </div>

            {result.lead_linked && (
              <p className="text-xs text-muted-foreground">{t('resultLeadLinked')}</p>
            )}
            {!result.client_created && !result.lead_linked && (
              <p className="text-xs text-muted-foreground">{t('resultClientReused')}</p>
            )}
            {result.lead_link_skipped === 'no_permission' && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {t('resultLeadLinkSkipped')}
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="quickpay-url">{t('urlLabel')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="quickpay-url"
                  value={result.public_url}
                  readOnly
                  dir="ltr"
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopy(result.public_url)}
                  aria-label={t('copyButton')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('urlHint')}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" asChild>
                <a href={result.public_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 me-2" /> {t('openButton')}
                </a>
              </Button>
              {/* whatsAppHref returns null below 7 digits, so without this
                  branch the button would render and silently do nothing. */}
              {waHref ? (
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={waHref} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-3.5 w-3.5 me-2" /> {t('whatsappButton')}
                  </a>
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled title={t('whatsappNoPhone')}>
                  <MessageCircle className="h-3.5 w-3.5 me-2" /> {t('whatsappButton')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* ── Phase 1: the form ── */
          <div className="space-y-4">
            {/* Phone first, deliberately: typing it is what tells us whether
                this person is already a lead or a customer, and the answer
                changes what the rest of the form needs. */}
            <div className="space-y-1.5">
              <Label htmlFor="quickpay-phone">{t('phoneLabel')}</Label>
              <Input
                id="quickpay-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t('phonePlaceholder')}
                dir="ltr"
                autoFocus
              />
              {!hasActiveMatch && !matchQuery.isFetching && (
                <p className="text-xs text-muted-foreground">{t('phoneHint')}</p>
              )}
            </div>

            {matchQuery.isFetching && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                {t('matchSearching')}
              </p>
            )}

            {hasActiveMatch && (
              <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800/40 dark:bg-blue-950/30">
                <UserCheck
                  className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium text-blue-900 dark:text-blue-200">
                    {activeLead
                      ? t('matchLeadTitle', { name: activeLead.name })
                      : t('matchClientTitle', { name: activeClient?.name ?? '' })}
                  </p>
                  <p className="text-xs text-blue-800/80 dark:text-blue-300/80">
                    {activeLead
                      ? activeLead.client_id
                        ? t('matchLeadHasClient')
                        : t('matchLeadWillLink', {
                            stage: activeLead.stage ?? '—',
                            date: formatDate(activeLead.created_at, undefined, locale),
                          })
                      : t('matchClientBody')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRejectedMatch(true)}
                    className="text-xs underline underline-offset-2 opacity-70 hover:opacity-100"
                  >
                    {t('matchReject')}
                  </button>
                </div>
              </div>
            )}

            {rejectedMatch && match?.matched && (
              <p className="text-xs text-muted-foreground">
                {t('matchRejected')}{' '}
                <button
                  type="button"
                  onClick={() => setRejectedMatch(false)}
                  className="underline underline-offset-2"
                >
                  {t('matchUndo')}
                </button>
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="quickpay-name">
                {hasActiveMatch ? t('nameLabelOptional') : t('nameLabel')}
              </Label>
              <Input
                id="quickpay-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  activeLead?.name ?? activeClient?.name ?? t('namePlaceholder')
                }
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-[1fr_7rem] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="quickpay-amount">{t('amountLabel')}</Label>
                <Input
                  id="quickpay-amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  dir="ltr"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quickpay-currency">{t('currencyLabel')}</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="quickpay-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(defaults?.currencies ?? ['AED']).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quickpay-surcharge">{t('surchargeLabel')}</Label>
              <Input
                id="quickpay-surcharge"
                type="number"
                inputMode="decimal"
                min="0"
                max={maxSurcharge}
                step="0.01"
                value={surchargeInput}
                onChange={(e) => setSurchargeInput(e.target.value)}
                dir="ltr"
                className="font-mono"
              />
              {surchargeOutOfRange ? (
                <p className="text-xs text-destructive">
                  {t('surchargeOutOfRange', { max: maxSurcharge })}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{t('surchargeHint')}</p>
              )}
            </div>

            {preview && (
              <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm dark:border-gray-800">
                <PreviewRow
                  label={t('previewBase')}
                  value={formatCurrency(parsedAmount, currency || 'AED')}
                />
                <PreviewRow
                  label={t('previewSurcharge')}
                  value={formatCurrency(preview.surcharge, currency || 'AED')}
                />
                <Separator />
                <PreviewRow
                  label={t('previewGross')}
                  value={formatCurrency(preview.gross, currency || 'AED')}
                  bold
                />
                <p className="pt-1 text-xs text-muted-foreground">{t('previewNote')}</p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showMore ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
              {t('moreToggle')}
            </button>

            {showMore && (
              <div className="space-y-3 border-s-2 ps-3 dark:border-gray-800">
                <div className="space-y-1.5">
                  <Label htmlFor="quickpay-description">{t('descriptionLabel')}</Label>
                  <Textarea
                    id="quickpay-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('descriptionPlaceholder')}
                    maxLength={500}
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="quickpay-email">{t('emailLabel')}</Label>
                  <Input
                    id="quickpay-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground">{t('emailHint')}</p>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {result ? t('doneButton') : t('cancelButton')}
          </Button>
          {!result && (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              {mutation.isPending && (
                <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {t('createButton')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-bold' : ''}`}>
      <span className={bold ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="font-mono" dir="ltr">{value}</span>
    </div>
  );
}
