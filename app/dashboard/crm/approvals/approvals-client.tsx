'use client';

/**
 * /dashboard/crm/approvals — Closed-Won approvals queue.
 *
 * Lists every lead currently parked in stg_contract_signed that the
 * caller is allowed to approve (admin sees all; non-admin manager sees
 * direct reports' leads only — same scope as GET /api/crm/approvals/pending).
 *
 * Each row uses <ApprovalCard> with its own optimistic-update lifecycle.
 * The page itself is intentionally thin — header, skeleton/empty state,
 * and the card list. No filter chips in v1 (pending-only is enough; the
 * timeline on the lead detail page preserves the full history of
 * decisions if a manager wants to look back).
 */

import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ShieldCheck } from 'lucide-react';
import { usePendingApprovals } from '@/hooks/useApprovals';
import { ApprovalCard } from '@/components/crm/approvals/approval-card';

export function ApprovalsClient() {
  const { data, isLoading } = usePendingApprovals();
  const approvals = data?.approvals ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="size-6 text-orange-500" />
          اعتمادات تنتظرك
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          صفقات في مرحلة "تم توقيع العقد" بانتظار اعتمادك. الاعتماد يحوّلها إلى "فوز بالصفقة".
          الرفض يعيدها إلى "تفاوض" مع تسجيل السبب في تايم لاين الـ Lead.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : approvals.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="لا توجد طلبات اعتماد قيد الانتظار"
          description="ستظهر هنا الصفقات التي تنتقل إلى مرحلة 'تم توقيع العقد' من قِبَل المندوبين."
        />
      ) : (
        <ul className="space-y-3">
          {approvals.map((a) => (
            <li key={a.id}>
              <ApprovalCard approval={a} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
