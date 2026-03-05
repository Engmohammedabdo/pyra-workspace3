'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SearchInput } from '@/components/ui/search-input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FileText, Plus, MoreHorizontal, Eye, Download, Trash2,
  DollarSign, AlertTriangle, TrendingUp, ChevronLeft, ChevronRight, RefreshCw,
} from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';
import { generateInvoicePDF } from '@/lib/pdf/invoice-pdf';
import { ExportButton } from '@/components/reports/ExportButton';
import { EmptyState } from '@/components/ui/empty-state';
import { StaggerContainer, StaggerItem } from '@/components/ui/stagger-list';
import { usePermission } from '@/hooks/usePermission';

/* ───────────────────────── Types ───────────────────────── */

interface Invoice {
  id: string;
  invoice_number: string;
  client_name: string | null;
  client_company: string | null;
  project_name: string | null;
  status: string;
  total: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  issue_date: string;
  due_date: string;
  created_at: string;
}

interface RevenueSummary {
  total_revenue: number;
  total_outstanding: number;
  total_overdue: number;
}

/* ───────────────────────── Constants ───────────────────── */

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft:          { label: 'مسودة',        color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  sent:           { label: 'مرسلة',        color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  paid:           { label: 'مدفوعة',       color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  partially_paid: { label: 'مدفوعة جزئياً', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
  overdue:        { label: 'متأخرة',       color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  cancelled:      { label: 'ملغية',        color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
};

const PAGE_SIZE = 20;

/* ───────────────────────── Component ──────────────────── */

export default function InvoicesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canCreate = usePermission('invoices.create');
  const canDelete = usePermission('invoices.delete');

  /* ── list state ── */
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(() => {
    const urlStatus = searchParams.get('status');
    return urlStatus || 'all';
  });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  /* ── revenue summary ── */
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);

  /* ── delete dialog ── */
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ── debounce search (400ms) ── */
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  /* ── fetch revenue summary ── */
  useEffect(() => {
    fetch('/api/invoices/revenue-summary')
      .then(r => r.json())
      .then(json => { if (json.data) setRevenue(json.data); })
      .catch(() => {});
  }, []);

  /* ── fetch invoices ── */
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));

      const res = await fetch(`/api/invoices?${params}`);
      const json = await res.json();
      if (json.data) setInvoices(json.data);
      if (json.meta?.total !== undefined) setTotal(json.meta.total);
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ في تحميل الفواتير');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedSearch, page]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  /* ── reset page on filter change ── */
  useEffect(() => { setPage(1); }, [statusFilter]);

  /* ── download PDF (placeholder) ── */
  const handleDownloadPDF = async (id: string) => {
    try {
      const res = await fetch(`/api/invoices/${id}`);
      const json = await res.json();
      if (!res.ok || !json.data) {
        toast.error('فشل في تحميل بيانات الفاتورة');
        return;
      }
      await generateInvoicePDF(json.data);
      toast.success('تم تحميل ملف PDF');
    } catch {
      toast.error('فشل في إنشاء ملف PDF');
    }
  };

  /* ── delete ── */
  const handleDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices/${selected.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowDelete(false);
      setSelected(null);
      toast.success('تم حذف الفاتورة');
      fetchInvoices();
      // refresh revenue
      fetch('/api/invoices/revenue-summary')
        .then(r => r.json())
        .then(j => { if (j.data) setRevenue(j.data); })
        .catch(() => {});
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  /* ──────────────────────── Render ─────────────────────── */
  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6" /> الفواتير
            </h1>
            <p className="text-muted-foreground">إدارة الفواتير والمدفوعات</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={fetchInvoices}
            aria-label="تحديث"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            type="invoices"
            from={new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]}
            to={new Date().toISOString().split('T')[0]}
          />
          {canCreate && (
            <Link href="/dashboard/invoices/new">
              <Button className="bg-orange-500 hover:bg-orange-600">
                <Plus className="h-4 w-4 me-2" /> فاتورة جديدة
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Revenue Summary Cards */}
      <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StaggerItem>
          <Card className="transition-all duration-200 hover:shadow-md hover:border-orange-500/30 hover:-translate-y-0.5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي الإيرادات</p>
                {revenue ? (
                  <p className="text-lg font-bold font-mono">{formatCurrency(revenue.total_revenue)}</p>
                ) : (
                  <Skeleton className="h-6 w-24 mt-1" />
                )}
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="transition-all duration-200 hover:shadow-md hover:border-orange-500/30 hover:-translate-y-0.5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">المبالغ المستحقة</p>
                {revenue ? (
                  <p className="text-lg font-bold font-mono">{formatCurrency(revenue.total_outstanding)}</p>
                ) : (
                  <Skeleton className="h-6 w-24 mt-1" />
                )}
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="transition-all duration-200 hover:shadow-md hover:border-orange-500/30 hover:-translate-y-0.5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">المبالغ المتأخرة</p>
                {revenue ? (
                  <p className="text-lg font-bold font-mono">{formatCurrency(revenue.total_overdue)}</p>
                ) : (
                  <Skeleton className="h-6 w-24 mt-1" />
                )}
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
      </StaggerContainer>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="بحث بالرقم أو العميل أو المشروع..."
          className="flex-1 max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            <SelectItem value="draft">مسودة</SelectItem>
            <SelectItem value="sent">مرسلة</SelectItem>
            <SelectItem value="paid">مدفوعة</SelectItem>
            <SelectItem value="partially_paid">مدفوعة جزئياً</SelectItem>
            <SelectItem value="overdue">متأخرة</SelectItem>
            <SelectItem value="cancelled">ملغية</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start p-3 font-medium">رقم الفاتورة</th>
                  <th className="text-start p-3 font-medium">العميل</th>
                  <th className="text-start p-3 font-medium">المشروع</th>
                  <th className="text-start p-3 font-medium">الإجمالي</th>
                  <th className="text-start p-3 font-medium">المدفوع</th>
                  <th className="text-start p-3 font-medium">المتبقي</th>
                  <th className="text-start p-3 font-medium">الحالة</th>
                  <th className="text-start p-3 font-medium">التاريخ</th>
                  <th className="text-start p-3 font-medium w-[60px]" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>
                      ))}
                    </tr>
                  ))
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState icon={FileText} title="لا توجد فواتير" description="أنشئ فاتورة جديدة للبدء" />
                    </td>
                  </tr>
                ) : (
                  invoices.map(inv => {
                    const s = STATUS_MAP[inv.status] || { label: inv.status, color: 'bg-gray-100 text-gray-700' };
                    return (
                      <tr
                        key={inv.id}
                        className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
                      >
                        <td className="p-3 font-mono">{inv.invoice_number}</td>
                        <td className="p-3">{inv.client_name || inv.client_company || '—'}</td>
                        <td className="p-3 text-muted-foreground">{inv.project_name || '—'}</td>
                        <td className="p-3 font-mono">{formatCurrency(inv.total, inv.currency)}</td>
                        <td className="p-3 font-mono text-green-600">{formatCurrency(inv.amount_paid, inv.currency)}</td>
                        <td className="p-3 font-mono text-orange-600">{formatCurrency(inv.amount_due, inv.currency)}</td>
                        <td className="p-3">
                          <Badge variant="outline" className={s.color}>{s.label}</Badge>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">{formatDate(inv.issue_date)}</td>
                        <td className="p-3" onClick={e => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}>
                                <Eye className="h-3.5 w-3.5 me-2" /> عرض
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDownloadPDF(inv.id)}>
                                <Download className="h-3.5 w-3.5 me-2" /> تحميل PDF
                              </DropdownMenuItem>
                              {canDelete && inv.status === 'draft' && (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => { setSelected(inv); setShowDelete(true); }}
                                >
                                  <Trash2 className="h-3.5 w-3.5 me-2" /> حذف
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination — RTL: prev (right) first, next (left) second */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground px-3">
            صفحة {page} من {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>حذف الفاتورة</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            هل أنت متأكد من حذف الفاتورة <strong>{selected?.invoice_number}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
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
