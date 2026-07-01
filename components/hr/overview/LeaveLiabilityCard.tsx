'use client';

import Link from 'next/link';
import { Wallet, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatCurrency } from '@/lib/utils/format';
import type { HROverview } from '@/hooks/useHROverview';

interface LeaveLiabilityCardProps {
  liabilityByCurrency: HROverview['leave']['liability_by_currency'];
}

export function LeaveLiabilityCard({ liabilityByCurrency }: LeaveLiabilityCardProps) {
  const hasData = liabilityByCurrency && liabilityByCurrency.length > 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      {/* Section header — section-header-as-link pattern */}
      <Link
        href="/dashboard/hr/leave-balances"
        aria-label="افتح صفحة أرصدة الإجازات"
        className={cn(
          'group flex items-center justify-between px-5 py-4 border-b border-border/40',
          'hover:bg-muted/50 transition-colors cursor-pointer',
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-md shadow-teal-500/15">
            <Wallet className="h-4 w-4 text-white" />
          </div>
          <h3 className="font-bold text-sm">التزام الإجازات</h3>
        </div>
        <ArrowUpRight
          className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity rtl:rotate-90"
          aria-hidden
        />
      </Link>

      {/* Body */}
      <div className="p-5">
        {hasData ? (
          <div className="space-y-3">
            {liabilityByCurrency.map((item) => (
              <div
                key={item.currency}
                className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 px-4 py-2.5"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">
                    {formatCurrency(item.amount, item.currency)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.days} {item.days === 1 ? 'يوم' : 'أيام'}
                  </span>
                </div>
                <span className="inline-flex items-center rounded-md bg-teal-500/10 px-2 py-0.5 text-xs font-semibold text-teal-600 dark:text-teal-400">
                  {item.currency}
                </span>
              </div>
            ))}
          </div>
        ) : (
          /* Phase 13 compact inline stub — no paid-leave liability to show */
          <div className="py-4">
            <p className="text-sm text-muted-foreground">لا يوجد التزام إجازات مدفوعة حالياً</p>
          </div>
        )}
      </div>
    </div>
  );
}
