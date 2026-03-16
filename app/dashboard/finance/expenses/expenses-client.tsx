'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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
import { ArrowRight, ArrowDownCircle, Plus, Pencil, Trash2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { ExportButton } from '@/components/reports/ExportButton';
import { DataTable, type ColumnDef, type SortConfig } from '@/components/ui/data-table';

interface Expense {
  id: string;
  description: string | null;
  amount: number;
  currency: string;
  vat_amount: number;
  expense_date: string | null;
  vendor: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_company: string | null;
  category_name: string | null;
  category_name_ar: string | null;
  category_color: string | null;
  payment_method: string | null;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
}

const EXPENSE_STATUS_MAP: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  approved: { label: 'معتمد', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', icon: CheckCircle },
  pending: { label: 'بانتظار الاعتماد', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', icon: Clock },
  rejected: { label: 'مرفوض', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: XCircle },
  draft: { label: 'مسودة', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: Clock },
};

interface Category {
  id: string;
  name: string;
  name_ar: string;
}

export default function ExpensesClient() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [summary, setSummary] = useState({ total_amount: 0, total_vat: 0, total_count: 0 });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  // Fetch categories
  useEffect(() => {
    fetch('/api/finance/expenses/categories')
      .then(r => r.json())
      .then(j => { if (j.data) setCategories(j.data); })
      .catch(() => {});
  }, []);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search) params.set('search', search);
      if (categoryFilter) params.set('category', categoryFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/finance/expenses?${params}`);
      const json = await res.json();
      if (json.data) setExpenses(json.data);
      if (json.meta) {
        setTotal(json.meta.total || 0);
        setHasMore(json.meta.hasMore || false);
        if (json.meta.summary) setSummary(json.meta.summary);
      }
    } catch {
      toast.error('فشل في تحميل المصاريف');
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, fromDate, toDate, statusFilter]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const handleDelete = async () => {
    const idsToDelete = bulkDeleteIds.length > 0 ? bulkDeleteIds : deleteId ? [deleteId] : [];
    if (idsToDelete.length === 0) return;
    setDeleting(true);
    try {
      let failCount = 0;
      for (const id of idsToDelete) {
        const res = await fetch(`/api/finance/expenses/${id}`, { method: 'DELETE' });
        if (!res.ok) failCount++;
      }
      setDeleteId(null);
      setBulkDeleteIds([]);
      if (failCount > 0) toast.error(`فشل حذف ${failCount} مصروف`);
      else toast.success(idsToDelete.length > 1 ? `تم حذف ${idsToDelete.length} مصروفات` : 'تم حذف المصروف');
      fetchExpenses();
    } catch {
      toast.error('فشل في حذف المصروف');
    } finally {
      setDeleting(false);
    }
  };

  const handleApproval = useCallback(async (id: string, action: 'approve' | 'reject') => {
    try {
      const res = await fetch(`/api/finance/expenses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) { toast.error('فشل في تحديث حالة المصروف'); return; }
      toast.success(action === 'approve' ? 'تم اعتماد المصروف' : 'تم رفض المصروف');
      fetchExpenses();
    } catch {
      toast.error('حدث خطأ');
    }
  }, [fetchExpenses]);

  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);

  /* ── sort handler ── */
  const handleSortChange = useCallback((key: string) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return prev.direction === 'asc' ? { key, direction: 'desc' } : null;
      }
      return { key, direction: 'asc' };
    });
  }, []);

  /* ── sorted expenses ── */
  const sortedExpenses = useMemo(() => {
    if (!sortConfig) return expenses;
    return [...expenses].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      switch (sortConfig.key) {
        case 'amount': aVal = a.amount; bVal = b.amount; break;
        case 'expense_date': aVal = a.expense_date || ''; bVal = b.expense_date || ''; break;
        case 'vendor': aVal = a.vendor || ''; bVal = b.vendor || ''; break;
        default: return 0;
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortConfig.direction === 'asc'
        ? String(aVal).localeCompare(String(bVal), 'ar')
        : String(bVal).localeCompare(String(aVal), 'ar');
    });
  }, [expenses, sortConfig]);

  /* ── column definitions ── */
  const columns: ColumnDef<Expense>[] = useMemo(() => [
    {
      key: 'description',
      header: 'الوصف',
      render: (exp) => <span className="font-medium">{exp.description || '—'}</span>,
    },
    {
      key: 'amount',
      header: 'المبلغ',
      sortable: true,
      render: (exp) => <span className="text-red-600 font-mono">{formatCurrency(exp.amount, exp.currency)}</span>,
    },
    {
      key: 'category',
      header: 'التصنيف',
      render: (exp) => exp.category_name_ar ? (
        <Badge variant="secondary" style={{ backgroundColor: exp.category_color ? `${exp.category_color}20` : undefined, color: exp.category_color || undefined }}>
          {exp.category_name_ar}
        </Badge>
      ) : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'expense_date',
      header: 'التاريخ',
      sortable: true,
      className: 'text-muted-foreground',
      render: (exp) => exp.expense_date ? formatDate(exp.expense_date) : '—',
    },
    {
      key: 'vendor',
      header: 'المورد',
      sortable: true,
      render: (exp) => exp.supplier_id && exp.supplier_name ? (
        <Link href={`/dashboard/finance/suppliers/${exp.supplier_id}`} className="text-orange-600 hover:underline font-medium" onClick={e => e.stopPropagation()}>
          {exp.supplier_name}
        </Link>
      ) : exp.vendor ? (
        <span className="text-muted-foreground">{exp.vendor}</span>
      ) : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (exp) => {
        const st = EXPENSE_STATUS_MAP[exp.status] || EXPENSE_STATUS_MAP.approved;
        return <Badge className={`${st.color} gap-1`}><st.icon className="h-3 w-3" />{st.label}</Badge>;
      },
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      render: (exp) => (
        <div className="flex items-center gap-1" data-no-row-click>
          {exp.status === 'pending' && (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={() => handleApproval(exp.id, 'approve')} title="اعتماد">
                <CheckCircle className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => handleApproval(exp.id, 'reject')} title="رفض">
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Link href={`/dashboard/finance/expenses/${exp.id}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-3.5 w-3.5" /></Button>
          </Link>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => setDeleteId(exp.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ], [handleApproval]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance">
            <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowDownCircle className="h-6 w-6" /> المصاريف
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            type="expenses"
            from={fromDate || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]}
            to={toDate || new Date().toISOString().split('T')[0]}
          />
          <Link href="/dashboard/finance/expenses/new">
            <Button><Plus className="h-4 w-4 me-2" /> إضافة مصروف</Button>
          </Link>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading ? Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-8 w-24" /></CardContent></Card>
        )) : (
          <>
            <Card><CardContent className="p-4">
              <p className="text-sm text-muted-foreground">إجمالي المصاريف</p>
              <p className="text-2xl font-bold mt-1 text-red-600">{formatCurrency(summary.total_amount)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-sm text-muted-foreground">ضريبة القيمة المضافة</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(summary.total_vat)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-sm text-muted-foreground">عدد المصاريف</p>
              <p className="text-2xl font-bold mt-1">{summary.total_count}</p>
            </CardContent></Card>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="بحث..."
          className="flex-1 min-w-[200px]"
        />
        <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="التصنيف" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name_ar || c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="pending">بانتظار الاعتماد</SelectItem>
            <SelectItem value="approved">معتمد</SelectItem>
            <SelectItem value="rejected">مرفوض</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">من</span>
          <Input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }} className="w-[160px]" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">إلى</span>
          <Input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }} className="w-[160px]" />
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={sortedExpenses}
        loading={loading}
        emptyState={{
          icon: ArrowDownCircle,
          title: 'لا توجد مصاريف',
          description: 'أضف مصروف جديد لتتبع النفقات',
        }}
        selectable
        getRowId={(exp) => exp.id}
        sortConfig={sortConfig}
        onSortChange={handleSortChange}
        bulkActions={[
          {
            label: 'حذف المحدد',
            icon: Trash2,
            variant: 'destructive',
            onClick: (ids) => {
              if (ids.length === 0) return;
              setBulkDeleteIds(ids);
              setDeleteId(ids[0]);
            },
          },
        ]}
      />

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
          <DialogHeader><DialogTitle>حذف المصروف</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">هل أنت متأكد من حذف هذا المصروف؟ لا يمكن التراجع عن هذا الإجراء.</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting ? 'جاري الحذف...' : 'حذف'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
