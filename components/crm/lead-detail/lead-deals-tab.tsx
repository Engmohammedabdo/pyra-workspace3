'use client';

/**
 * Deals tab — full list of contracts and invoices linked to this lead.
 *
 * Phase 5 view: read-only listing. Contract creation lives elsewhere
 * (/dashboard/finance/contracts). Stage-7 approval flow attaches contracts
 * here via the move-stage modal.
 */

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FileSignature, Receipt, Plus } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { INVOICE_STATUS_LABELS } from '@/lib/constants/statuses';
import type { LeadDetail } from '@/hooks/useLeads';

export function LeadDealsTab({ data }: { data: LeadDetail }) {
  const { lead, contracts, invoices, payments_summary } = data;

  return (
    <div className="space-y-4">
      {/* Contracts */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileSignature className="size-4 text-orange-500" /> العقود
            {contracts.length > 0 && (
              <Badge variant="outline" className="bg-muted/50 tabular-nums">{contracts.length}</Badge>
            )}
          </h3>
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/finance/contracts?lead_id=${lead.id}`}>
              <Plus className="size-4 me-1" /> عقد جديد
            </Link>
          </Button>
        </div>

        {contracts.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title="لا يوجد عقد لهذا الـ Lead"
            description="بعد توقيع العقد قم بإنشائه في صفحة العقود واربطه بهذا الـ Lead."
            className="py-8"
          />
        ) : (
          <ul className="space-y-2">
            {contracts.map((c) => {
              const billed = Number(c.amount_billed) || 0;
              const collected = Number(c.amount_collected) || 0;
              const total = Number(c.total_value) || 0;
              const remaining = Math.max(0, total - collected);
              return (
                <li key={c.id}>
                  <Link
                    href={`/dashboard/finance/contracts/${c.id}`}
                    className="block rounded-lg border border-border p-4 hover:border-orange-300 dark:hover:border-orange-700/60 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{c.title ?? 'عقد بدون عنوان'}</p>
                        {c.contract_type && (
                          <p className="text-xs text-muted-foreground mt-0.5 capitalize">{c.contract_type}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="capitalize shrink-0">{c.status}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <Stat label="القيمة الكلية" value={formatCurrency(total, c.currency || 'AED')} />
                      <Stat label="مفوتر" value={formatCurrency(billed, c.currency || 'AED')} />
                      <Stat label="مدفوع" value={formatCurrency(collected, c.currency || 'AED')} tone="emerald" />
                      <Stat label="متبقي" value={formatCurrency(remaining, c.currency || 'AED')} tone={remaining > 0 ? 'orange' : 'gray'} />
                    </div>
                    {(c.start_date || c.end_date) && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {c.start_date ? formatDate(c.start_date) : '—'}
                        {' → '}
                        {c.end_date ? formatDate(c.end_date) : '—'}
                      </p>
                    )}
                    {c.retainer_amount && Number(c.retainer_amount) > 0 && (
                      <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                        احتفاظ {c.retainer_cycle ?? 'monthly'} · {formatCurrency(Number(c.retainer_amount), c.currency || 'AED')}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Invoices */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Receipt className="size-4 text-orange-500" /> الفواتير
            {invoices.length > 0 && (
              <Badge variant="outline" className="bg-muted/50 tabular-nums">{invoices.length}</Badge>
            )}
          </h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            مدفوع {formatCurrency(payments_summary.total_paid, payments_summary.currency)}
          </span>
        </div>

        {invoices.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            لا توجد فواتير على عقود هذا الـ Lead.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <Link
                  href={`/dashboard/invoices/${inv.id}`}
                  className="flex items-center justify-between py-2 hover:bg-muted/30 -mx-1 px-1 rounded"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">#{inv.id}</p>
                    {inv.due_date && (
                      <p className="text-xs text-muted-foreground">استحقاق {formatDate(inv.due_date)}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="me-3 capitalize">
                    {INVOICE_STATUS_LABELS[inv.status as keyof typeof INVOICE_STATUS_LABELS] ?? inv.status}
                  </Badge>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatCurrency(Number(inv.total) || 0, 'AED')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone = 'gray' }: { label: string; value: string; tone?: 'gray' | 'orange' | 'emerald' }) {
  const toneClass =
    tone === 'orange' ? 'text-orange-600 dark:text-orange-400'
    : tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-foreground';
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={`font-semibold tabular-nums mt-0.5 ${toneClass}`}>{value}</div>
    </div>
  );
}
