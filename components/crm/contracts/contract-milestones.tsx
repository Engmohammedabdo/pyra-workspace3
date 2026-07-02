'use client';

/**
 * Inline milestones checklist for project contracts.
 *
 * Per CRM Phase 9 Step D: vertical checklist with type-aware status icons.
 *
 * Status icon mapping (Q-A4 semantic respected — 'invoiced' is treated as
 * terminal/done, same as 'completed', because workspace production data
 * uses 'invoiced' for done-and-billed milestones):
 *
 *   completed | invoiced              → emerald CheckCircle2
 *   pending AND due_date < today      → red AlertCircle (overdue)
 *   pending AND due_date >= today     → muted Circle (upcoming)
 *   anything else                     → muted Circle (defensive default)
 */

import { CheckCircle2, Circle, AlertCircle } from 'lucide-react';
import { formatCurrency, formatDate, dubaiDayKey } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { DossierMilestone } from '@/hooks/useCustomerDossier';

interface Props {
  milestones: DossierMilestone[];
  currency: string | null;
}

type IconState = 'done' | 'overdue' | 'pending';

function iconStateOf(m: DossierMilestone): IconState {
  if (m.status === 'completed' || m.status === 'invoiced') return 'done';
  if (m.status === 'pending' && m.due_date) {
    // Dubai "today", not UTC — at 01:00 Dubai a milestone due on the just-passed
    // Dubai date must still read as overdue (UTC .slice(0,10) mis-classifies it).
    const today = dubaiDayKey(); // YYYY-MM-DD (Asia/Dubai)
    if (m.due_date < today) return 'overdue';
  }
  return 'pending';
}

const STATUS_LABEL_AR: Record<string, string> = {
  completed: 'مكتمل',
  invoiced:  'تم تفويتُره',  // 'invoiced' = work done, billed
  pending:   'قيد الانتظار',
  cancelled: 'ملغى',
};

function statusPillClass(state: IconState): string {
  switch (state) {
    case 'done':
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20';
    case 'overdue':
      return 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20';
    case 'pending':
      return 'bg-muted text-muted-foreground border-border';
  }
}

export function ContractMilestones({ milestones, currency }: Props) {
  if (milestones.length === 0) return null;

  const sorted = milestones
    .slice()
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="text-xs text-muted-foreground mb-2">مراحل المشروع</div>
      <ul className="space-y-2">
        {sorted.map((m) => {
          const state = iconStateOf(m);
          return (
            <li key={m.id} className="flex items-center gap-3 text-sm">
              <MilestoneIcon state={state} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{m.title ?? '—'}</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {m.due_date && <>{formatDate(m.due_date, 'd MMM yyyy')}</>}
                  {m.due_date && m.amount > 0 && <span className="mx-1.5">·</span>}
                  {m.amount > 0 && formatCurrency(m.amount, currency ?? 'AED')}
                </div>
              </div>
              <span
                className={cn(
                  'shrink-0 inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-md border',
                  statusPillClass(state),
                )}
              >
                {state === 'overdue' ? 'متأخر' : (m.status ? STATUS_LABEL_AR[m.status] ?? m.status : '—')}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MilestoneIcon({ state }: { state: IconState }) {
  if (state === 'done') {
    return <CheckCircle2 className="size-5 text-emerald-500 shrink-0" aria-label="مكتمل" />;
  }
  if (state === 'overdue') {
    return <AlertCircle className="size-5 text-red-500 shrink-0" aria-label="متأخر" />;
  }
  return <Circle className="size-5 text-muted-foreground shrink-0" aria-label="قيد الانتظار" />;
}
