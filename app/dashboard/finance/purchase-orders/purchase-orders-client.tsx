'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { getStatusBadgeClass } from '@/lib/constants/badge-colors';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowRight, ShoppingCart, Plus } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { Locale } from '@/lib/i18n/config';

interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_name: string | null;
  supplier_company: string | null;
  status: string;
  issue_date: string;
  total: number;
  currency: string;
}

export default function PurchaseOrdersClient() {
  const router = useRouter();
  const t = useTranslations('finance.purchaseOrders.list');
  const locale = useLocale() as Locale;
  const statusLabelFor = useStatusLabels('po');
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/dashboard/purchase-orders?${params}`);
      const json = await res.json();
      if (json.data) setOrders(json.data);
      if (json.meta) setTotal(json.meta.total || 0);
    } catch {
      toast.error(t('toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, t]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance">
            <Button variant="ghost" size="icon" aria-label={t('back')}><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6" aria-hidden="true" /> {t('title')}
          </h1>
        </div>
        <Link href="/dashboard/finance/purchase-orders/new">
          <Button><Plus className="h-4 w-4 me-2" /> {t('newPo')}</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder={t('filters.searchPlaceholder')}
          className="flex-1 min-w-[200px]"
        />
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder={t('filters.statusPlaceholder')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allStatuses')}</SelectItem>
            <SelectItem value="draft">{statusLabelFor('draft')}</SelectItem>
            <SelectItem value="sent">{statusLabelFor('sent')}</SelectItem>
            <SelectItem value="acknowledged">{statusLabelFor('acknowledged')}</SelectItem>
            <SelectItem value="received">{statusLabelFor('received')}</SelectItem>
            <SelectItem value="invoiced">{statusLabelFor('invoiced')}</SelectItem>
            <SelectItem value="cancelled">{statusLabelFor('cancelled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title={t('emptyState.title')}
          description={t('emptyState.description')}
          actionLabel={t('newPo')}
          onAction={() => router.push('/dashboard/finance/purchase-orders/new')}
        />
      ) : (
        <div className="space-y-3">
          {orders.map(po => {
            return (
              <Link key={po.id} href={`/dashboard/finance/purchase-orders/${po.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                        <ShoppingCart className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm" dir="ltr">{po.po_number}</span>
                          <Badge className={getStatusBadgeClass(po.status)}>{statusLabelFor(po.status) || po.status}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {po.supplier_name || t('noSupplier')}
                          {po.supplier_company ? t('supplierSuffix', { company: po.supplier_company }) : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-end">
                      <p className="font-bold font-mono">{formatCurrency(po.total, po.currency)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(po.issue_date, undefined, locale)}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('pagination.prev')}</Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{t('pagination.next')}</Button>
        </div>
      )}
    </div>
  );
}
