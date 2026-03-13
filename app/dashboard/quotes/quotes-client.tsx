'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileText, Plus, MoreHorizontal, Pencil, Copy, Send, Trash2, Download, Receipt } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import { generateQuotePDF } from '@/lib/pdf/quote-pdf';
import { toast } from 'sonner';
import { usePermission } from '@/hooks/usePermission';
import { DataTable, type ColumnDef, type SortConfig } from '@/components/ui/data-table';

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
  pending_approval: { label: 'بانتظار الموافقة', variant: 'outline' },
  sent: { label: 'مُرسل', variant: 'default' },
  viewed: { label: 'تمت المشاهدة', variant: 'outline' },
  signed: { label: 'مُوقع', variant: 'default' },
  invoiced: { label: 'تم الفوترة', variant: 'default' },
  rejected: { label: 'مرفوض', variant: 'destructive' },
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
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

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

  const handleConvertToInvoice = async (id: string) => {
    try {
      const res = await fetch(`/api/invoices/from-quote/${id}`, { method: 'POST' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      toast.success('تم إنشاء الفاتورة من عرض السعر');
      fetchQuotes();
      if (json.data?.id) router.push(`/dashboard/invoices/${json.data.id}`);
    } catch { toast.error('حدث خطأ'); }
  };

  const handleDelete = async () => {
    const idsToDelete = bulkDeleteIds.length > 0 ? bulkDeleteIds : selected ? [selected.id] : [];
    if (idsToDelete.length === 0) return;
    setDeleting(true);
    try {
      let failCount = 0;
      for (const id of idsToDelete) {
        const res = await fetch(`/api/quotes/${id}`, { method: 'DELETE' });
        const json = await res.json();
        if (json.error) failCount++;
      }
      setShowDelete(false);
      setSelected(null);
      setBulkDeleteIds([]);
      if (failCount > 0) toast.error(`فشل حذف ${failCount} عرض`);
      else toast.success(idsToDelete.length > 1 ? `تم حذف ${idsToDelete.length} عروض` : 'تم حذف عرض السعر');
      fetchQuotes();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setDeleting(false); }
  };

  /* ── sort handler ── */
  const handleSortChange = useCallback((key: string) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return prev.direction === 'asc' ? { key, direction: 'desc' } : null;
      }
      return { key, direction: 'asc' };
    });
  }, []);

  /* ── sorted quotes ── */
  const sortedQuotes = useMemo(() => {
    if (!sortConfig) return quotes;
    const sorted = [...quotes].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      switch (sortConfig.key) {
        case 'quote_number': aVal = a.quote_number; bVal = b.quote_number; break;
        case 'client': aVal = a.client_name || ''; bVal = b.client_name || ''; break;
        case 'total': aVal = a.total; bVal = b.total; break;
        case 'estimate_date': aVal = a.estimate_date; bVal = b.estimate_date; break;
        default: return 0;
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortConfig.direction === 'asc'
        ? String(aVal).localeCompare(String(bVal), 'ar')
        : String(bVal).localeCompare(String(aVal), 'ar');
    });
    return sorted;
  }, [quotes, sortConfig]);

  /* ── column definitions ── */
  const columns: ColumnDef<Quote>[] = useMemo(() => [
    {
      key: 'quote_number',
      header: 'رقم العرض',
      sortable: true,
      render: (q) => <span className="font-mono">{q.quote_number}</span>,
    },
    {
      key: 'client',
      header: 'العميل',
      sortable: true,
      render: (q) => q.client_name || q.client_company || '—',
    },
    {
      key: 'project',
      header: 'المشروع',
      className: 'text-muted-foreground',
      render: (q) => q.project_name || '—',
    },
    {
      key: 'total',
      header: 'المبلغ',
      sortable: true,
      render: (q) => <span className="font-mono">{formatCurrency(q.total, q.currency)}</span>,
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (q) => {
        const s = STATUS_MAP[q.status] || { label: q.status, variant: 'secondary' as const };
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      key: 'estimate_date',
      header: 'التاريخ',
      sortable: true,
      className: 'text-muted-foreground text-xs',
      render: (q) => formatDate(q.estimate_date),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-[60px]',
      render: (q) => (
        <div data-no-row-click>
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
              {q.status === 'signed' && (
                <DropdownMenuItem onClick={() => handleConvertToInvoice(q.id)}>
                  <Receipt className="h-3.5 w-3.5 me-2" /> تحويل لفاتورة
                </DropdownMenuItem>
              )}
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
        </div>
      ),
    },
  ], [canEdit, canCreate, canDelete, router, handleDuplicate, handleSend, handleDownloadPDF, handleConvertToInvoice]);

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

      {/* Table */}
      <DataTable
        columns={columns}
        data={sortedQuotes}
        loading={loading}
        emptyState={{
          icon: FileText,
          title: 'لا توجد عروض أسعار',
          description: 'أنشئ عرض سعر جديد للبدء',
        }}
        selectable
        getRowId={(q) => q.id}
        sortConfig={sortConfig}
        onSortChange={handleSortChange}
        onRowClick={(q) => router.push(`/dashboard/quotes/${q.id}`)}
        skeletonRows={3}
        bulkActions={canDelete ? [
          {
            label: 'حذف المحدد',
            icon: Trash2,
            variant: 'destructive',
            onClick: (ids) => {
              if (ids.length === 0) return;
              setBulkDeleteIds(ids);
              setSelected(null);
              setShowDelete(true);
            },
          },
        ] : []}
      />

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>حذف عرض السعر</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            {bulkDeleteIds.length > 1
              ? `هل أنت متأكد من حذف ${bulkDeleteIds.length} عروض أسعار؟ لا يمكن التراجع عن هذا الإجراء.`
              : <>هل أنت متأكد من حذف عرض السعر <strong>{selected?.quote_number}</strong>؟ لا يمكن التراجع عن هذا الإجراء.</>
            }
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
