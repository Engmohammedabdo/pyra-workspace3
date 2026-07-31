import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CheckCircle2, Clock, AlertTriangle, CreditCard } from 'lucide-react';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toPublicInvoicePayload } from '@/lib/invoices/public-payload';
import {
  derivePublicPaymentState,
  type PublicPaymentState,
  type PublicSessionRow,
} from '@/lib/invoices/public-payment-state';
import { INVOICE_STATUS } from '@/lib/constants/statuses';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { dirFor, type Locale } from '@/lib/i18n/config';
import { logError } from '@/lib/observability/log-error';
import { ConfirmingRefresh } from './confirming-refresh';
import type { PublicDocumentLink } from './link-types';

/**
 * The invoice branch of /d/[token] — the walk-in's one URL for view, pay and
 * receipt (plan Task 4).
 *
 * A Server Component with no client bundle beyond ConfirmingRefresh: the only
 * interaction is "follow this link to Stripe", which is an anchor. That also
 * means the payment state below is computed on the server from the ledger on
 * every request, with nothing client-side that could be made to disagree
 * with it.
 */

const BANNER: Record<
  Exclude<PublicPaymentState, 'payable'>,
  { Icon: typeof CheckCircle2; className: string }
> = {
  paid: {
    Icon: CheckCircle2,
    className:
      'border-green-200 bg-green-50 text-green-800 dark:border-green-800/40 dark:bg-green-950/30 dark:text-green-300',
  },
  confirming: {
    Icon: Clock,
    className:
      'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800/40 dark:bg-blue-950/30 dark:text-blue-300',
  },
  partially_paid: {
    Icon: AlertTriangle,
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300',
  },
  link_inactive: {
    Icon: AlertTriangle,
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300',
  },
  unpayable: {
    Icon: AlertTriangle,
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300',
  },
};

const num = (v: unknown) => Number(v ?? 0);

