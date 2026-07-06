'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations, useLocale } from 'next-intl';
import { useInvoicesPaged, useRevenueSummary } from '@/hooks/useInvoices';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable, type ColumnDef, type SortConfig } from '@/components/ui/data-table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SearchInput } from '@/components/ui/search-input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FileText, Plus, MoreHorizontal, Eye, Download, Trash2,
  DollarSign, AlertTriangle, TrendingUp, ChevronLeft, ChevronRight, RefreshCw,
} from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';
import { generateInvoicePDF } from '@/lib/pdf/invoice-pdf';
import { ExportButton } from '@/components/reports/ExportButton';
import { EmptyState } from '@/components/ui/empty-state';
import { StaggerContainer, StaggerItem } from '@/components/ui/stagger-list';
import { usePermission } from '@/hooks/usePermission';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import { getStatusBadgeClass } from '@/lib/constants/badge-colors';
import type { Locale } from '@/lib/i18n/config';

/* ───────────────────────── Types ───────────────────────── */

interface Invoice {
  id: string;
  invoice_number: string;
  client_name: string | null;
  client_company: string | null;
  project_name: string | null;
  status: string;
  total: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  issue_date: string;
  due_date: string;
  created_at: string;
}

interface RevenueSummary {
  total_revenue: number;
  total_outstanding: number;
  total_overdue: number;
}

/* ───────────────────────── Constants ───────────────────── */

const PAGE_SIZE = 20;

/* ───────────────────────── Component ──────────────────── */

