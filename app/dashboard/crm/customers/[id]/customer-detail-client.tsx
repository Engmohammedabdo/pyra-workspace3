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
import { useCustomerDossier } from '@/hooks/useCustomerDossier';
import { ApiError } from '@/hooks/api-helpers';
import { CustomerHeader } from '@/components/crm/customer/customer-header';
import { CustomerStatStrip } from '@/components/crm/customer/customer-stat-strip';
import { CustomerTabs, useCustomerActiveTab } from '@/components/crm/customer/customer-tabs';
import { CustomerContractsTab } from '@/components/crm/customer/customer-contracts-tab';
import { EmptyState } from '@/components/ui/empty-state';
import { FolderClosed, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CustomerDossier } from '@/hooks/useCustomerDossier';

interface Props {
  leadId: string;
}

export function CustomerDetailClient({ leadId }: Props) {
  const { data: dossier, isLoading, error } = useCustomerDossier(leadId);
  const activeTab = useCustomerActiveTab();

  // 404 = lead not found OR caller lacks access (canAccessLead gate).
  // Treat both as "not found" to avoid leaking lead existence to
  // unauthorised users.
  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="py-16">
        <EmptyState
          icon={AlertCircle}
          title="العميل غير موجود"
          description="ربما تم حذفه أو ليس لديك صلاحية للوصول."
        />
        <div className="text-center mt-4">
          <Button asChild variant="outline">
            <Link href="/dashboard/crm/pipeline">العودة لخط المبيعات</Link>
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

// ── Tab content (Step D ships Contracts; rest pending) ──────────────────────

function TabContent({
  activeTab,
  dossier,
}: {
  activeTab: string;
  dossier: CustomerDossier | undefined;
}) {
  // Contracts tab — Step D (the "killer tab")
  if (activeTab === 'contracts' && dossier) {
    return (
      <CustomerContractsTab
        contracts={dossier.contracts}
        kpis={dossier.kpis}
        customer={dossier.customer}
      />
    );
  }

  // Files tab — Q-C3 (γ): "قريباً" empty state, preserves nav structure.
  if (activeTab === 'files') {
    return (
      <div className="py-12">
        <EmptyState
          icon={FolderClosed}
          title="قريباً"
          description="إدارة ملفات العميل ستضاف في إصدار لاحق."
        />
      </div>
    );
  }

  // Remaining tabs — Cluster 3 (Step E) replaces overview/activity/notes.
  // Projects + Invoices are deferred to v1 empty states with deep-links
  // to existing pages (also Step E).
  return (
    <div className="py-16 text-center text-sm text-muted-foreground">
      {activeTab === 'overview' && 'نظرة عامة ستظهر هنا في Step E'}
      {activeTab === 'projects' && 'المشاريع — سيتم ربطها بصفحة المشاريع في Step E'}
      {activeTab === 'invoices' && 'الفواتير — سيتم ربطها بصفحة الفواتير في Step E'}
      {activeTab === 'activity' && 'سجل النشاط سيظهر هنا في Step E'}
      {activeTab === 'notes' && 'الملاحظات ستظهر هنا في Step E'}
    </div>
  );
}
