'use client';

/**
 * Overview tab — at-a-glance summary of the lead's lifetime.
 *
 * Two columns on desktop, stacked on mobile:
 *   - Active deals (top contracts under this lead — full list lives in
 *     the Deals tab)
 *   - Recent activity (top 5 — full timeline lives in the Activities tab)
 *
 * Both sections include "View all" affordances that switch the URL tab.
 */

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileSignature, Activity as ActivityIcon, ArrowLeftCircle } from 'lucide-react';
import { useLeadActivities } from '@/hooks/useLeadActivities';
import { ActivityItem } from '@/components/crm/activity/activity-item';
import { formatCurrency } from '@/lib/utils/format';
import type { LeadDetail } from '@/hooks/useLeads';

interface LeadOverviewTabProps {
  data: LeadDetail;
  onSwitchTab: (tab: 'activity' | 'deals') => void;
}

export function LeadOverviewTab({ data, onSwitchTab }: LeadOverviewTabProps) {
  const { lead, contracts } = data;
  const activitiesQuery = useLeadActivities(lead.id);
  const recentActivities = activitiesQuery.data?.pages?.[0]?.activities?.slice(0, 5) ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* Active deals */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileSignature className="size-4 text-orange-500" /> العقود
            {contracts.length > 0 && (
              <Badge variant="outline" className="bg-muted/50 tabular-nums">{contracts.length}</Badge>
            )}
          </h3>
          {contracts.length > 3 && (
            <Button variant="ghost" size="sm" onClick={() => onSwitchTab('deals')} className="text-xs">
              عرض الكل <ArrowLeftCircle className="size-3.5 ms-1" />
            </Button>
          )}
        </div>
        {contracts.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title="لا توجد عقود بعد"
            description="سيظهر هنا أول عقد يتم ربطه بهذا الـ Lead"
            className="py-8"
          />
        ) : (
          <ul className="space-y-2">
            {contracts.slice(0, 3).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/finance/contracts/${c.id}`}
                  className="block rounded-lg border border-border p-3 hover:border-orange-300 dark:hover:border-orange-700/60 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.title ?? 'عقد بدون عنوان'}</p>
                      {c.contract_type && <p className="text-xs text-muted-foreground mt-0.5">{c.contract_type}</p>}
                    </div>
                    <Badge variant="outline" className="shrink-0 capitalize">{c.status}</Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{c.start_date ?? ''}{c.start_date && c.end_date ? ' → ' : ''}{c.end_date ?? ''}</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatCurrency(Number(c.total_value) || 0, c.currency || 'AED')}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Recent activity */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ActivityIcon className="size-4 text-orange-500" /> أحدث النشاط
            {recentActivities.length > 0 && (
              <Badge variant="outline" className="bg-muted/50 tabular-nums">{data.activity_count}</Badge>
            )}
          </h3>
          {data.activity_count > 5 && (
            <Button variant="ghost" size="sm" onClick={() => onSwitchTab('activity')} className="text-xs">
              التايم لاين كامل <ArrowLeftCircle className="size-3.5 ms-1" />
            </Button>
          )}
        </div>
        {activitiesQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : recentActivities.length === 0 ? (
          <EmptyState
            icon={ActivityIcon}
            title="لم يبدأ النشاط بعد"
            description="بمجرد ما يتم تسجيل ملاحظة، مكالمة، أو رسالة WhatsApp ستظهر هنا."
            className="py-8"
          />
        ) : (
          <ul className="space-y-2 -m-1">
            {recentActivities.map((a) => (
              <ActivityItem key={a.id} activity={a} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
