'use client';

/**
 * Inline billing-history mini-grid for retainer contracts.
 *
 * Per CRM Phase 9 Step D Q-D3 (c): chips for actual invoices only.
 * No synthesized "not_yet_billed" placeholder months — that's a Phase
 * 13 polish item (full month-grid with gaps shown).
 *
 * Visual: horizontal flex of small status-coloured chips, oldest on
 * the RTL-end (right edge), newest on the RTL-start (left edge) — the
 * `dir="rtl"` on the row container handles this naturally.
 *
 * Tooltip via the native `title` attribute (lighter than a full Tooltip
 * primitive for v1; can be upgraded later if hover UX needs work).
 */

import { formatCurrency, formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { DossierInvoice } from '@/hooks/useCustomerDossier';

interface Props {
  invoices: DossierInvoice[];
  currency: string | null;
}

function chipClass(inv: DossierInvoice): string {
  if (inv.status === 'paid') {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
  }
  if (inv.status === 'overdue') {
    return 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30';
  }
  if (inv.status === 'sent' || inv.status === 'viewed') {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  }
  // draft, cancelled, void, anything else — muted
  return 'bg-muted text-muted-foreground border-border';
}

function chipLabel(inv: DossierInvoice): string {
  if (!inv.issue_date) return inv.invoice_number ?? '—';
  return formatDate(inv.issue_date, 'MMM yyyy');
}

function chipTooltip(inv: DossierInvoice, currency: string | null): string {
  const parts: string[] = [];
  if (inv.invoice_number) parts.push(inv.invoice_number);
  parts.push(formatCurrency(inv.total, currency ?? 'AED'));
  if (inv.status) parts.push(inv.status);
  if (inv.paid_amount > 0 && inv.paid_amount < inv.total) {
    parts.push(`مدفوع: ${formatCurrency(inv.paid_amount, currency ?? 'AED')}`);
  }
  return parts.join(' · ');
}

export function ContractBillingHistory({ invoices, currency }: Props) {
  if (invoices.length === 0) return null;

  // Sort oldest → newest. The RTL container will render this with the
  // newest invoice on the visual-left (start in RTL).
  const sorted = invoices
    .slice()
    .sort((a, b) => (a.issue_date ?? '').localeCompare(b.issue_date ?? ''));

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="text-xs text-muted-foreground mb-2">سجل الفوترة</div>
      <div className="flex flex-wrap gap-1.5" dir="rtl">
        {sorted.map((inv) => (
          <span
            key={inv.id}
            title={chipTooltip(inv, currency)}
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border',
              'tabular-nums whitespace-nowrap',
              chipClass(inv),
            )}
          >
            {chipLabel(inv)}
          </span>
        ))}
      </div>
    </div>
  );
}
