'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowRight, Repeat, Plus, Search, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { RecurringSummary } from '@/components/dashboard/recurring-list/RecurringSummary';
import { RecurringTable } from '@/components/dashboard/recurring-list/RecurringTable';

export default function RecurringInvoicesPage() {
  const [items, setItems] = useState<any[]>([]);
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
      if (res.ok) {
        toast.success('تم الحذف');
        setDeleteId(null);
        fetchData();
      } else {
        toast.error('فشل في الحذف');
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/finance/recurring-invoices/generate', { method: 'POST' });
      if (res.ok) {
        toast.success('تم توليد الفواتير بنجاح');
        fetchData();
      } else {
        toast.error('فشل في توليد الفواتير');
      }
    } finally {
      setGenerating(false);
    }
  };

  const activeCount = items.filter(i => i.status === 'active').length;
  const dueCount = items.filter(i => i.status === 'active' && new Date(i.next_generation_date) <= new Date()).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance"><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Repeat className="h-6 w-6" /> الفواتير المتكررة</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleGenerate} disabled={generating}><Zap className="h-4 w-4 me-2" />{generating ? 'جاري...' : 'توليد'}</Button>
          <Link href="/dashboard/finance/recurring/new"><Button><Plus className="h-4 w-4 me-2" /> إضافة</Button></Link>
        </div>
      </div>

      <RecurringSummary total={total} activeCount={activeCount} dueCount={dueCount} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="ps-10" />
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

      {loading ? <Skeleton className="h-96 w-full" /> : <RecurringTable items={items} onDelete={setDeleteId} />}

      <Dialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>حذف الفاتورة</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">هل أنت متأكد؟</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting ? 'جاري...' : 'حذف'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
