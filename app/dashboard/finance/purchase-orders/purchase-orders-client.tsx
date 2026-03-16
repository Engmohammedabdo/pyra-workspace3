'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowRight, ShoppingCart, Plus } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils/format';

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

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft:        { label: 'مسودة',       color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  sent:         { label: 'مُرسل',       color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  acknowledged: { label: 'مؤكد',        color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' },
  received:     { label: 'مستلم',       color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  invoiced:     { label: 'مفوتر',       color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
  cancelled:    { label: 'ملغي',        color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
};

export default function PurchaseOrdersClient() {
  const router = useRouter();
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
      toast.error('فشل في تحميل أوامر الشراء');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance">
            <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6" /> أوامر الشراء
          </h1>
        </div>
        <Link href="/dashboard/finance/purchase-orders/new">
          <Button><Plus className="h-4 w-4 me-2" /> أمر شراء جديد</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="بحث بالرقم أو المورد..."
          className="flex-1 min-w-[200px]"
        />
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="draft">مسودة</SelectItem>
            <SelectItem value="sent">مُرسل</SelectItem>
            <SelectItem value="acknowledged">مؤكد</SelectItem>
            <SelectItem value="received">مستلم</SelectItem>
            <SelectItem value="invoiced">مفوتر</SelectItem>
            <SelectItem value="cancelled">ملغي</SelectItem>
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
          title="لا توجد أوامر شراء"
          description="أنشئ أمر شراء جديد لإدارة مشترياتك من الموردين"
          actionLabel="أمر شراء جديد"
          onAction={() => router.push('/dashboard/finance/purchase-orders/new')}
        />
      ) : (
        <div className="space-y-3">
          {orders.map(po => {
            const st = STATUS_MAP[po.status] || STATUS_MAP.draft;
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
                          <Badge className={st.color}>{st.label}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {po.supplier_name || 'بدون مورد'}
                          {po.supplier_company ? ` — ${po.supplier_company}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-end">
                      <p className="font-bold font-mono">{formatCurrency(po.total, po.currency)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(po.issue_date)}</p>
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
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>السابق</Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>التالي</Button>
        </div>
      )}
    </div>
  );
}
