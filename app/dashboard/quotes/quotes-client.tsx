'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileText, Plus, MoreHorizontal, Pencil, Copy, Send, Trash2, Download, Receipt } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import { generateQuotePDF } from '@/lib/pdf/quote-pdf';
import { toast } from 'sonner';
import { usePermission } from '@/hooks/usePermission';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { DataTable, type ColumnDef, type SortConfig } from '@/components/ui/data-table';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { Locale } from '@/lib/i18n/config';

interface Quote {
  id: string;
  quote_number: string;
  client_name: string | null;
  client_company: string | null;
  project_name: string | null;
  status: string;
  total: number;
  currency: string;
  estimate_date: string;
  expiry_date: string | null;
  created_by: string | null;
  created_at: string;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  pending_approval: 'outline',
  sent: 'default',
  viewed: 'outline',
  signed: 'default',
  invoiced: 'default',
  rejected: 'destructive',
  expired: 'destructive',
  cancelled: 'destructive',
};

export default function QuotesClient() {
  const t = useTranslations('finance.quotes.list');
  const tSend = useTranslations('finance.quotes.sendResult');
  const locale = useLocale() as Locale;
  const statusLabelFor = useStatusLabels('quote');
  const router = useRouter();
  const canCreate = usePermission('quotes.create');
  const canEdit = usePermission('quotes.edit');
  const canSend = usePermission('quotes.edit');              // /send endpoint requires quotes.edit (matches QuoteBuilder)
  const canDelete = usePermission('quotes.delete');          // delete ANY quote
  const canDeleteOwn = usePermission('quotes.delete_own');   // delete OWN quotes only
  const { data: currentUser } = useCurrentUser();
  const currentUsername = currentUser?.username;
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState<Quote | null>(null);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  // Debounce search input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await fetch(`/api/quotes?${params}`);
      const json = await res.json();
      if (json.data) setQuotes(json.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedSearch]);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  const handleDuplicate = async (id: string) => {
    try {
      const res = await fetch(`/api/quotes/${id}/duplicate`, { method: 'POST' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      toast.success(t('toasts.duplicateSuccess'));
      fetchQuotes();
    } catch (err) { console.error(err); toast.error(t('toasts.unexpectedError')); }
  };

  const handleSend = async (id: string) => {
    try {
      const res = await fetch(`/api/quotes/${id}/send`, { method: 'POST' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      // Group 3 — honest sent-UX. The quote flips to 'sent' regardless; the
      // toast reflects whether the email actually fired (flip-and-warn).
      const email = json.data?.email as { sent?: boolean; reason?: string; to?: string } | undefined;
      if (email?.sent) {
        toast.success(tSend('delivered', { to: email.to ?? '' }));
      } else if (email?.reason === 'no_email') {
        toast.warning(tSend('noEmail'));
      } else {
        toast.warning(tSend('notDelivered'));
      }
      fetchQuotes();
    } catch (err) { console.error(err); toast.error(t('toasts.unexpectedError')); }
  };

  const handleDownloadPDF = async (id: string) => {
    try {
      const res = await fetch(`/api/quotes/${id}`);
      const json = await res.json();
      if (!res.ok || !json.data) {
        toast.error(t('toasts.loadFailed'));
        return;
      }
      await generateQuotePDF(json.data);
      toast.success(t('toasts.pdfDownloaded'));
    } catch {
      toast.error(t('toasts.pdfFailed'));
    }
  };

  const handleConvertToInvoice = async (id: string) => {
    try {
      const res = await fetch(`/api/invoices/from-quote/${id}`, { method: 'POST' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      toast.success(t('toasts.convertSuccess'));
      fetchQuotes();
      if (json.data?.id) router.push(`/dashboard/invoices/${json.data.id}`);
    } catch { toast.error(t('toasts.unexpectedError')); }
  };

  const handleDelete = async () => {
    const idsToDelete = bulkDeleteIds.length > 0 ? bulkDeleteIds : selected ? [selected.id] : [];
    if (idsToDelete.length === 0) return;
    setDeleting(true);
    try {
      let failCount = 0;
      for (const id of idsToDelete) {
        const res = await fetch(`/api/quotes/${id}`, { method: 'DELETE' });
        const json = await res.json();
        if (json.error) failCount++;
      }
      setShowDelete(false);
      setSelected(null);
      setBulkDeleteIds([]);
      if (failCount > 0) toast.error(t('toasts.deleteFailedCount', { count: failCount }));
      else toast.success(idsToDelete.length > 1 ? t('toasts.deleteSuccessCount', { count: idsToDelete.length }) : t('toasts.deleteSuccessOne'));
      fetchQuotes();
    } catch (err) { console.error(err); toast.error(t('toasts.unexpectedError')); } finally { setDeleting(false); }
  };

  /* ── sort handler ── */
  const handleSortChange = useCallback((key: string) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return prev.direction === 'asc' ? { key, direction: 'desc' } : null;
      }
      return { key, direction: 'asc' };
    });
  }, []);

  /* ── sorted quotes ── */
  const sortedQuotes = useMemo(() => {
    if (!sortConfig) return quotes;
    const sorted = [...quotes].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      switch (sortConfig.key) {
        case 'quote_number': aVal = a.quote_number; bVal = b.quote_number; break;
        case 'client': aVal = a.client_name || ''; bVal = b.client_name || ''; break;
        case 'total': aVal = a.total; bVal = b.total; break;
        case 'estimate_date': aVal = a.estimate_date; bVal = b.estimate_date; break;
        default: return 0;
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortConfig.direction === 'asc'
        ? String(aVal).localeCompare(String(bVal), locale)
        : String(bVal).localeCompare(String(aVal), locale);
    });
    return sorted;
  }, [quotes, sortConfig, locale]);

  /* ── column definitions ── */
  const columns: ColumnDef<Quote>[] = useMemo(() => [
    {
      key: 'quote_number',
      header: t('columns.quoteNumber'),
      sortable: true,
      render: (q) => <span className="font-mono">{q.quote_number}</span>,
    },
    {
      key: 'client',
      header: t('columns.client'),
      sortable: true,
      render: (q) => q.client_name || q.client_company || '—',
    },
    {
      key: 'project',
      header: t('columns.project'),
      className: 'text-muted-foreground',
      render: (q) => q.project_name || '—',
    },
    {
      key: 'total',
      header: t('columns.amount'),
      sortable: true,
      render: (q) => <span className="font-mono">{formatCurrency(q.total, q.currency)}</span>,
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (q) => {
        const label = statusLabelFor(q.status) || q.status;
        const variant = STATUS_VARIANT[q.status] || 'secondary';
        return <Badge variant={variant}>{label}</Badge>;
      },
    },
    {
      key: 'estimate_date',
      header: t('columns.date'),
      sortable: true,
      className: 'text-muted-foreground text-xs',
      render: (q) => formatDate(q.estimate_date, undefined, locale),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-[60px]',
      render: (q) => (
        <div data-no-row-click>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('rowActions.more')}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit && (
                <DropdownMenuItem onClick={() => router.push(`/dashboard/quotes/${q.id}`)}>
                  <Pencil className="h-3.5 w-3.5 me-2" /> {t('rowActions.edit')}
                </DropdownMenuItem>
              )}
              {canCreate && (
                <DropdownMenuItem onClick={() => handleDuplicate(q.id)}>
                  <Copy className="h-3.5 w-3.5 me-2" /> {t('rowActions.duplicate')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => handleDownloadPDF(q.id)}>
                <Download className="h-3.5 w-3.5 me-2" /> {t('rowActions.downloadPdf')}
              </DropdownMenuItem>
              {q.status === 'signed' && (
                <DropdownMenuItem onClick={() => handleConvertToInvoice(q.id)}>
                  <Receipt className="h-3.5 w-3.5 me-2" /> {t('rowActions.convertToInvoice')}
                </DropdownMenuItem>
              )}
              {canSend && q.status === 'draft' && (
                <DropdownMenuItem onClick={() => handleSend(q.id)}>
                  <Send className="h-3.5 w-3.5 me-2" /> {t('rowActions.send')}
                </DropdownMenuItem>
              )}
              {/* Delete: full-delete shows for every row; delete_own only for
                  quotes the current user created (own-scope). Server re-gates. */}
              {(canDelete || (canDeleteOwn && q.created_by === currentUsername)) && (
                <DropdownMenuItem className="text-destructive" onClick={() => { setSelected(q); setShowDelete(true); }}>
                  <Trash2 className="h-3.5 w-3.5 me-2" /> {t('rowActions.delete')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ], [canEdit, canSend, canCreate, canDelete, canDeleteOwn, currentUsername, router, handleDuplicate, handleSend, handleDownloadPDF, handleConvertToInvoice, t, locale, statusLabelFor]);

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" aria-hidden="true" /> {t('header.title')}</h1>
          <p className="text-muted-foreground">{t('header.subtitle')}</p>
        </div>
        {canCreate && (
          <Button onClick={() => router.push('/dashboard/quotes/new')} className="bg-orange-500 hover:bg-orange-600">
            <Plus className="h-4 w-4 me-2" /> {t('header.newQuote')}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('filters.searchPlaceholder')}
          className="flex-1 max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allStatuses')}</SelectItem>
            <SelectItem value="draft">{statusLabelFor('draft')}</SelectItem>
            <SelectItem value="pending_approval">{statusLabelFor('pending_approval')}</SelectItem>
            <SelectItem value="sent">{statusLabelFor('sent')}</SelectItem>
            <SelectItem value="viewed">{statusLabelFor('viewed')}</SelectItem>
            <SelectItem value="signed">{statusLabelFor('signed')}</SelectItem>
            <SelectItem value="invoiced">{statusLabelFor('invoiced')}</SelectItem>
            <SelectItem value="expired">{statusLabelFor('expired')}</SelectItem>
            <SelectItem value="rejected">{statusLabelFor('rejected')}</SelectItem>
            <SelectItem value="cancelled">{statusLabelFor('cancelled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={sortedQuotes}
        loading={loading}
        emptyState={{
          icon: FileText,
          title: t('emptyState.title'),
          description: t('emptyState.description'),
        }}
        selectable
        getRowId={(q) => q.id}
        sortConfig={sortConfig}
        onSortChange={handleSortChange}
        onRowClick={(q) => router.push(`/dashboard/quotes/${q.id}`)}
        skeletonRows={3}
        /* Bulk delete is full-delete only (canDelete). delete_own users use the
           per-row menu — a bulk selection could span others' quotes, and the
           server would 403 each non-owned id anyway. Keeps bulk UX honest. */
        bulkActions={canDelete ? [
          {
            label: t('bulkActions.deleteSelected'),
            icon: Trash2,
            variant: 'destructive',
            onClick: (ids) => {
              if (ids.length === 0) return;
              setBulkDeleteIds(ids);
              setSelected(null);
              setShowDelete(true);
            },
          },
        ] : []}
      />

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>{t('deleteDialog.title')}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            {bulkDeleteIds.length > 1
              ? t('deleteDialog.confirmCount', { count: bulkDeleteIds.length })
              : t.rich('deleteDialog.confirmOne', {
                  quoteNumber: selected?.quote_number ?? '',
                  strong: (chunks) => <strong>{chunks}</strong>,
                })
            }
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>{t('deleteDialog.cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? t('deleteDialog.deleting') : t('deleteDialog.confirmButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
