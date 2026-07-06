'use client';

/**
 * Deals tab — full list of contracts and invoices linked to this lead.
 *
 * Phase 5 view: read-only listing. Contract creation lives elsewhere
 * (/dashboard/finance/contracts). Stage-7 approval flow attaches contracts
 * here via the move-stage modal.
 */

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { FileSignature, Receipt, Plus, FileText } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { Locale } from '@/lib/i18n/config';
import { useLeadQuotes } from '@/hooks/useQuotes';
import { usePermission } from '@/hooks/usePermission';
import type { LeadDetail } from '@/hooks/useLeads';

export function LeadDealsTab({ data }: { data: LeadDetail }) {
  const t = useTranslations('crm.leadTabs.deals');
  const locale = useLocale() as Locale;
  const quoteStatusLabelFor = useStatusLabels('quote');
  const invoiceStatusLabelFor = useStatusLabels('invoice');
  const { lead, contracts, invoices, payments_summary } = data;
  // Gap #5b — quotes linked to this lead (closes issue #7). The owning agent
  // can finally SEE the quotes they created for the lead (Gap #5a scoping).
  const quotesQuery = useLeadQuotes(lead.id);
  const quotes = quotesQuery.data ?? [];
  const canCreateQuote = usePermission('quotes.create');

  return (
    <div className="space-y-4">
      {/* Quotes — Gap #5b (closes issue #7) */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="size-4 text-orange-500" /> {t('quotesHeading')}
            {quotes.length > 0 && (
              <Badge variant="outline" className="bg-muted/50 tabular-nums">{quotes.length}</Badge>
            )}
          </h3>
          {canCreateQuote && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/quotes/new?lead_id=${lead.id}`}>
                <Plus className="size-4 me-1" /> {t('newQuote')}
              </Link>
            </Button>
          )}
        </div>

        {quotesQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : quotes.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t('emptyQuotesTitle')}
            description={t('emptyQuotesDescription')}
            className="py-8"
          />
        ) : (
          <ul className="divide-y divide-border">
            {quotes.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/dashboard/quotes/${q.id}`}
                  className="flex items-center justify-between gap-3 py-2 -mx-1 px-1 rounded hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{q.quote_number}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(q.created_at, undefined, locale)}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {quoteStatusLabelFor(q.status)}
                  </Badge>
                  <span className="text-sm font-semibold tabular-nums shrink-0">
                    {formatCurrency(Number(q.total) || 0, q.currency || 'AED')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Contracts */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileSignature className="size-4 text-orange-500" /> {t('contractsHeading')}
            {contracts.length > 0 && (
              <Badge variant="outline" className="bg-muted/50 tabular-nums">{contracts.length}</Badge>
            )}
          </h3>
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/finance/contracts?lead_id=${lead.id}`}>
              <Plus className="size-4 me-1" /> {t('newContract')}
            </Link>
          </Button>
        </div>

        {contracts.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title={t('emptyContractsTitle')}
            description={t('emptyContractsDescription')}
            className="py-8"
          />
        ) : (
          <ul className="space-y-2">
            {contracts.map((c) => {
              const billed = Number(c.amount_billed) || 0;
              const collected = Number(c.amount_collected) || 0;
              const total = Number(c.total_value) || 0;
              const remaining = Math.max(0, total - collected);
              return (
                <li key={c.id}>
                  <Link
                    href={`/dashboard/finance/contracts/${c.id}`}
                    className="block rounded-lg border border-border p-4 hover:border-orange-300 dark:hover:border-orange-700/60 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{c.title ?? t('untitledContract')}</p>
                        {c.contract_type && (
                          <p className="text-xs text-muted-foreground mt-0.5 capitalize">{c.contract_type}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="capitalize shrink-0">{c.status}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <Stat label={t('statTotal')} value={formatCurrency(total, c.currency || 'AED')} />
                      <Stat label={t('statBilled')} value={formatCurrency(billed, c.currency || 'AED')} />
                      <Stat label={t('statPaid')} value={formatCurrency(collected, c.currency || 'AED')} tone="emerald" />
                      <Stat label={t('statRemaining')} value={formatCurrency(remaining, c.currency || 'AED')} tone={remaining > 0 ? 'orange' : 'gray'} />
                    </div>
                    {(c.start_date || c.end_date) && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {c.start_date ? formatDate(c.start_date, undefined, locale) : '—'}
                        {' → '}
                        {c.end_date ? formatDate(c.end_date, undefined, locale) : '—'}
                      </p>
                    )}
                    {c.retainer_amount && Number(c.retainer_amount) > 0 && (
                      <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                        {t('retainerLine', {
                          cycle: c.retainer_cycle ?? 'monthly',
                          amount: formatCurrency(Number(c.retainer_amount), c.currency || 'AED'),
                        })}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Invoices */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Receipt className="size-4 text-orange-500" /> {t('invoicesHeading')}
            {invoices.length > 0 && (
              <Badge variant="outline" className="bg-muted/50 tabular-nums">{invoices.length}</Badge>
            )}
          </h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {t('totalPaidLabel', { amount: formatCurrency(payments_summary.total_paid, payments_summary.currency) })}
          </span>
        </div>

        {invoices.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={t('emptyInvoicesTitle')}
            description={t('emptyInvoicesDescription')}
            className="py-8"
          />
        ) : (
          <ul className="divide-y divide-border">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <Link
                  href={`/dashboard/invoices/${inv.id}`}
                  className="flex items-center justify-between py-2 hover:bg-muted/30 -mx-1 px-1 rounded"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">#{inv.invoice_number ?? inv.id}</p>
                    {inv.due_date && (
                      <p className="text-xs text-muted-foreground">{t('invoiceDue', { date: formatDate(inv.due_date, undefined, locale) })}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="me-3 capitalize">
                    {invoiceStatusLabelFor(inv.status)}
                  </Badge>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatCurrency(Number(inv.total) || 0, inv.currency ?? 'AED')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone = 'gray' }: { label: string; value: string; tone?: 'gray' | 'orange' | 'emerald' }) {
  const toneClass =
    tone === 'orange' ? 'text-orange-600 dark:text-orange-400'
    : tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-foreground';
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={`font-semibold tabular-nums mt-0.5 ${toneClass}`}>{value}</div>
    </div>
  );
}
