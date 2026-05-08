'use client';

/**
 * MoveStageConfirmModal — intercepts drops on `stg_contract_signed`
 * BEFORE the optimistic move, so the user can pick the contract or
 * invoice that backs the deal. Closes the loop on the
 * "attachment-required" guard in the move-stage endpoint without the
 * "card flickers and snaps back" UX of pure server-side bouncing.
 *
 * Tabs:
 *   عقد     → /api/finance/contracts  (gate: finance.view  — admin)
 *   فاتورة  → /api/invoices            (gate: invoices.view — admin)
 *
 * ⚠ Permissions caveat: both endpoints currently require finance.view /
 * invoices.view, which sales_agent doesn't have in their role permissions.
 * Sayed will see an empty list with a 403-styled message when he tries to
 * use this modal. v1 ships with this limitation — admin-driven workflow
 * works end-to-end. v1.1 should either grant sales_agent these perms OR
 * add lead-scoped sub-endpoints (GET /api/crm/leads/[id]/attachable-contracts)
 * gated on leads.move_stage. Flagged in the post-3.2 report.
 *
 * Filter cascade (per Phase 7 architecture spec):
 *   1. If lead.client_id exists, narrow to that client's contracts/invoices
 *   2. Else fetch all (admin sees the full list to pick from)
 *
 * Confirm fires onConfirm({ type, id }); the parent fires the move-stage
 * mutation. Cancel / ESC / backdrop simply closes the modal — the source
 * card never left its original column, so no rollback needed.
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FileSignature, Receipt, Loader2, AlertCircle, Plus } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { fetchAPI, buildQueryString } from '@/hooks/api-helpers';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import {
  CONTRACT_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  type ContractStatus,
  type InvoiceStatus,
} from '@/lib/constants/statuses';
import type { PyraSalesLead } from '@/types/database';

// ── Types reflecting the existing endpoint payload shapes ───────────────

interface ContractRow {
  id: string;
  title: string | null;
  status: string;
  contract_type: string | null;
  total_value: number;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  client_id: string | null;
  client_name?: string | null;
}

interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  total: number;
  status: string;
  due_date: string | null;
  client_id: string | null;
  client_name?: string | null;
}

type AttachmentSelection = { type: 'contract' | 'invoice'; id: string };

interface MoveStageConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The lead being moved — name shown in title; client_id used to narrow lists. */
  lead: PyraSalesLead | null;
  /** True while the parent's mutation is in flight (after confirm). */
  submitting?: boolean;
  onConfirm: (attachment: AttachmentSelection) => void;
}

