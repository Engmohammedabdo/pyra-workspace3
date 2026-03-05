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
import { ArrowRight, FileSignature, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils/format';

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

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'مسودة', variant: 'outline' },
  active: { label: 'نشط', variant: 'default' },
  in_progress: { label: 'قيد التنفيذ', variant: 'default' },
  completed: { label: 'مكتمل', variant: 'secondary' },
  cancelled: { label: 'ملغي', variant: 'destructive' },
};

const TYPE_MAP: Record<string, string> = {
  retainer: 'ثابت شهري',
  milestone: 'مراحل',
  upfront_delivery: 'دفعة مقدمة + تسليم',
  fixed: 'سعر ثابت',
  hourly: 'بالساعة',
};

export default function ContractsClient() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      toast.error('فشل في تحميل العقود');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/finance/contracts/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('تم حذف العقد');
        setDeleteId(null);
        fetchContracts();
      } else {
        toast.error('فشل في الحذف');
      }
    } catch {
      toast.error('فشل في الحذف');
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance">
            <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSignature className="h-6 w-6" /> العقود
          </h1>
        </div>
        <Link href="/dashboard/finance/contracts/new">
          <Button><Plus className="h-4 w-4 ml-2" /> إنشاء عقد</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-10" />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="draft">مسودة</SelectItem>
            <SelectItem value="active">نشط</SelectItem>
            <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
            <SelectItem value="completed">مكتمل</SelectItem>
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
                <th className="text-start p-3 font-medium">النوع</th>
                <th className="text-start p-3 font-medium">القيمة</th>
                <th className="text-start p-3 font-medium">التحصيل</th>
                <th className="text-start p-3 font-medium">الحالة</th>
                <th className="text-start p-3 font-medium">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="p-3"><Skeleton className="h-5 w-24" /></td>
                  ))}
                </tr>
              )) : contracts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">لا توجد عقود</td>
                </tr>
              ) : contracts.map(c => {
                const progress = c.total_value > 0 ? Math.round((c.amount_collected / c.total_value) * 100) : 0;
                return (
                  <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">{c.title || '—'}</td>
                    <td className="p-3 text-muted-foreground">{c.client_company || c.client_name || '—'}</td>
                    <td className="p-3 text-muted-foreground">{c.contract_type ? TYPE_MAP[c.contract_type] || c.contract_type : '—'}</td>
                    <td className="p-3 font-mono">{formatCurrency(c.total_value, c.currency)}</td>
                    <td className="p-3">
                      <div className="space-y-1">
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
                    </td>
                    <td className="p-3">
                      <Badge variant={STATUS_MAP[c.status]?.variant || 'outline'}>
                        {STATUS_MAP[c.status]?.label || c.status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Link href={`/dashboard/finance/contracts/${c.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-3.5 w-3.5" /></Button>
                        </Link>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => setDeleteId(c.id)}>
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
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>السابق</Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>التالي</Button>
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>حذف العقد</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">هل أنت متأكد من حذف هذا العقد؟</p>
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
