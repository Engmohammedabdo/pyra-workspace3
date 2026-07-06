'use client';

/**
 * One contract block on the Customer-Contracts Tab.
 *
 * Visual treatment differs by `contract.type` × `contract.status`:
 *   - Active retainer       → emerald border emphasis
 *   - In-progress project   → orange/amber accent
 *   - Completed (any type)  → opacity-70 + muted bg
 *   - Other (paused/cancel) → default
 *
 * 4-stat block changes per type:
 *   - retainer  → monthly value · total paid · remaining months · end date
 *   - project   → total · paid · remaining · milestones (X/N)
 *   - one-off   → total · paid · duration · status
 *
 * Inline children:
 *   - retainer with invoices  → <ContractBillingHistory>
 *   - project with milestones → <ContractMilestones>
 *
 * Actions (Q-D2 deviation): the workspace has no standalone /api/finance/
 * contracts/[id]/pdf route — viewing/PDF download both happen on the
 * existing contract detail page. We collapse to a SINGLE "عرض العقد" link
 * button (not the originally-approved 2 buttons). The detail page handles
 * View, Download PDF, Generate Invoice, and the rest of the lifecycle.
 * Documented in commit message; v1.1 can split actions if a separate
 * PDF-download route lands.
 */

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { Locale } from '@/lib/i18n/config';
import { cn } from '@/lib/utils/cn';
import { ContractBillingHistory } from './contract-billing-history';
import { ContractMilestones } from './contract-milestones';
import type { DossierContract } from '@/hooks/useCustomerDossier';

interface Props {
  contract: DossierContract;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function monthsBetween(from: Date, to: string | null): number | null {
  if (!to) return null;
  const target = new Date(to);
  if (isNaN(target.getTime())) return null;
  const diff =
    (target.getFullYear() - from.getFullYear()) * 12 +
    (target.getMonth() - from.getMonth());
  return Math.max(diff, 0);
}

function monthsBetweenDates(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
  return (
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth())
  );
}

// ── Type / status badge ─────────────────────────────────────────────────────

function ContractTypeBadge({ contract }: { contract: DossierContract }) {
  const t = useTranslations('crm.contracts.card');
  const statusLabelFor = useStatusLabels('crmContract');

  const label = (() => {
    if (contract.type === 'retainer' && contract.status === 'active') return t('activeRetainerBadge');
    if (contract.type === 'project'  && contract.status === 'in_progress') return t('inProgressProjectBadge');
    if (contract.status === 'completed') return t('completedBadge');
    if (contract.status === 'paused')    return t('pausedBadge');
    if (contract.status === 'cancelled') return t('cancelledBadge');
    if (contract.type === 'retainer') return t('retainerStatus', { status: statusLabelFor(contract.status ?? '') || '—' });
    if (contract.type === 'project')  return t('projectStatus', { status: statusLabelFor(contract.status ?? '') || '—' });
    return statusLabelFor(contract.status ?? '') || '—';
  })();

  const tone = (() => {
    if (contract.type === 'retainer' && contract.status === 'active')      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20';
    if (contract.type === 'project'  && contract.status === 'in_progress') return 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20';
    if (contract.status === 'completed')                                    return 'bg-muted text-muted-foreground border-border';
    if (contract.status === 'paused')                                       return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20';
    if (contract.status === 'cancelled')                                    return 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20';
    return 'bg-muted text-muted-foreground border-border';
  })();

  return (
    <span className={cn('inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md border mt-1', tone)}>
      {label}
    </span>
  );
}

// ── Stat cells (the 4-stat block) ───────────────────────────────────────────

interface StatCell {
  label: string;
  value: string;
}

function Stats4({ cells }: { cells: StatCell[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
      {cells.map((c, i) => (
        <div key={i}>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{c.label}</div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main card ──────────────────────────────────────────────────────────────

export function ContractCard({ contract }: Props) {
  const t = useTranslations('crm.contracts.card');
  const locale = useLocale() as Locale;
  const statusLabelFor = useStatusLabels('crmContract');
  const isActiveRetainer    = contract.type === 'retainer' && contract.status === 'active';
  const isInProgressProject = contract.type === 'project'  && contract.status === 'in_progress';
  const isCompleted         = contract.status === 'completed';
  const currency = contract.currency;

  // Build the 4-stat block per contract type.
  const today = new Date();
  const cells: StatCell[] = (() => {
    if (contract.type === 'retainer') {
      const remainingMonths = monthsBetween(today, contract.end_date);
      return [
        { label: t('monthlyValue'),  value: formatCurrency(contract.retainer_amount, currency ?? 'AED') },
        { label: t('totalPaid'),    value: formatCurrency(contract.kpis.total_paid, currency ?? 'AED') },
        { label: t('remainingToEnd'),   value: remainingMonths != null ? t('remainingMonths', { months: remainingMonths }) : '—' },
        { label: t('endDate'),  value: contract.end_date ? formatDate(contract.end_date, 'd MMM yyyy', locale) : '—' },
      ];
    }
    if (contract.type === 'project') {
      return [
        { label: t('totalValue'), value: formatCurrency(contract.total_value, currency ?? 'AED') },
        { label: t('paid'),            value: formatCurrency(contract.kpis.total_paid, currency ?? 'AED') },
        { label: t('remaining'),            value: formatCurrency(contract.kpis.remaining, currency ?? 'AED') },
        { label: t('milestones'),          value: `${contract.kpis.milestones_completed}/${contract.kpis.milestones_total}` },
      ];
    }
    // one-off / other
    const months = monthsBetweenDates(contract.start_date, contract.end_date);
    return [
      { label: t('value'),     value: formatCurrency(contract.total_value, currency ?? 'AED') },
      { label: t('paid'),      value: formatCurrency(contract.kpis.total_paid, currency ?? 'AED') },
      { label: t('durationLabel'),  value: months == null ? '—' : months === 0 ? t('durationLessThanMonth') : t('durationMonths', { months }) },
      { label: t('status'),     value: statusLabelFor(contract.status ?? '') || '—' },
    ];
  })();

  return (
    <Card
      className={cn(
        'p-5 transition-all',
        isActiveRetainer    && 'border-emerald-500/40 dark:border-emerald-500/30',
        isInProgressProject && 'border-orange-500/40 dark:border-orange-500/30',
        isCompleted         && 'opacity-70 bg-muted/30',
      )}
    >
      {/* Header row */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold truncate">{contract.title ?? t('untitledContract')}</h3>
          <ContractTypeBadge contract={contract} />
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href={`/dashboard/finance/contracts/${contract.id}`}>
            <ExternalLink className="size-3.5 me-1.5" />
            {t('viewContract')}
          </Link>
        </Button>
      </header>

      {/* 4-stat block */}
      <Stats4 cells={cells} />

      {/* Inline children — type-specific */}
      {contract.type === 'retainer' && contract.invoices.length > 0 && (
        <ContractBillingHistory invoices={contract.invoices} currency={currency} />
      )}
      {contract.type === 'project' && contract.milestones.length > 0 && (
        <ContractMilestones milestones={contract.milestones} currency={currency} />
      )}
    </Card>
  );
}
