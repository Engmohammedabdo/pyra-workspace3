'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ReceiptText, ChevronDown } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { StaggerContainer, StaggerItem } from '@/components/ui/stagger-list';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { CREDIT_NOTE_STATUS_LABELS, type CreditNoteStatus } from '@/lib/constants/statuses';
import { usePortalCreditNotes, usePortalCreditNote } from '@/hooks/usePortalCreditNotes';

// draft is never rendered — the portal API excludes drafts server-side
const STATUS_STYLES: Record<CreditNoteStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-900/50 dark:text-gray-300',
  issued: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  applied: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-900/50 dark:text-gray-300',
};

/** Expanded detail panel — items + totals + notes (fetched on demand). */
function CreditNoteDetail({ id }: { id: string }) {
  const { data: detail, isLoading } = usePortalCreditNote(id);

  if (isLoading) {
    return (
      <div className="space-y-2 pt-3">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-2/3" />
      </div>
    );
  }
  if (!detail) return null;

  return (
    <div className="pt-3 mt-3 border-t space-y-3">
      {/* Line items */}
      {detail.items.length > 0 && (
        <div className="space-y-1.5">
          {detail.items.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex-1 min-w-0 truncate">{item.description}</span>
              <span className="text-muted-foreground text-xs shrink-0">
                {item.quantity} × {formatCurrency(item.rate, detail.currency)}
              </span>
              <span className="font-mono shrink-0">{formatCurrency(item.amount, detail.currency)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Totals */}
      <div className="space-y-1 text-sm border-t pt-2">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>المجموع الفرعي</span>
          <span className="font-mono">{formatCurrency(detail.subtotal, detail.currency)}</span>
        </div>
        {detail.tax_amount > 0 && (
          <div className="flex items-center justify-between text-muted-foreground">
            <span>الضريبة ({detail.tax_rate}%)</span>
            <span className="font-mono">{formatCurrency(detail.tax_amount, detail.currency)}</span>
          </div>
        )}
        <div className="flex items-center justify-between font-bold">
          <span>الإجمالي</span>
          <span className="font-mono">{formatCurrency(detail.total, detail.currency)}</span>
        </div>
        {detail.applied_amount > 0 && (
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span>المبلغ المطبّق (تم استرداده / خصمه)</span>
            <span className="font-mono">{formatCurrency(detail.applied_amount, detail.currency)}</span>
          </div>
        )}
      </div>

      {/* Notes */}
      {detail.notes && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words border-t pt-2">
          {detail.notes}
        </p>
      )}
    </div>
  );
}

export default function PortalCreditNotesPage() {
  const { data: creditNotes = [], isLoading: loading } = usePortalCreditNotes();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ReceiptText className="h-6 w-6" />
          الإشعارات الدائنة
        </h1>
        <p className="text-sm text-muted-foreground">
          مستندات رسمية تصدر لصالحك عند استرداد مبلغ أو تخفيض قيمة فاتورة
        </p>
      </div>

      {creditNotes.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="لا توجد إشعارات دائنة"
          description="الإشعار الدائن يظهر هنا عند إصدار استرداد أو تخفيض لصالحك"
        />
      ) : (
        <StaggerContainer>
          <div className="space-y-3">
            {creditNotes.map(note => {
              const isExpanded = expandedId === note.id;
              return (
                <StaggerItem key={note.id}>
                  <div className="rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors">
                    <button
                      type="button"
                      className="w-full text-start cursor-pointer"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedId(isExpanded ? null : note.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium font-mono">{note.credit_note_number}</span>
                            <Badge className={STATUS_STYLES[note.status]}>
                              {CREDIT_NOTE_STATUS_LABELS[note.status]}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            <span>{formatDate(note.issue_date)}</span>
                            {note.invoice_number && <span>الفاتورة: {note.invoice_number}</span>}
                          </div>
                          {note.reason && (
                            <p className="text-sm text-muted-foreground truncate">{note.reason}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="font-mono font-bold">
                            {formatCurrency(note.total, note.currency)}
                          </p>
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 text-muted-foreground transition-transform',
                              isExpanded && 'rotate-180'
                            )}
                            aria-hidden
                          />
                        </div>
                      </div>
                    </button>
                    {isExpanded && <CreditNoteDetail id={note.id} />}
                  </div>
                </StaggerItem>
              );
            })}
          </div>
        </StaggerContainer>
      )}
    </div>
  );
}
