'use client';

/**
 * Phase 4 stub for /dashboard/crm.
 *
 * Phase 8 will replace this with the full Sales Dashboard (KPI cards, AI
 * Insights banner, Funnel viz, Deals at Risk, Team Performance, etc.).
 *
 * For now we render a few live KPI numbers from /api/crm/dashboard/kpis so
 * the page is more than a stub — it confirms the endpoint and the lock-in
 * win-probability math actually work end-to-end.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GitBranch, ArrowRightCircle, Plus } from 'lucide-react';
import { AddLeadModal } from '@/components/crm/add-lead-modal/add-lead-modal';
// Phase 8 Cluster 1 preview — these 3 mounts (and their imports) get
// removed in Step 5 when dashboard-client.tsx replaces this stub entirely.
import { DashboardGreeting } from '@/components/crm/dashboard/dashboard-greeting';
import { DashboardAiInsight } from '@/components/crm/dashboard/dashboard-ai-insight';
import { DashboardDataSources } from '@/components/crm/dashboard/dashboard-data-sources';
// Phase 8 Cluster 2 preview — replaces the inline KPI grid + funnel <Card>
// further down. Removed in Step 5 when dashboard-client.tsx replaces this stub.
import { DashboardKpiCards } from '@/components/crm/dashboard/dashboard-kpi-cards';
import { DashboardFunnel } from '@/components/crm/dashboard/dashboard-funnel';
// Phase 8 Cluster 3 preview — lists row mounted between funnel and the
// Phase 4 ملاحظة note. Removed in Step 5.
import { DashboardActionCards } from '@/components/crm/dashboard/dashboard-action-cards';
import { DashboardDealsAtRisk } from '@/components/crm/dashboard/dashboard-deals-at-risk';
import { DashboardActivityFeed } from '@/components/crm/dashboard/dashboard-activity-feed';

export function CrmDashboardStub() {
  const [addLeadOpen, setAddLeadOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Phase 8 Cluster 1 preview — top */}
      <DashboardGreeting />
      <DashboardAiInsight />

      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">لوحة المبيعات</h1>
            <Badge variant="outline" className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800/40">
              Phase 4 · معاينة
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            النسخة النهائية بكامل الـ KPIs والـ AI Insights جاية في Phase 8. هنا أرقام أولية لاختبار النظام.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAddLeadOpen(true)} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="size-4 me-2" /> Lead جديد
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/crm/pipeline">
              <GitBranch className="size-4 me-2" />
              فتح خط المبيعات
              <ArrowRightCircle className="size-4 ms-2" />
            </Link>
          </Button>
        </div>
      </header>

      <AddLeadModal open={addLeadOpen} onOpenChange={setAddLeadOpen} />

      {/* Phase 8 Cluster 2 preview — replaces the inline 4-card KPI grid +
          funnel <Card>. The new components own their own loading/empty
          states. Removed in Step 5 alongside the rest of this stub. */}
      <DashboardKpiCards period="this_month" />
      <DashboardFunnel />

      {/* Phase 8 Cluster 3 preview — action cards row + deals-at-risk +
          activity feed (two-column on lg). Removed in Step 5. */}
      <DashboardActionCards />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashboardDealsAtRisk />
        <DashboardActivityFeed />
      </div>

      <Card className="p-5 bg-muted/30 border-dashed">
        <p className="text-sm text-muted-foreground leading-7">
          <strong>ملاحظة Phase 4:</strong> الأرقام تظهر صفر لأن الـ leads الحالية (21 lead) ما عندهاش
          <code className="mx-1 px-1.5 py-0.5 rounded bg-muted text-xs">expected_value</code>
          لسه. أول ما السايد يبدأ يحدّث المراحل ويضيف القيم بعد الإطلاق، الأرقام هتشتغل تلقائيًا.
          ده مقصود (قرار Q-DB-002).
        </p>
      </Card>

      {/* Phase 8 Cluster 1 preview — bottom */}
      <DashboardDataSources />
    </div>
  );
}

