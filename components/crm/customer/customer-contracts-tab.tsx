'use client';

/**
 * The "killer tab" — Customer-Contracts Tab.
 *
 * Per CRM-PRD §04 lines 229-261: pulls all contracts under one converted
 * lead, sorted with active retainers first, in-progress projects second,
 * completed last. The proof point of the "one customer, multiple deals"
 * model.
 *
 * Data source: `dossier.contracts[]` — the dossier endpoint already
 * embeds invoices + payments + milestones per contract, so this tab
 * makes ZERO additional HTTP requests after the page-level
 * useCustomerDossier fetch.
 *
 * Sort order (Phase 9 Step D spec):
 *   0 — active retainers
 *   1 — in-progress projects
 *   2 — everything else (paused / cancelled / draft / etc.)
 *   3 — completed (greyed via opacity in <ContractCard>)
 *
 * Header summary: "X عقود · إجمالي Y AED + متجدد Z شهريًا"
 *   - X = contracts.length
 *   - Y = sum of contract.total_value (NOT just paid — total commercial value)
 *   - Z = kpis.mrr (active retainers normalised to monthly)
 */

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FileText, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrencyMap } from '@/lib/utils/format';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { hasPermission } from '@/lib/auth/rbac';
import { ContractCard } from '@/components/crm/contracts/contract-card';
import type {
  DossierContract,
  DossierTopLevelKPIs,
  DossierCustomer,
} from '@/hooks/useCustomerDossier';

interface Props {
  contracts: DossierContract[];
  kpis: DossierTopLevelKPIs;
  customer: DossierCustomer;
}

function sortKey(c: DossierContract): number {
  if (c.type === 'retainer' && c.status === 'active') return 0;
  if (c.type === 'project'  && c.status === 'in_progress') return 1;
  if (c.status === 'completed') return 3;
  return 2;
}

export function CustomerContractsTab({ contracts, kpis, customer }: Props) {
  const t = useTranslations('crm.customers.contractsTab');
  const { data: user } = useCurrentUser();
  const canManageLead = !!user && hasPermission(user.rolePermissions, 'leads.manage');

  // Empty state — no contracts linked to this lead yet.
  if (contracts.length === 0) {
    return (
      <Card className="p-5">
        <EmptyState
          icon={FileText}
          title={t('emptyTitle')}
          description={
            customer.is_converted
              ? t('emptyDescriptionConverted')
              : t('emptyDescriptionUnconverted')
          }
        />
      </Card>
    );
  }

  // Sort once.
  const sorted = contracts
    .slice()
    .sort((a, b) => {
      const k = sortKey(a) - sortKey(b);
      // Within the same priority, newest contracts come first.
      if (k !== 0) return k;
      return (b.start_date ?? b.id).localeCompare(a.start_date ?? a.id);
    });

  // Header summary numbers — grouped PER-CURRENCY (never summed across
  // currencies; the individual <ContractCard>s already use their own currency,
  // so a cross-currency header sum would disagree with the cards below it).
  const currency = kpis.currency ?? 'AED';
  const totalByCurrency: Record<string, number> = {};
  for (const c of contracts) {
    const cur = c.currency || currency;
    totalByCurrency[cur] = (totalByCurrency[cur] || 0) + (c.total_value || 0);
  }
  const totalContractStr = formatCurrencyMap(totalByCurrency, currency);
  const mrrStr = formatCurrencyMap(kpis.mrr_by_currency, currency);
  const hasMrr = Object.values(kpis.mrr_by_currency ?? {}).some((v) => v > 0) || kpis.mrr > 0;

  return (
    <div className="space-y-3">
      {/* Header row — count + summary + admin "+ New Contract" */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-sm font-semibold">
          <span className="tabular-nums">{contracts.length}</span>{' '}
          {t('count', { count: contracts.length })}
          <span className="text-muted-foreground font-normal mx-2">·</span>
          <span className="text-muted-foreground font-normal">{t('total')}</span>{' '}
          <span className="tabular-nums">{totalContractStr}</span>
          {hasMrr && (
            <>
              <span className="text-muted-foreground font-normal mx-2">+</span>
              <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                {t('recurring', { amount: mrrStr })}
              </span>
            </>
          )}
        </h2>

        {canManageLead && (
          <Button
            size="sm"
            variant="outline"
            // Step E or v1.1 may wire this to a real <NewContractModal> with
            // lead_id pre-filled. v1 keeps a placeholder consistent with the
            // convert-to-customer button pattern in customer-header.tsx.
            onClick={() =>
              toast.info(t('newContractToast'))
            }
          >
            <Plus className="size-4 me-1.5" />
            {t('newContract')}
          </Button>
        )}
      </header>

      {/* Cards list — vertical stack */}
      <div className="space-y-3">
        {sorted.map((c) => (
          <ContractCard key={c.id} contract={c} />
        ))}
      </div>
    </div>
  );
}