export function MoveStageConfirmModal({
  open,
  onOpenChange,
  lead,
  submitting,
  onConfirm,
}: MoveStageConfirmModalProps) {
  const [tab, setTab] = useState<'contract' | 'invoice'>('contract');
  const [selected, setSelected] = useState<AttachmentSelection | null>(null);

  // Reset selection + tab whenever the modal opens.
  useEffect(() => {
    if (open) {
      setTab('contract');
      setSelected(null);
    }
  }, [open]);

  const clientFilter = lead?.client_id
    ? { client_id: lead.client_id }
    : undefined;

  const contractsQ = useQuery<ContractRow[]>({
    queryKey: ['contracts', clientFilter],
    queryFn: () =>
      fetchAPI(
        `/api/finance/contracts${buildQueryString(clientFilter as Record<string, string | undefined> | undefined)}`,
      ),
    enabled: open && tab === 'contract',
    staleTime: 30_000,
  });

  const invoicesQ = useQuery<InvoiceRow[]>({
    queryKey: ['invoices', clientFilter],
    queryFn: () =>
      fetchAPI(
        `/api/invoices${buildQueryString(clientFilter as Record<string, string | undefined> | undefined)}`,
      ),
    enabled: open && tab === 'invoice',
    staleTime: 30_000,
  });

  const canConfirm = !!selected && !submitting;

  function handleConfirm() {
    if (!selected) return;
    onConfirm(selected);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="size-5 text-orange-500" />
            نقل الصفقة إلى "تم توقيع العقد"
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{lead?.name ?? '—'}</span>
            {' '}— اربط الصفقة بعقد أو فاتورة قبل إرسالها للاعتماد.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => { setTab(v as 'contract' | 'invoice'); setSelected(null); }} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="grid grid-cols-2 w-full h-auto p-1">
            <TabsTrigger value="contract" className="gap-1.5 py-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <FileSignature className="size-4" /> عقد
            </TabsTrigger>
            <TabsTrigger value="invoice" className="gap-1.5 py-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Receipt className="size-4" /> فاتورة
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contract" className="flex-1 min-h-0 overflow-y-auto m-0 mt-3 -mx-1 px-1">
            <ContractList
              query={contractsQ}
              selected={selected}
              setSelected={setSelected}
            />
          </TabsContent>

          <TabsContent value="invoice" className="flex-1 min-h-0 overflow-y-auto m-0 mt-3 -mx-1 px-1">
            <InvoiceList
              query={invoicesQ}
              selected={selected}
              setSelected={setSelected}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="!flex-row gap-2 pt-3 border-t border-border">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            إلغاء
          </Button>
          <Button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {submitting ? <Loader2 className="size-4 animate-spin me-1.5" /> : null}
            نقل الصفقة وإرسال للاعتماد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

interface PickerListShellProps {
  loading: boolean;
  error: unknown;
  empty: boolean;
  emptyTitle: string;
  emptyHint: string;
  emptyHref?: string;
  emptyHrefLabel?: string;
  children: React.ReactNode;
}

function PickerListShell({
  loading,
  error,
  empty,
  emptyTitle,
  emptyHint,
  emptyHref,
  emptyHrefLabel,
  children,
}: PickerListShellProps) {
  if (loading) {
    return (
      <div className="space-y-2 py-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center text-center py-8 px-4 gap-2">
        <AlertCircle className="size-8 text-amber-500" aria-hidden />
        <p className="text-sm font-medium">تعذّر تحميل البيانات</p>
        <p className="text-xs text-muted-foreground leading-5 max-w-md">
          قد لا يكون لديك الصلاحية اللازمة (finance.view / invoices.view).
          راجع المدير لتعيين الصلاحيات أو استخدم حساب مدير.
        </p>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="flex flex-col items-center text-center py-8 px-4 gap-2">
        <p className="text-sm font-medium">{emptyTitle}</p>
        <p className="text-xs text-muted-foreground leading-5 max-w-md">{emptyHint}</p>
        {emptyHref && emptyHrefLabel && (
          <Button asChild variant="outline" size="sm" className="mt-1">
            <Link href={emptyHref}>
              <Plus className="size-3.5 me-1.5" /> {emptyHrefLabel}
            </Link>
          </Button>
        )}
      </div>
    );
  }
  return <ul className="space-y-1.5">{children}</ul>;
}

function ContractList({
  query,
  selected,
  setSelected,
}: {
  query: ReturnType<typeof useQuery<ContractRow[]>>;
  selected: AttachmentSelection | null;
  setSelected: (s: AttachmentSelection) => void;
}) {
  const rows = query.data ?? [];
  return (
    <PickerListShell
      loading={query.isLoading}
      error={query.error}
      empty={!query.isLoading && rows.length === 0}
      emptyTitle="لا توجد عقود متاحة"
      emptyHint="أنشئ عقد جديد للصفقة قبل نقلها إلى مرحلة الاعتماد."
      emptyHref="/dashboard/finance/contracts"
      emptyHrefLabel="إنشاء عقد جديد"
    >
      {rows.map((c) => {
        const isSelected = selected?.type === 'contract' && selected.id === c.id;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setSelected({ type: 'contract', id: c.id })}
              className={cn(
                'w-full text-start rounded-lg border p-3 transition-colors',
                isSelected
                  ? 'border-orange-500 bg-orange-500/5 ring-1 ring-orange-500/40'
                  : 'border-border hover:bg-muted/50 hover:border-orange-300/60 dark:hover:border-orange-700/40',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{c.title ?? 'عقد بدون عنوان'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {c.client_name ? `${c.client_name} · ` : ''}
                    {c.contract_type ?? '—'}
                    {c.start_date ? ` · ${formatDate(c.start_date)}` : ''}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {CONTRACT_STATUS_LABELS[c.status as ContractStatus] ?? c.status}
                </Badge>
              </div>
              <p className="mt-1.5 text-sm font-bold tabular-nums">
                {formatCurrency(Number(c.total_value) || 0, c.currency || 'AED')}
              </p>
            </button>
          </li>
        );
      })}
    </PickerListShell>
  );
}

function InvoiceList({
  query,
  selected,
  setSelected,
}: {
  query: ReturnType<typeof useQuery<InvoiceRow[]>>;
  selected: AttachmentSelection | null;
  setSelected: (s: AttachmentSelection) => void;
}) {
  const rows = query.data ?? [];
  return (
    <PickerListShell
      loading={query.isLoading}
      error={query.error}
      empty={!query.isLoading && rows.length === 0}
      emptyTitle="لا توجد فواتير متاحة"
      emptyHint="أنشئ فاتورة للعميل قبل نقل الصفقة إلى مرحلة الاعتماد."
      emptyHref="/dashboard/invoices"
      emptyHrefLabel="إنشاء فاتورة جديدة"
    >
      {rows.map((inv) => {
        const isSelected = selected?.type === 'invoice' && selected.id === inv.id;
        return (
          <li key={inv.id}>
            <button
              type="button"
              onClick={() => setSelected({ type: 'invoice', id: inv.id })}
              className={cn(
                'w-full text-start rounded-lg border p-3 transition-colors',
                isSelected
                  ? 'border-orange-500 bg-orange-500/5 ring-1 ring-orange-500/40'
                  : 'border-border hover:bg-muted/50 hover:border-orange-300/60 dark:hover:border-orange-700/40',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    فاتورة {inv.invoice_number ? `#${inv.invoice_number}` : inv.id}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {inv.client_name ? `${inv.client_name} · ` : ''}
                    {inv.due_date ? `استحقاق ${formatDate(inv.due_date)}` : '—'}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {INVOICE_STATUS_LABELS[inv.status as InvoiceStatus] ?? inv.status}
                </Badge>
              </div>
              <p className="mt-1.5 text-sm font-bold tabular-nums">
                {formatCurrency(Number(inv.total) || 0, 'AED')}
              </p>
            </button>
          </li>
        );
      })}
    </PickerListShell>
  );
}
