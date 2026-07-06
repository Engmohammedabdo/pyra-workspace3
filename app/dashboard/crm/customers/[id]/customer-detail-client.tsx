'use client';

/**
 * Active Customer Page client orchestrator.
 *
 * Phase 9 builds this incrementally:
 *   Step C (this commit) — chrome (header + stat-strip + tabs) +
 *                          per-tab content placeholders.
 *   Step D — replace the Contracts placeholder with the real tab.
 *   Step E — replace Activity / Notes placeholders + portal toggle modal.
 *   Step F — final layout polish + wire convert-to-customer flow +
 *            redirect from pipeline cards (is_converted=true → here).
 *
 * Loading: each child component owns its skeleton; this orchestrator
 * passes `isLoading` + the relevant slice of dossier data. When data
 * arrives, all sections paint at once (single useCustomerDossier call).
 *
 * Error: 404 means lead doesn't exist OR caller can't access it
 * (canAccessLead enforces sales-agent scope server-side). Show a
 * minimal "غير موجود" message rather than a generic error.
 */

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCustomerDossier } from '@/hooks/useCustomerDossier';
import { ApiError } from '@/hooks/api-helpers';
import { CustomerHeader } from '@/components/crm/customer/customer-header';
import { CustomerStatStrip } from '@/components/crm/customer/customer-stat-strip';
import { CustomerTabs, useCustomerActiveTab } from '@/components/crm/customer/customer-tabs';
import { CustomerContractsTab } from '@/components/crm/customer/customer-contracts-tab';
import { CustomerOverviewTab } from '@/components/crm/customer/customer-overview-tab';
import { CustomerProjectsTab } from '@/components/crm/customer/customer-projects-tab';
import { CustomerInvoicesTab } from '@/components/crm/customer/customer-invoices-tab';
import { CustomerActivityTab } from '@/components/crm/customer/customer-activity-tab';
import { CustomerNotesTab } from '@/components/crm/customer/customer-notes-tab';
import { EmptyState } from '@/components/ui/empty-state';
import { FolderClosed, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CustomerDossier } from '@/hooks/useCustomerDossier';

interface Props {
  leadId: string;
}

export function CustomerDetailClient({ leadId }: Props) {
  const t = useTranslations('crm.customers.detail');
  const { data: dossier, isLoading, error, refetch } = useCustomerDossier(leadId);
  const activeTab = useCustomerActiveTab();

  // 404 = lead not found OR caller lacks access (canAccessLead gate).
  // Treat both as "not found" to avoid leaking lead existence to
  // unauthorised users.
  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="py-16">
        <EmptyState
          icon={AlertCircle}
          title={t('notFoundTitle')}
          description={t('notFoundDescription')}
        />
        <div className="text-center mt-4">
          <Button asChild variant="outline">
            <Link href="/dashboard/crm/pipeline">{t('backToPipeline')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Non-404 error (500 / exhausted retries) — show a real error + retry instead
  // of falling through to a permanent skeleton ("جاري تحميل..." forever).
  if (error && !isLoading) {
    return (
      <div className="py-16">
        <EmptyState
          icon={AlertCircle}
          title={t('loadErrorTitle')}
          description={t('loadErrorDescription')}
        />
        <div className="text-center mt-4 flex items-center justify-center gap-2">
          <Button variant="outline" onClick={() => refetch()}>{t('retry')}</Button>
          <Button asChild variant="ghost">
            <Link href="/dashboard/crm/pipeline">{t('backToPipeline')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CustomerHeader customer={dossier?.customer} isLoading={isLoading} />

      <CustomerStatStrip
        kpis={dossier?.kpis}
        health={dossier?.health_score}
        isLoading={isLoading}
      />

      <CustomerTabs />

      {/* Tab content area — Step D ships the Contracts tab; other tabs
          remain placeholders until Step E fills them in. */}
      <TabContent activeTab={activeTab} dossier={dossier} />
    </div>
  );
}

// ── Tab content router ──────────────────────────────────────────────────────

function TabContent({
  activeTab,
  dossier,
}: {
  activeTab: string;
  dossier: CustomerDossier | undefined;
}) {
  const t = useTranslations('crm.customers.detail');

  // While the dossier loads, all tabs share a single skeleton spell —
  // no per-tab skeleton required since each component returns immediately
  // once its slice arrives. We pass null through and individual components
  // own their own skeletons.
  if (!dossier) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        {t('loading')}
      </div>
    );
  }

  // Files tab — Q-C3 (γ): "قريباً" empty state, preserves nav structure.
  if (activeTab === 'files') {
    return (
      <div className="py-12">
        <EmptyState
          icon={FolderClosed}
          title={t('filesComingSoonTitle')}
          description={t('filesComingSoonDescription')}
        />
      </div>
    );
  }

  switch (activeTab) {
    case 'overview':
      return <CustomerOverviewTab customer={dossier.customer} />;
    case 'contracts':
      return (
        <CustomerContractsTab
          contracts={dossier.contracts}
          kpis={dossier.kpis}
          customer={dossier.customer}
        />
      );
    case 'projects':
      return <CustomerProjectsTab customer={dossier.customer} />;
    case 'invoices':
      return <CustomerInvoicesTab customer={dossier.customer} />;
    case 'activity':
      return <CustomerActivityTab leadId={dossier.customer.id} />;
    case 'notes':
      return <CustomerNotesTab customer={dossier.customer} />;
    default:
      // useCustomerActiveTab() already clamps to known IDs, but defensive
      // fallback in case routing ever surfaces an unknown tab.
      return <CustomerOverviewTab customer={dossier.customer} />;
  }
}