export default function InvoicesClient() {
  const t = useTranslations('finance.invoices.list');
  const tCommon = useTranslations('common');
  const locale = useLocale() as Locale;
  const statusLabelFor = useStatusLabels('invoice');
  const router = useRouter();
  const searchParams = useSearchParams();
  const canCreate = usePermission('invoices.create');
  const canDelete = usePermission('invoices.delete');
  const queryClient = useQueryClient();

  /* ── list state ── */
  const [statusFilter, setStatusFilter] = useState(() => {
    const urlStatus = searchParams.get('status');
    return urlStatus || 'all';
  });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  // Deep-link filter: CRM customer page → "فتح صفحة الفواتير" passes ?client_id=
  // to scope the list to a single customer (server-side filter in /api/invoices).
  const clientIdFilter = searchParams.get('client_id')?.trim() || undefined;

  // React Query hooks — paged variant reads meta.total so pagination works
  // (F-PAGINATION: total was never populated → invoices beyond the newest
  // page were unreachable from this list)
  const { data: paged, isLoading: loading } = useInvoicesPaged({
    status: statusFilter !== 'all' ? statusFilter : undefined,
    search: debouncedSearch || undefined,
    client_id: clientIdFilter,
    page: String(page),
    limit: String(PAGE_SIZE),
  });
  const invoices = (paged?.invoices ?? []) as Invoice[];
  const total = paged?.total ?? 0;

  const { data: revenueSummary } = useRevenueSummary() as unknown as { data: RevenueSummary | undefined };
  const revenue = revenueSummary ?? null;


  /* ── sort state ── */
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  /* ── delete dialog ── */
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  /* ── debounce search (400ms) ── */
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);





  /* ── reset page on filter change ── */
  useEffect(() => { setPage(1); }, [statusFilter]);

  /* ── download PDF (placeholder) ── */
  const handleDownloadPDF = async (id: string) => {
    try {
      const res = await fetch(`/api/invoices/${id}`);
      const json = await res.json();
      if (!res.ok || !json.data) {
        toast.error(t('toasts.loadFailed'));
        return;
      }
      await generateInvoicePDF(json.data);
      toast.success(t('toasts.pdfDownloaded'));
    } catch {
      toast.error(t('toasts.pdfFailed'));
    }
  };

  /* ── delete ── */
  const handleDelete = async () => {
    const idsToDelete = bulkDeleteIds.length > 0 ? bulkDeleteIds : selected ? [selected.id] : [];
    if (idsToDelete.length === 0) return;
    setDeleting(true);
    try {
      let failCount = 0;
      for (const id of idsToDelete) {
        const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
        const json = await res.json();
        if (json.error) failCount++;
      }
      setShowDelete(false);
      setSelected(null);
      setBulkDeleteIds([]);
      if (failCount > 0) toast.error(t('toasts.deleteFailedCount', { count: failCount }));
      else toast.success(idsToDelete.length > 1 ? t('toasts.deleteSuccessCount', { count: idsToDelete.length }) : t('toasts.deleteSuccessOne'));
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices', 'revenue-summary'] });
    } catch {
      toast.error(t('toasts.unexpectedError'));
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  /* ── sort handler ── */
  const handleSortChange = useCallback((key: string) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return prev.direction === 'asc' ? { key, direction: 'desc' } : null;
      }
      return { key, direction: 'asc' };
    });
  }, []);

  /* ── sorted invoices ── */
  const sortedInvoices = useMemo(() => {
    if (!sortConfig) return invoices;
    const sorted = [...invoices].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      switch (sortConfig.key) {
        case 'invoice_number': aVal = a.invoice_number; bVal = b.invoice_number; break;
        case 'client': aVal = a.client_name || ''; bVal = b.client_name || ''; break;
        case 'total': aVal = a.total; bVal = b.total; break;
        case 'amount_paid': aVal = a.amount_paid; bVal = b.amount_paid; break;
        case 'amount_due': aVal = a.amount_due; bVal = b.amount_due; break;
        case 'issue_date': aVal = a.issue_date; bVal = b.issue_date; break;
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
  }, [invoices, sortConfig, locale]);

  /* ── column definitions ── */
  const columns: ColumnDef<Invoice>[] = useMemo(() => [
    {
      key: 'invoice_number',
      header: t('columns.invoiceNumber'),
      sortable: true,
      render: (inv) => <span className="font-mono">{inv.invoice_number}</span>,
    },
    {
      key: 'client',
      header: t('columns.client'),
      sortable: true,
      render: (inv) => inv.client_name || inv.client_company || '—',
    },
    {
      key: 'project',
      header: t('columns.project'),
      className: 'text-muted-foreground',
      render: (inv) => inv.project_name || '—',
    },
    {
      key: 'total',
      header: t('columns.total'),
      sortable: true,
      render: (inv) => <span className="font-mono">{formatCurrency(inv.total, inv.currency)}</span>,
    },
    {
      key: 'amount_paid',
      header: t('columns.amountPaid'),
      sortable: true,
      render: (inv) => <span className="font-mono text-green-600 dark:text-green-400">{formatCurrency(inv.amount_paid, inv.currency)}</span>,
    },
    {
      key: 'amount_due',
      header: t('columns.amountDue'),
      sortable: true,
      render: (inv) => <span className="font-mono text-orange-600 dark:text-orange-400">{formatCurrency(inv.amount_due, inv.currency)}</span>,
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (inv) => {
        const label = statusLabelFor(inv.status) || inv.status;
        return <Badge variant="outline" className={getStatusBadgeClass(inv.status)}>{label}</Badge>;
      },
    },
    {
      key: 'issue_date',
      header: t('columns.issueDate'),
      sortable: true,
      className: 'text-muted-foreground text-xs',
      render: (inv) => formatDate(inv.issue_date, undefined, locale),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-[60px]',
      render: (inv) => (
        <div data-no-row-click>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('rowActions.more')}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}>
                <Eye className="h-3.5 w-3.5 me-2" /> {t('rowActions.view')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownloadPDF(inv.id)}>
                <Download className="h-3.5 w-3.5 me-2" /> {t('rowActions.downloadPdf')}
              </DropdownMenuItem>
              {canDelete && inv.status === 'draft' && (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => { setSelected(inv); setShowDelete(true); }}
                >
                  <Trash2 className="h-3.5 w-3.5 me-2" /> {t('rowActions.delete')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ], [canDelete, router, handleDownloadPDF, t, locale, statusLabelFor]);

  /* ──────────────────────── Render ─────────────────────── */
  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6" aria-hidden="true" /> {t('header.title')}
            </h1>
            <p className="text-muted-foreground">{t('header.subtitle')}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['invoices'] })}
            aria-label={t('header.refresh')}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            type="invoices"
            from={new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]}
            to={new Date().toISOString().split('T')[0]}
          />
          {canCreate && (
            <Link href="/dashboard/invoices/new">
              <Button className="bg-orange-500 hover:bg-orange-600">
                <Plus className="h-4 w-4 me-2" /> {t('header.newInvoice')}
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Revenue Summary Cards */}
      <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StaggerItem>
          <Card className="transition-all duration-200 hover:shadow-md hover:border-orange-500/30 hover:-translate-y-0.5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('summary.totalRevenue')}</p>
                {revenue ? (
                  <p className="text-lg font-bold font-mono">{formatCurrency(revenue.total_revenue)}</p>
                ) : (
                  <Skeleton className="h-6 w-24 mt-1" />
                )}
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="transition-all duration-200 hover:shadow-md hover:border-orange-500/30 hover:-translate-y-0.5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('summary.totalOutstanding')}</p>
                {revenue ? (
                  <p className="text-lg font-bold font-mono">{formatCurrency(revenue.total_outstanding)}</p>
                ) : (
                  <Skeleton className="h-6 w-24 mt-1" />
                )}
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="transition-all duration-200 hover:shadow-md hover:border-orange-500/30 hover:-translate-y-0.5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('summary.totalOverdue')}</p>
                {revenue ? (
                  <p className="text-lg font-bold font-mono">{formatCurrency(revenue.total_overdue)}</p>
                ) : (
                  <Skeleton className="h-6 w-24 mt-1" />
                )}
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
      </StaggerContainer>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('filters.searchPlaceholder')}
          className="flex-1 max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allStatuses')}</SelectItem>
            <SelectItem value="draft">{statusLabelFor('draft')}</SelectItem>
            <SelectItem value="sent">{statusLabelFor('sent')}</SelectItem>
            <SelectItem value="paid">{statusLabelFor('paid')}</SelectItem>
            <SelectItem value="partially_paid">{statusLabelFor('partially_paid')}</SelectItem>
            <SelectItem value="overdue">{statusLabelFor('overdue')}</SelectItem>
            <SelectItem value="cancelled">{statusLabelFor('cancelled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={sortedInvoices}
        loading={loading}
        emptyState={{
          icon: FileText,
          title: t('emptyState.title'),
          description: t('emptyState.description'),
        }}
        selectable
        getRowId={(inv) => inv.id}
        sortConfig={sortConfig}
        onSortChange={handleSortChange}
        onRowClick={(inv) => router.push(`/dashboard/invoices/${inv.id}`)}
        bulkActions={canDelete ? [
          {
            label: t('bulkActions.deleteSelected'),
            icon: Trash2,
            variant: 'destructive',
            onClick: (ids) => {
              const draftIds = invoices.filter((i) => ids.includes(i.id) && i.status === 'draft').map(i => i.id);
              if (draftIds.length === 0) { toast.error(t('toasts.draftsOnly')); return; }
              setBulkDeleteIds(draftIds);
              setSelected(null);
              setShowDelete(true);
            },
          },
        ] : []}
      />

      {/* Pagination — RTL: prev (right) first, next (left) second */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            aria-label={tCommon('pagination.prev')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground px-3">
            {tCommon('pagination.pageOf', { page, totalPages })}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            aria-label={tCommon('pagination.next')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('deleteDialog.title')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            {bulkDeleteIds.length > 1
              ? t('deleteDialog.confirmCount', { count: bulkDeleteIds.length })
              : t.rich('deleteDialog.confirmOne', {
                  invoiceNumber: selected?.invoice_number ?? '',
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
