'use client';

/**
 * MoveStageConfirmModal — intercepts drops on stages that need extra
 * data BEFORE the optimistic move, so the user can supply the data
 * (attachment for stg_contract_signed; reason for stg_closed_lost)
 * without the "card flickers and snaps back" UX of pure server-side
 * bouncing.
 *
 * Two modes, switched by the `targetStageId` prop:
 *
 *   stg_contract_signed:
 *     Tabs (عقد / فاتورة) + picker list. Backed by /api/finance/contracts // i18n-exempt: doc comment
 *     and /api/invoices respectively. ⚠ Both gated by finance.view /
 *     invoices.view, which sales_agent doesn't have — that limitation
 *     is documented in CLAUDE.md as a Phase 7 known gap (admin-only
 *     workflow in v1; v1.1 will resolve via lead-scoped sub-endpoints).
 *
 *   stg_closed_lost:
 *     4 reason chips + freeform textarea (min 5 chars). Tapping a chip
 *     pre-fills the textarea; editing the textarea away from a chip's
 *     exact text de-selects the chip visually (textarea wins as source
 *     of truth). Confirm is the destructive variant.
 *
 * onConfirm receives a discriminated union — the parent maps to the
 * move-stage mutation's body shape (`attachment` vs `lost_reason`).
 *
 * Source card stays in its original column until the user confirms;
 * cancel/ESC/backdrop closes the modal cleanly with no API call.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations, useLocale } from 'next-intl';
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
import { Textarea } from '@/components/ui/textarea';
import {
  FileSignature, Receipt, Loader2, AlertCircle, Plus, XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { fetchAPI, buildQueryString } from '@/hooks/api-helpers';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import { dirFor, type Locale } from '@/lib/i18n/config';
import { PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';
import type { PyraSalesLead } from '@/types/database';

// ── Constants ───────────────────────────────────────────────────────────

/**
 * Lost-reason chip VALUES (stable keys) — labels resolved via t() inside the
 * component. Chip-identity coupling (Phase 3.3 lock): the textarea-insert
 * (onClick sets the LOCALIZED label text) and the selected-state comparison
 * (chip === trimmedReason) both use the LOCALIZED label, so AR behavior stays
 * byte-identical (stored lost_reason is whatever free text the user's
 * textarea holds — user-language data, as it always was).
 */
const LOST_REASON_CHIP_KEYS = [
  'priceNotSuitable',
  'lostToCompetitor',
  'decisionDelayed',
  'other',
] as const;

const MIN_LOST_REASON = 5;

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

export type MoveStageConfirmPayload =
  | { mode: 'contract_signed'; attachment: AttachmentSelection }
  | { mode: 'closed_lost'; lost_reason: string };

export type MoveStageConfirmTargetId =
  | typeof PIPELINE_STAGE_IDS.CONTRACT_SIGNED
  | typeof PIPELINE_STAGE_IDS.CLOSED_LOST;

interface MoveStageConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The lead being moved — name shown in title; client_id used to narrow lists. */
  lead: PyraSalesLead | null;
  /** Decides which modal variant renders. null while closed/transitioning. */
  targetStageId: MoveStageConfirmTargetId | null;
  /** True while the parent's mutation is in flight (after confirm). */
  submitting?: boolean;
  onConfirm: (payload: MoveStageConfirmPayload) => void;
}

