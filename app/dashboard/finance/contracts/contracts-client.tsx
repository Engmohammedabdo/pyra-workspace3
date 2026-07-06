'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ArrowRight, FileSignature, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils/format';
import { DataTable, type ColumnDef, type SortConfig } from '@/components/ui/data-table';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { Locale } from '@/lib/i18n/config';

interface Contract {
  id: string;
  title: string | null;
  client_name: string | null;
  client_company: string | null;
  project_name: string | null;
  contract_type: string | null;
  total_value: number;
  currency: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  amount_billed: number;
  amount_collected: number;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  active: 'default',
  in_progress: 'default',
  completed: 'secondary',
  cancelled: 'destructive',
};

export default function ContractsClient() {
  const t = useTranslations('finance.contracts.list');
  const locale = useLocale() as Locale;
  const statusLabelFor = useStatusLabels('contract');
  const contractTypeLabelFor = useStatusLabels('contractType');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/finance/contracts?${params}`);
      const json = await res.json();
      if (json.data) setContracts(json.data);
      if (json.meta) {
        setTotal(json.meta.total || 0);
        setHasMore(json.meta.hasMore || false);
      }
    } catch {
      toast.error(t('toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, t]);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  const handleDelete = async () => {
    const idsToDelete = bulkDeleteIds.length > 0 ? bulkDeleteIds : deleteId ? [deleteId] : [];
    if (idsToDelete.length === 0) return;
    setDeleting(true);
    try {
      let failCount = 0;
      for (const id of idsToDelete) {
        const res = await fetch(`/api/finance/contracts/${id}`, { method: 'DELETE' });
        if (!res.ok) failCount++;
      }
      setDeleteId(null);
      setBulkDeleteIds([]);
      if (failCount > 0) toast.error(t('toasts.deleteFailedCount', { count: failCount }));
      else toast.success(idsToDelete.length > 1 ? t('toasts.deleteSuccessCount', { count: idsToDelete.length }) : t('toasts.deleteSuccessOne'));
      fetchContracts();
    } catch {
      toast.error(t('toasts.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.ceil(total / 20);

  /* ── sort handler ── */
  const handleSortChange = useCallback((key: string) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return prev.direction === 'asc' ? { key, direction: 'desc' } : null;
      }
      return { key, direction: 'asc' };
    });
  }, []);

  /* ── sorted contracts ── */
  const sortedContracts = useMemo(() => {
    if (!sortConfig) return contracts;
    return [...contracts].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      switch (sortConfig.key) {
        case 'title': aVal = a.title || ''; bVal = b.title || ''; break;
        case 'client': aVal = a.client_company || a.client_name || ''; bVal = b.client_company || b.client_name || ''; break;
        case 'total_value': aVal = a.total_value; bVal = b.total_value; break;
        case 'collection': aVal = a.total_value > 0 ? a.amount_collected / a.total_value : 0; bVal = b.total_value > 0 ? b.amount_collected / b.total_value : 0; break;
        default: return 0;
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortConfig.direction === 'asc'
        ? String(aVal).localeCompare(String(bVal), locale)
        : String(bVal).localeCompare(String(aVal), locale);
    });
  }, [contracts, sortConfig, locale]);

  /* ── column definitions ── */
  const columns: ColumnDef<Contract>[] = useMemo(() => [
    {
      key: 'title',
      header: t('columns.title'),
      sortable: true,
      render: (c) => <span className="font-medium">{c.title || '—'}</span>,
    },
    {
      key: 'client',
      header: t('columns.client'),
      sortable: true,
      className: 'text-muted-foreground',
      render: (c) => c.client_company || c.client_name || '—',
    },
    {
      key: 'type',
      header: t('columns.type'),
      className: 'text-muted-foreground',
      render: (c) => c.contract_type ? (contractTypeLabelFor(c.contract_type) || c.contract_type) : '—',
    },
    {
      key: 'total_value',
      header: t('columns.totalValue'),
      sortable: true,
      render: (c) => <span className="font-mono">{formatCurrency(c.total_value, c.currency)}</span>,
    },
    {
      key: 'collection',
      header: t('columns.collection'),
      sortable: true,
      render: (c) => {
        const progress = c.total_value > 0 ? Math.round((c.amount_collected / c.total_value) * 100) : 0;
        return (
          <div className="space-y-1 min-w-[120px]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{formatCurrency(c.amount_collected, c.currency)}</span>
              <span className="font-mono">{progress}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (c) => (
        <Badge variant={STATUS_VARIANT[c.status] || 'outline'}>
          {statusLabelFor(c.status) || c.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: t('columns.actions'),
      render: (c) => (
        <div className="flex items-center gap-1" data-no-row-click>
          <Link href={`/dashboard/finance/contracts/${c.id}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('rowActions.edit')}><Pencil className="h-3.5 w-3.5" /></Button>
          </Link>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 dark:text-red-400" onClick={() => setDeleteId(c.id)} aria-label={t('rowActions.delete')}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ], [t, statusLabelFor, contractTypeLabelFor]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance">
            <Button variant="ghost" size="icon" aria-label={t('header.back')}><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSignature className="h-6 w-6" aria-hidden="true" /> {t('header.title')}
          </h1>
        </div>
        <Link href="/dashboard/finance/contracts/new">
          <Button><Plus className="h-4 w-4 me-2" /> {t('header.newContract')}</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('filters.searchPlaceholder')} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="ps-10" />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder={t('filters.statusPlaceholder')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allStatuses')}</SelectItem>
            <SelectItem value="draft">{statusLabelFor('draft')}</SelectItem>
            <SelectItem value="active">{statusLabelFor('active')}</SelectItem>
            <SelectItem value="in_progress">{statusLabelFor('in_progress')}</SelectItem>
            <SelectItem value="completed">{statusLabelFor('completed')}</SelectItem>
            <SelectItem value="cancelled">{statusLabelFor('cancelled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={sortedContracts}
        loading={loading}
        emptyState={{
          icon: FileSignature,
          title: t('emptyState.title'),
          description: t('emptyState.description'),
        }}
        selectable
        getRowId={(c) => c.id}
        sortConfig={sortConfig}
        onSortChange={handleSortChange}
        bulkActions={[
          {
            label: t('bulkActions.deleteSelected'),
            icon: Trash2,
            variant: 'destructive',
            onClick: (ids) => {
              if (ids.length === 0) return;
              setBulkDeleteIds(ids);
              setDeleteId(ids[0]);
            },
          },
        ]}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('pagination.prev')}</Button>
          <span className="text-sm text-muted-foreground">{t('pagination.pageOf', { page, totalPages })}</span>
          <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>{t('pagination.next')}</Button>
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('deleteDialog.title')}</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">{t('deleteDialog.confirm')}</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)}>{t('deleteDialog.cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? t('deleteDialog.deleting') : t('deleteDialog.confirmButton')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
