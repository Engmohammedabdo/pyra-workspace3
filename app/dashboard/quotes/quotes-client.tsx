'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileText, Plus, MoreHorizontal, Pencil, Copy, Send, Trash2, Download } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import { generateQuotePDF } from '@/lib/pdf/quote-pdf';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import { usePermission } from '@/hooks/usePermission';

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
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft: { label: 'مسودة', variant: 'secondary' },
  sent: { label: 'مُرسل', variant: 'default' },
  viewed: { label: 'تمت المشاهدة', variant: 'outline' },
  signed: { label: 'مُوقع', variant: 'default' },
  expired: { label: 'منتهي', variant: 'destructive' },
  cancelled: { label: 'ملغي', variant: 'destructive' },
};

export default function QuotesClient() {
  const router = useRouter();
  const canCreate = usePermission('quotes.create');
  const canEdit = usePermission('quotes.edit');
  const canDelete = usePermission('quotes.delete');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState<Quote | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      toast.success('تم نسخ عرض السعر');
      fetchQuotes();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); }
  };

  const handleSend = async (id: string) => {
    try {
      const res = await fetch(`/api/quotes/${id}/send`, { method: 'POST' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      toast.success('تم إرسال عرض السعر');
      fetchQuotes();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); }
  };

  const handleDownloadPDF = async (id: string) => {
    try {
      const res = await fetch(`/api/quotes/${id}`);
      const json = await res.json();
      if (!res.ok || !json.data) {
        toast.error('فشل في تحميل بيانات العرض');
        return;
      }
      await generateQuotePDF(json.data);
      toast.success('تم تحميل ملف PDF');
    } catch {
      toast.error('فشل في إنشاء ملف PDF');
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/quotes/${selected.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowDelete(false);
      setSelected(null);
      toast.success('تم حذف عرض السعر');
      fetchQuotes();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setDeleting(false); }
  };

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" /> عروض الأسعار</h1>
          <p className="text-muted-foreground">إدارة عروض الأسعار والفواتير</p>
        </div>
        {canCreate && (
          <Button onClick={() => router.push('/dashboard/quotes/new')} className="bg-orange-500 hover:bg-orange-600">
            <Plus className="h-4 w-4 me-2" /> إنشاء عرض سعر
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="بحث بالرقم أو العميل..."
          className="flex-1 max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            <SelectItem value="draft">مسودة</SelectItem>
            <SelectItem value="sent">مُرسل</SelectItem>
            <SelectItem value="viewed">تمت المشاهدة</SelectItem>
            <SelectItem value="signed">مُوقع</SelectItem>
            <SelectItem value="expired">منتهي</SelectItem>
            <SelectItem value="cancelled">ملغي</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start p-3 font-medium">رقم العرض</th>
                  <th className="text-start p-3 font-medium">العميل</th>
                  <th className="text-start p-3 font-medium">المشروع</th>
                  <th className="text-start p-3 font-medium">المبلغ</th>
                  <th className="text-start p-3 font-medium">الحالة</th>
                  <th className="text-start p-3 font-medium">التاريخ</th>
                  <th className="text-start p-3 font-medium w-[60px]" />
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b">{Array.from({ length: 7 }).map((_, j) => <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>)}</tr>
                )) : quotes.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState icon={FileText} title="لا توجد عروض أسعار" description="أنشئ عرض سعر جديد للبدء" />
                    </td>
                  </tr>
                ) : quotes.map(q => {
                  const s = STATUS_MAP[q.status] || { label: q.status, variant: 'secondary' as const };
                  return (
                    <tr key={q.id} className="border-b hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => router.push(`/dashboard/quotes/${q.id}`)}>
                      <td className="p-3 font-mono">{q.quote_number}</td>
                      <td className="p-3">{q.client_name || q.client_company || '—'}</td>
                      <td className="p-3 text-muted-foreground">{q.project_name || '—'}</td>
                      <td className="p-3 font-mono">{formatCurrency(q.total, q.currency)}</td>
                      <td className="p-3"><Badge variant={s.variant}>{s.label}</Badge></td>
                      <td className="p-3 text-muted-foreground text-xs">{formatDate(q.estimate_date)}</td>
                      <td className="p-3" onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canEdit && (
                              <DropdownMenuItem onClick={() => router.push(`/dashboard/quotes/${q.id}`)}>
                                <Pencil className="h-3.5 w-3.5 me-2" /> تعديل
                              </DropdownMenuItem>
                            )}
                            {canCreate && (
                              <DropdownMenuItem onClick={() => handleDuplicate(q.id)}>
                                <Copy className="h-3.5 w-3.5 me-2" /> نسخ العرض
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleDownloadPDF(q.id)}>
                              <Download className="h-3.5 w-3.5 me-2" /> تحميل PDF
                            </DropdownMenuItem>
                            {canEdit && q.status === 'draft' && (
                              <DropdownMenuItem onClick={() => handleSend(q.id)}>
                                <Send className="h-3.5 w-3.5 me-2" /> إرسال
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
                              <DropdownMenuItem className="text-destructive" onClick={() => { setSelected(q); setShowDelete(true); }}>
                                <Trash2 className="h-3.5 w-3.5 me-2" /> حذف
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>حذف عرض السعر</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            هل أنت متأكد من حذف عرض السعر <strong>{selected?.quote_number}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'جارٍ الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
