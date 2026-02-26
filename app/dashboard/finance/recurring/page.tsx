'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ArrowRight, Repeat, Plus, Pencil, Trash2, Search, Zap, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils/format';

interface RecurringInvoice {
  id: string;
  title: string;
  client_id: string | null;
  client_name: string | null;
  client_company: string | null;
  contract_id: string | null;
  contract_title: string | null;
  items: Array<{ description: string; quantity: number; rate: number }>;
  currency: string;
  billing_cycle: string;
  next_generation_date: string;
  last_generated_at: string | null;
  status: string;
  auto_send: boolean;
}

const CYCLE_LABELS: Record<string, string> = {
  monthly: 'شهري',
  quarterly: 'ربع سنوي',
  yearly: 'سنوي',
};

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'نشط', variant: 'default' },
  paused: { label: 'متوقف', variant: 'secondary' },
  cancelled: { label: 'ملغي', variant: 'destructive' },
};

function calcTotal(items: Array<{ quantity: number; rate: number }>): number {
  return items.reduce((sum, item) => sum + (item.quantity || 1) * (item.rate || 0), 0);
}

export default function RecurringInvoicesPage() {
  const [items, setItems] = useState<RecurringInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/finance/recurring-invoices?${params}`);
      const json = await res.json();
      if (json.data) setItems(json.data);
      if (json.meta) {
        setTotal(json.meta.total || 0);
        setHasMore(json.meta.hasMore || false);
      }
    } catch {
      toast.error('فشل في تحميل الفواتير المتكررة');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/finance/recurring-invoices/${deleteId}`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok) {
        toast.success('تم الحذف');
        setDeleteId(null);
        fetchData();
      } else {
        toast.error(json.error || 'فشل في الحذف');
      }
    } catch {
      toast.error('فشل في الحذف');
    } finally {
      setDeleting(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/finance/recurring-invoices/generate', { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        const count = json.data?.generated || 0;
        if (count > 0) {
          toast.success(`تم توليد ${count} فاتورة بنجاح`);
          fetchData();
        } else {
          toast.info('لا توجد فواتير مستحقة للتوليد');
        }
      } else {
        toast.error(json.error || 'فشل في توليد الفواتير');
      }
    } catch {
      toast.error('فشل في توليد الفواتير');
    } finally {
      setGenerating(false);
    }
  };

  // Count due templates
  const dueCount = items.filter(i => {
    if (i.status !== 'active') return false;
    return new Date(i.next_generation_date) <= new Date();
  }).length;

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance">
            <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Repeat className="h-6 w-6" /> الفواتير المتكررة
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleGenerate} disabled={generating}>
            <Zap className="h-4 w-4 ml-2" />
            {generating ? 'جاري التوليد...' : 'توليد الفواتير المستحقة'}
          </Button>
          <Link href="/dashboard/finance/recurring/new">
            <Button><Plus className="h-4 w-4 ml-2" /> إضافة فاتورة متكررة</Button>
          </Link>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">إجمالي القوالب</p>
            <p className="text-2xl font-bold mt-1">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">نشطة</p>
            <p className="text-2xl font-bold mt-1 text-green-600">
              {items.filter(i => i.status === 'active').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">مستحقة التوليد</p>
            <p className="text-2xl font-bold mt-1 text-orange-600">{dueCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Due Alert */}
      {dueCount > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-yellow-800 dark:text-yellow-200">
              {dueCount} فاتورة متكررة مستحقة التوليد
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
              اضغط على &quot;توليد الفواتير المستحقة&quot; لإنشاء الفواتير تلقائيا
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pr-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="active">نشط</SelectItem>
            <SelectItem value="paused">متوقف</SelectItem>
            <SelectItem value="cancelled">ملغي</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-start p-3 font-medium">العنوان</th>
                <th className="text-start p-3 font-medium">العميل</th>
                <th className="text-start p-3 font-medium">الدورة</th>
                <th className="text-start p-3 font-medium">التكلفة</th>
                <th className="text-start p-3 font-medium">التوليد القادم</th>
                <th className="text-start p-3 font-medium">آخر توليد</th>
                <th className="text-start p-3 font-medium">الحالة</th>
                <th className="text-start p-3 font-medium">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>
                  ))}
                </tr>
              )) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    لا توجد فواتير متكررة
                  </td>
                </tr>
              ) : items.map(ri => {
                const cost = calcTotal(ri.items || []);
                const isDue = ri.status === 'active' && new Date(ri.next_generation_date) <= new Date();
                return (
                  <tr key={ri.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <div>
                        <span className="font-medium">{ri.title}</span>
                        {ri.auto_send && (
                          <Badge variant="outline" className="mr-2 text-xs">إرسال تلقائي</Badge>
                        )}
                      </div>
                      {ri.contract_title && (
                        <p className="text-xs text-muted-foreground mt-0.5">{ri.contract_title}</p>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {ri.client_company || ri.client_name || '—'}
                    </td>
                    <td className="p-3">
                      {CYCLE_LABELS[ri.billing_cycle] || ri.billing_cycle}
                    </td>
                    <td className="p-3 font-mono">
                      {formatCurrency(cost, ri.currency)}
                    </td>
                    <td className="p-3">
                      <span className={isDue ? 'text-orange-600 font-medium' : 'text-muted-foreground'}>
                        {formatDate(ri.next_generation_date)}
                      </span>
                      {isDue && <Badge variant="destructive" className="mr-2 text-xs">مستحق</Badge>}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {ri.last_generated_at ? formatDate(ri.last_generated_at) : '—'}
                    </td>
                    <td className="p-3">
                      <Badge variant={STATUS_MAP[ri.status]?.variant || 'outline'}>
                        {STATUS_MAP[ri.status]?.label || ri.status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Link href={`/dashboard/finance/recurring/${ri.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600"
                          onClick={() => setDeleteId(ri.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            السابق
          </Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>
            التالي
          </Button>
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>حذف الفاتورة المتكررة</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">
            هل أنت متأكد من حذف هذا القالب؟ يجب إيقافه أو إلغاؤه قبل الحذف.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'جاري الحذف...' : 'حذف'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