export function MoveStageConfirmModal({
  open,
  onOpenChange,
  lead,
  targetStageId,
  submitting,
  onConfirm,
}: MoveStageConfirmModalProps) {
  const t = useTranslations('crm.pipeline.moveStageConfirmModal');
  const tCommon = useTranslations('common.actions');
  const locale = useLocale() as Locale;
  const dir = dirFor(locale);

  // ── contract_signed state
  const [tab, setTab] = useState<'contract' | 'invoice'>('contract');
  const [selected, setSelected] = useState<AttachmentSelection | null>(null);

  // ── closed_lost state
  const [reason, setReason] = useState('');

  // Localized lost-reason chips — label is the LOCALIZED text (Phase 3.3
  // chip-identity coupling lock, see LOST_REASON_CHIP_KEYS doc comment above).
  const lostReasonChips = useMemo(
    () => LOST_REASON_CHIP_KEYS.map((key) => t(`lostReasonChips.${key}`)),
    [t],
  );

  // Reset everything whenever the modal opens or the target stage changes
  // — prevents state from one variant leaking into the next.
  useEffect(() => {
    if (open) {
      setTab('contract');
      setSelected(null);
      setReason('');
    }
  }, [open, targetStageId]);

  const isContractSigned = targetStageId === PIPELINE_STAGE_IDS.CONTRACT_SIGNED;
  const isClosedLost = targetStageId === PIPELINE_STAGE_IDS.CLOSED_LOST;

  const clientFilter = lead?.client_id ? { client_id: lead.client_id } : undefined;

  const contractsQ = useQuery<ContractRow[]>({
    queryKey: ['contracts', clientFilter],
    queryFn: () =>
      fetchAPI(
        `/api/finance/contracts${buildQueryString(clientFilter as Record<string, string | undefined> | undefined)}`,
      ),
    enabled: open && isContractSigned && tab === 'contract',
    staleTime: 30_000,
  });

  const invoicesQ = useQuery<InvoiceRow[]>({
    queryKey: ['invoices', clientFilter],
    queryFn: () =>
      fetchAPI(
        `/api/invoices${buildQueryString(clientFilter as Record<string, string | undefined> | undefined)}`,
      ),
    enabled: open && isContractSigned && tab === 'invoice',
    staleTime: 30_000,
  });

  // ── Confirm gates
  const trimmedReason = reason.trim();
  const canConfirmAttachment = !!selected && !submitting;
  const canConfirmLost = trimmedReason.length >= MIN_LOST_REASON && !submitting;

  function handleConfirm() {
    if (isContractSigned && selected) {
      onConfirm({ mode: 'contract_signed', attachment: selected });
    } else if (isClosedLost && trimmedReason.length >= MIN_LOST_REASON) {
      onConfirm({ mode: 'closed_lost', lost_reason: trimmedReason });
    }
  }

  // Header config differs per variant.
  const title = isContractSigned
    ? t('titleContractSigned')
    : t('titleClosedLost');
  const description = isContractSigned
    ? t('descriptionContractSigned')
    : t('descriptionClosedLost');
  const TitleIcon = isContractSigned ? FileSignature : XCircle;
  const titleIconColor = isContractSigned
    ? 'text-orange-500'
    : 'text-red-500';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'sm:max-w-2xl flex flex-col',
          isContractSigned ? 'max-h-[85vh]' : 'max-h-[80vh]',
        )}
        dir={dir}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TitleIcon className={`size-5 ${titleIconColor}`} />
            {title}
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{lead?.name ?? '—'}</span>
            {' '}— {description}
          </DialogDescription>
        </DialogHeader>

        {isContractSigned && (
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v as 'contract' | 'invoice');
              setSelected(null);
            }}
            className="flex-1 min-h-0 flex flex-col"
          >
            <TabsList className="grid grid-cols-2 w-full h-auto p-1">
              <TabsTrigger value="contract" className="gap-1.5 py-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <FileSignature className="size-4" /> {t('tabContract')}
              </TabsTrigger>
              <TabsTrigger value="invoice" className="gap-1.5 py-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Receipt className="size-4" /> {t('tabInvoice')}
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
        )}

        {isClosedLost && (
          <div className="flex-1 min-h-0 overflow-y-auto py-2 space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">{t('lostReasonPrompt')}</p>
              <div className="flex flex-wrap gap-1.5">
                {lostReasonChips.map((chip) => {
                  const isChipSelected = chip === trimmedReason;
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setReason(chip)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                        isChipSelected
                          ? 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300'
                          : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder={t('lostReasonPlaceholder')}
                required
                minLength={MIN_LOST_REASON}
                className="resize-none"
              />
              {trimmedReason.length < MIN_LOST_REASON && (
                <p className="text-xs text-muted-foreground">
                  {t('lostReasonMinChars', { count: trimmedReason.length, min: MIN_LOST_REASON })}
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="!flex-row gap-2 pt-3 border-t border-border">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {tCommon('cancel')}
          </Button>
          {isContractSigned && (
            <Button
              type="button"
              disabled={!canConfirmAttachment}
              onClick={handleConfirm}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {submitting ? <Loader2 className="size-4 animate-spin me-1.5" /> : null}
              {t('confirmContractSigned')}
            </Button>
          )}
          {isClosedLost && (
            <Button
              type="button"
              variant="destructive"
              disabled={!canConfirmLost}
              onClick={handleConfirm}
            >
              {submitting ? <Loader2 className="size-4 animate-spin me-1.5" /> : null}
              {t('confirmClosedLost')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components (unchanged from 3.2) ─────────────────────────────────

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
  const t = useTranslations('crm.pipeline.moveStageConfirmModal');
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
        <p className="text-sm font-medium">{t('loadFailed')}</p>
        <p className="text-xs text-muted-foreground leading-5 max-w-md">
          {t('loadFailedHint1')}
          {' '}
          {t('loadFailedHint2')}
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
  const t = useTranslations('crm.pipeline.moveStageConfirmModal');
  const locale = useLocale() as Locale;
  const contractStatusLabel = useStatusLabels('contract');
  const rows = query.data ?? [];
  return (
    <PickerListShell
      loading={query.isLoading}
      error={query.error}
      empty={!query.isLoading && rows.length === 0}
      emptyTitle={t('noContracts')}
      emptyHint={t('noContractsHint')}
      emptyHref="/dashboard/finance/contracts"
      emptyHrefLabel={t('createContract')}
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
                  <p className="text-sm font-semibold truncate">{c.title ?? t('untitledContract')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {c.client_name ? `${c.client_name} · ` : ''}
                    {c.contract_type ?? '—'}
                    {c.start_date ? ` · ${formatDate(c.start_date, 'dd-MM-yyyy', locale)}` : ''}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {contractStatusLabel(c.status)}
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
  const t = useTranslations('crm.pipeline.moveStageConfirmModal');
  const locale = useLocale() as Locale;
  const invoiceStatusLabel = useStatusLabels('invoice');
  const rows = query.data ?? [];
  return (
    <PickerListShell
      loading={query.isLoading}
      error={query.error}
      empty={!query.isLoading && rows.length === 0}
      emptyTitle={t('noInvoices')}
      emptyHint={t('noInvoicesHint')}
      emptyHref="/dashboard/invoices"
      emptyHrefLabel={t('createInvoice')}
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
                    {t('invoiceLabel', { number: inv.invoice_number ? `#${inv.invoice_number}` : inv.id })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {inv.client_name ? `${inv.client_name} · ` : ''}
                    {inv.due_date ? t('invoiceDue', { date: formatDate(inv.due_date, 'dd-MM-yyyy', locale) }) : '—'}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {invoiceStatusLabel(inv.status)}
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
