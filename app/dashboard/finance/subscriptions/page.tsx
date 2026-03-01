'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowRight, RefreshCw, Plus, Pencil, Trash2, Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { EmptyState } from '@/components/ui/empty-state';

interface Subscription {
  id: string; name: string; provider: string | null; cost: number; currency: string;
  billing_cycle: string | null; next_renewal_date: string | null;
  card_name: string | null; card_last_four: string | null;
  status: string; auto_renew: boolean;
}

const CYCLE_LABELS: Record<string, string> = { monthly: 'شهري', quarterly: 'ربع سنوي', yearly: 'سنوي' };
const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default', cancelled: 'destructive', paused: 'secondary',
};

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/finance/subscriptions?${params}`);
      const json = await res.json();
      if (json.data) setSubs(json.data);
      if (json.meta) {
        setMonthlyTotal(json.meta.monthly_total || 0);
        setTotal(json.meta.total || 0);
      }
    } catch { toast.error('فشل في تحميل الاشتراكات'); }
    finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/finance/subscriptions/${deleteId}`, { method: 'DELETE' });
      if (res.ok) { toast.success('تم الحذف'); setDeleteId(null); fetchSubs(); }
      else toast.error('فشل في الحذف');
    } catch { toast.error('فشل في الحذف'); }
    finally { setDeleting(false); }
  };

  const upcomingRenewals = subs.filter(s => {
    if (!s.next_renewal_date || s.status !== 'active') return false;
    const days = Math.ceil((new Date(s.next_renewal_date).getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 7;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance"><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
          <h1 className="text-2xl font-bold flex items-center gap-2"><RefreshCw className="h-6 w-6" /> الاشتراكات</h1>
        </div>
        <Link href="/dashboard/finance/subscriptions/new">
          <Button><Plus className="h-4 w-4 ml-2" /> إضافة اشتراك</Button>
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">التكلفة الشهرية</p>
          <p className="text-2xl font-bold mt-1 text-orange-600">{formatCurrency(monthlyTotal)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">عدد الاشتراكات</p>
          <p className="text-2xl font-bold mt-1">{total}</p>
        </CardContent></Card>
      </div>

      {/* Renewal Alert */}
      {upcomingRenewals.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-yellow-800 dark:text-yellow-200">{upcomingRenewals.length} اشتراكات تتجدد خلال 7 أيام</p>
            <ul className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
              {upcomingRenewals.map(s => (
                <li key={s.id}>{s.name} — {formatCurrency(s.cost, s.currency)} ({formatDate(s.next_renewal_date!)})</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10" />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v === 'all' ? '' : v)}>
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
            <thead><tr className="border-b bg-muted/50">
              <th className="text-start p-3 font-medium">الاسم</th>
              <th className="text-start p-3 font-medium">المزود</th>
              <th className="text-start p-3 font-medium">التكلفة</th>
              <th className="text-start p-3 font-medium">الدورة</th>
              <th className="text-start p-3 font-medium">التجديد</th>
              <th className="text-start p-3 font-medium">البطاقة</th>
              <th className="text-start p-3 font-medium">الحالة</th>
              <th className="text-start p-3 font-medium">الإجراءات</th>
            </tr></thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">{Array.from({ length: 8 }).map((_, j) => (
                  <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>
                ))}</tr>
              )) : subs.length === 0 ? (
                <tr><td colSpan={8}><EmptyState icon={RefreshCw} title="لا توجد اشتراكات" description="أضف اشتراك جديد لتتبع التكاليف الشهرية" /></td></tr>
              ) : subs.map(s => (
                <tr key={s.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3 text-muted-foreground">{s.provider || '—'}</td>
                  <td className="p-3 font-mono">{formatCurrency(s.cost, s.currency)}</td>
                  <td className="p-3">{s.billing_cycle ? CYCLE_LABELS[s.billing_cycle] || s.billing_cycle : '—'}</td>
                  <td className="p-3 text-muted-foreground">{s.next_renewal_date ? formatDate(s.next_renewal_date) : '—'}</td>
                  <td className="p-3 text-muted-foreground">{s.card_name ? `${s.card_name} (${s.card_last_four})` : '—'}</td>
                  <td className="p-3">
                    <Badge variant={STATUS_VARIANTS[s.status] || 'outline'}>
                      {s.status === 'active' ? 'نشط' : s.status === 'cancelled' ? 'ملغي' : s.status === 'paused' ? 'متوقف' : s.status}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Link href={`/dashboard/finance/subscriptions/${s.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-3.5 w-3.5" /></Button>
                      </Link>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => setDeleteId(s.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <DialogContent><DialogHeader><DialogTitle>حذف الاشتراك</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">هل أنت متأكد من حذف هذا الاشتراك؟</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting ? 'جاري الحذف...' : 'حذف'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
