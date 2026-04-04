'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowRight, Repeat, Plus, Search, Zap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRecurringInvoices } from '@/hooks/useRecurring';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mutateAPI } from '@/hooks/api-helpers';
import { RecurringSummary } from '@/components/dashboard/recurring-list/RecurringSummary';
import { RecurringTable } from '@/components/dashboard/recurring-list/RecurringTable';

export default function RecurringInvoicesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const params = useMemo(() => {
    const p: Record<string, string> = { page: String(page), pageSize: '20' };
    if (search) p.search = search;
    if (statusFilter) p.status = statusFilter;
    return p;
  }, [page, search, statusFilter]);

  const { data: items = [], isLoading: loading } = useRecurringInvoices(params);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['recurring-invoices'] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mutateAPI(`/api/finance/recurring-invoices/${id}`, 'DELETE'),
    onSuccess: () => { toast.success('تم الحذف'); setDeleteId(null); invalidate(); },
    onError: () => toast.error('فشل في الحذف'),
  });

  const generateMutation = useMutation({
    mutationFn: () => mutateAPI('/api/finance/recurring-invoices/generate', 'POST'),
    onSuccess: () => { toast.success('تم توليد الفواتير بنجاح'); invalidate(); },
    onError: () => toast.error('فشل في توليد الفواتير'),
  });

  const activeCount = items.filter((i: any) => i.status === 'active').length;
  const dueCount = items.filter((i: any) => i.status === 'active' && new Date(i.next_date || '') <= new Date()).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance"><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Repeat className="h-6 w-6" /> الفواتير المتكررة</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>{generateMutation.isPending ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Zap className="h-4 w-4 me-2" />}{generateMutation.isPending ? 'جاري...' : 'توليد'}</Button>
          <Link href="/dashboard/finance/recurring/new"><Button><Plus className="h-4 w-4 me-2" /> إضافة</Button></Link>
        </div>
      </div>

      <RecurringSummary total={items.length} activeCount={activeCount} dueCount={dueCount} />

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
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري...</> : 'حذف'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