export async function InvoiceDocument({
  token,
  link,
  paidFlag,
  sessionIdFromUrl,
}: {
  token: string;
  link: PublicDocumentLink;
  paidFlag: boolean;
  sessionIdFromUrl: string | null;
}) {
  const supabase = createServiceRoleClient();

  const { data: invoice, error: invoiceErr } = await supabase
    .from('pyra_invoices')
    .select('*')
    .eq('id', link.entity_id)
    .maybeSingle();

  // A DB error must NOT render as "invalid link" — the same rule the quote
  // branch follows, and the same failure mode that kept the /api/shares stack
  // silently dead for five months.
  if (invoiceErr) {
    logError({
      error: invoiceErr,
      metadata: { scope: 'public_invoice_view_lookup', link_id: link.id, token },
    });
    throw new Error(`invoice lookup failed: ${invoiceErr.message}`);
  }
  if (!invoice) notFound();

  // A draft must never be publicly reachable, and a cancelled invoice must not
  // be presented as a live document — collapsing both into notFound() keeps
  // the indistinguishable-response property of the quote branch (S-10).
  const VISIBLE: readonly string[] = [
    INVOICE_STATUS.SENT,
    INVOICE_STATUS.PARTIALLY_PAID,
    INVOICE_STATUS.PAID,
    INVOICE_STATUS.OVERDUE,
  ];
  if (!VISIBLE.includes(invoice.status)) notFound();

  const { data: items, error: itemsErr } = await supabase
    .from('pyra_invoice_items')
    .select('description, quantity, rate, amount')
    .eq('invoice_id', invoice.id)
    .order('sort_order', { ascending: true });

  // A blip here would otherwise render an invoice with no lines and a
  // non-zero total — a document the customer is being asked to pay against.
  if (itemsErr) {
    logError({
      error: itemsErr,
      metadata: { scope: 'public_invoice_view_items', invoice_id: invoice.id, token },
    });
    throw new Error(`invoice items lookup failed: ${itemsErr.message}`);
  }

  const payload = toPublicInvoicePayload(invoice, items ?? []);

  // ── Payment session ──────────────────────────────────────────────────
  // The newest session row for THIS invoice. Scoped by invoice_id even when a
  // session_id came back in the URL: without that filter, someone could paste
  // another invoice's session id and read its state through this page.
  const { data: sessions, error: sessionErr } = await supabase
    .from('pyra_stripe_payments')
    .select('stripe_session_id, status, created_at, metadata')
    .eq('invoice_id', invoice.id)
    .order('created_at', { ascending: false })
    // Bounded, but generously: a quick-pay invoice has exactly one session and
    // even a much-retried one only a handful. If a returning payer's session
    // fell outside this window they would see "pay" instead of "confirming" —
    // wrong, but never a false claim of payment.
    .limit(10);

  if (sessionErr) {
    // Not fatal — the invoice itself still renders, just without a pay button.
    // Logged because a customer silently losing the ability to pay is exactly
    // the kind of thing nobody reports.
    logError({
      severity: 'warning',
      error: sessionErr,
      metadata: { scope: 'public_invoice_view_sessions', invoice_id: invoice.id },
    });
  }

  type SessionRow = {
    stripe_session_id: string | null;
    status: string;
    created_at: string;
    metadata: Record<string, unknown> | null;
  };
  const rows = (sessions ?? []) as SessionRow[];

  const toPublicSession = (r: SessionRow): PublicSessionRow => ({
    status: r.status,
    created_at: r.created_at,
    checkout_url:
      typeof r.metadata?.checkout_url === 'string' ? (r.metadata.checkout_url as string) : null,
  });

  const latest = rows[0] ?? null;
  const matchedReturn =
    paidFlag && sessionIdFromUrl
      ? rows.find((r) => r.stripe_session_id === sessionIdFromUrl) ?? null
      : null;

  // The row the state machine reasons about: the one Stripe just sent them
  // back from if we can match it, otherwise the newest.
  const session = matchedReturn ?? latest;

  const paymentState = derivePublicPaymentState({
    invoiceStatus: invoice.status,
    amountDue: num(invoice.amount_due),
    session: session ? toPublicSession(session) : null,
    // A `?paid=1` that matches no session row of ours is worth exactly
    // nothing — see lib/invoices/public-payment-state.ts.
    returnedFromCheckout: !!matchedReturn,
    nowIso: new Date().toISOString(),
  });

  const checkoutUrl =
    paymentState === 'payable' && session ? toPublicSession(session).checkout_url : null;

  // Surcharge, straight off the session row this page is actually offering —
  // never recomputed here. Recomputing would silently diverge from the amount
  // Stripe is going to charge the moment the settings default changes.
  const meta = (session?.metadata ?? {}) as Record<string, unknown>;
  const surcharge = num(meta.surcharge_amount);
  const surchargePercent = num(meta.surcharge_percent);
  const grossToPay = surcharge > 0 ? num(meta.gross) : num(invoice.amount_due);
  // Derived from the gross, NOT from amount_due. The Stripe session's amount
  // was fixed when it was minted; if a partial payment has landed since,
  // amount_due is smaller than what the button will actually charge, and a
  // breakdown built on it would print rows that do not sum to the total.
  const payBase = Math.round((grossToPay - surcharge) * 100) / 100;

  // ── Recipient language ───────────────────────────────────────────────
  let locale: Locale = 'ar';
  if (invoice.client_id) {
    const { data: client } = await supabase
      .from('pyra_clients')
      .select('preferred_language')
      .eq('id', invoice.client_id)
      .maybeSingle();
    if (client?.preferred_language === 'en') locale = 'en';
  }
  const t = await getTranslations({ locale, namespace: 'publicdoc' });

  // Best-effort view counter, same as the quote branch.
  const { error: viewErr } = await supabase.rpc('pyra_increment_document_link_view', {
    link_id: link.id,
  });
  if (viewErr) {
    logError({
      severity: 'warning',
      error: viewErr,
      metadata: { scope: 'pyra_increment_document_link_view', link_id: link.id },
    });
  }

  const currency = String(payload.currency ?? 'AED');
  // Narrowed once, here, rather than at each use site: `payable` is the only
  // state with no banner, and TS cannot re-narrow `paymentState` from inside
  // the JSX once the lookup has been hoisted into a separate variable.
  const bannerState: Exclude<PublicPaymentState, 'payable'> | null =
    paymentState === 'payable' ? null : paymentState;

  const BANNER_TEXT: Record<Exclude<PublicPaymentState, 'payable'>, { title: string; body: string }> = {
    paid: { title: t('invoicePaidTitle'), body: t('invoicePaidBody') },
    confirming: { title: t('invoiceConfirmingTitle'), body: t('invoiceConfirmingBody') },
    partially_paid: {
      title: t('invoicePartialTitle'),
      body: t('invoicePartialBody', { amount: formatCurrency(num(invoice.amount_due), currency) }),
    },
    link_inactive: { title: t('invoiceLinkInactiveTitle'), body: t('invoiceLinkInactiveBody') },
    unpayable: { title: t('invoiceUnavailableTitle'), body: t('invoiceUnavailableBody') },
  };

  return (
    <div dir={dirFor(locale)} lang={locale} className="mx-auto max-w-[800px] space-y-4 px-4 py-6">
      {/* Only while genuinely waiting on the webhook — a bounded self-refresh
          so the customer sees "paid" without being told to reload. */}
      {paymentState === 'confirming' && <ConfirmingRefresh />}

      {bannerState && (
        <Card className={BANNER[bannerState].className}>
          <CardContent className="flex items-start gap-3 p-4">
            {(() => {
              const Icon = BANNER[bannerState].Icon;
              return <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />;
            })()}
            <div>
              <p className="font-semibold">{BANNER_TEXT[bannerState].title}</p>
              <p className="text-sm opacity-90">{BANNER_TEXT[bannerState].body}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-6 p-6">
          {/* Company header */}
          <div className="space-y-1 border-b pb-4 text-center dark:border-gray-800">
            {typeof payload.company_logo === 'string' && payload.company_logo && (
              // A remote logo URL out of settings (or a per-business-entity
              // one), so next/image would need a configured remote pattern for
              // every entity the company might add.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={payload.company_logo}
                alt=""
                className="mx-auto mb-2 h-12 object-contain"
              />
            )}
            <h1 className="text-xl font-bold">{String(payload.company_name ?? '')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('invoiceNumberLabel')} <span className="font-mono">{String(payload.invoice_number ?? '')}</span>
            </p>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <span className="block text-xs text-muted-foreground">{t('invoiceBilledToLabel')}</span>
              <span>{String(payload.client_name ?? payload.client_company ?? '')}</span>
            </div>
            <div>
              <span className="block text-xs text-muted-foreground">{t('invoiceIssueDateLabel')}</span>
              <span>{formatDate(payload.issue_date as string | null, undefined, locale)}</span>
            </div>
            <div>
              <span className="block text-xs text-muted-foreground">{t('invoiceDueDateLabel')}</span>
              <span>{formatDate(payload.due_date as string | null, undefined, locale)}</span>
            </div>
          </div>

          {/* Items */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 dark:border-gray-800">
                  <th className="p-2 text-start font-medium">{t('invoiceItemDescription')}</th>
                  <th className="w-20 p-2 text-start font-medium">{t('invoiceItemQuantity')}</th>
                  <th className="w-28 p-2 text-start font-medium">{t('invoiceItemRate')}</th>
                  <th className="w-28 p-2 text-start font-medium">{t('invoiceItemAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {payload.items.map((item, idx) => (
                  <tr key={idx} className="border-b dark:border-gray-800">
                    <td className="p-2">{item.description}</td>
                    <td className="p-2 font-mono" dir="ltr">{item.quantity}</td>
                    <td className="p-2 font-mono" dir="ltr">{formatCurrency(item.rate, currency)}</td>
                    <td className="p-2 font-mono" dir="ltr">{formatCurrency(item.amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="ms-auto w-full max-w-xs space-y-1.5 text-sm">
            <Row label={t('invoiceSubtotal')} value={formatCurrency(num(payload.subtotal), currency)} />
            {num(payload.discount_amount) > 0 && (
              <Row
                label={t('invoiceDiscount')}
                value={`-${formatCurrency(num(payload.discount_amount), currency)}`}
              />
            )}
            {num(payload.tax_amount) > 0 && (
              <Row
                label={t('invoiceTax', { rate: num(payload.tax_rate) })}
                value={formatCurrency(num(payload.tax_amount), currency)}
              />
            )}
            <Separator />
            <Row
              label={t('invoiceTotal')}
              value={formatCurrency(num(payload.total), currency)}
              bold
            />
            {num(payload.amount_paid) > 0 && (
              <Row
                label={t('invoiceAmountPaid')}
                value={formatCurrency(num(payload.amount_paid), currency)}
              />
            )}
            <Row
              label={t('invoiceAmountDue')}
              value={formatCurrency(num(payload.amount_due), currency)}
              bold
            />
          </div>

          {/* Pay */}
          {checkoutUrl && (
            <div className="space-y-3 rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800/40 dark:bg-orange-950/30">
              {surcharge > 0 && (
                <div className="space-y-1.5 text-sm">
                  <Row label={t('invoicePayAmount')} value={formatCurrency(payBase, currency)} />
                  <Row
                    label={t('invoiceCardFee', { percent: surchargePercent })}
                    value={formatCurrency(surcharge, currency)}
                  />
                  <Separator />
                  <Row label={t('invoicePayTotal')} value={formatCurrency(grossToPay, currency)} bold />
                </div>
              )}
              <a
                href={checkoutUrl}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-orange-500 font-medium text-white transition-colors hover:bg-orange-600"
              >
                <CreditCard className="h-4 w-4" aria-hidden="true" />
                {t('invoicePayButton', { amount: formatCurrency(grossToPay, currency) })}
              </a>
              <p className="text-center text-xs text-muted-foreground">{t('invoicePayHint')}</p>
            </div>
          )}

          {/* Notes / terms */}
          {typeof payload.notes === 'string' && payload.notes && (
            <div className="text-sm">
              <p className="mb-1 text-xs text-muted-foreground">{t('invoiceNotesLabel')}</p>
              <p className="whitespace-pre-wrap">{payload.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-bold' : ''}`}>
      <span className={bold ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="font-mono" dir="ltr">{value}</span>
    </div>
  );
}
