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
import { ArrowRight, ArrowDownCircle, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { ExportButton } from '@/components/reports/ExportButton';
import { EmptyState } from '@/components/ui/empty-state';

interface Expense {
  id: string;
  description: string | null;
  amount: number;
  currency: string;
  vat_amount: number;
  expense_date: string | null;
  vendor: string | null;
  category_name: string | null;
  category_name_ar: string | null;
  category_color: string | null;
  payment_method: string | null;
}

interface Category {
  id: string;
  name: string;
  name_ar: string;
}

export default function ExpensesPage() {
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
  const [deleting, setDeleting] = useState(false);

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
  }, [page, search, categoryFilter, fromDate, toDate]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/finance/expenses/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('تم حذف المصروف');
        setDeleteId(null);
        fetchExpenses();
      } else {
        toast.error('فشل في حذف المصروف');
      }
    } catch {
      toast.error('فشل في حذف المصروف');
    } finally {
      setDeleting(false);
    }
  };

  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);

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
            <Button><Plus className="h-4 w-4 ml-2" /> إضافة مصروف</Button>
          </Link>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
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
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-10" />
        </div>
        <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="التصنيف" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name_ar || c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }} className="w-[160px]" />
        <Input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }} className="w-[160px]" />
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-start p-3 font-medium">الوصف</th>
                <th className="text-start p-3 font-medium">المبلغ</th>
                <th className="text-start p-3 font-medium">التصنيف</th>
                <th className="text-start p-3 font-medium">التاريخ</th>
                <th className="text-start p-3 font-medium">المورد</th>
                <th className="text-start p-3 font-medium">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">{Array.from({ length: 6 }).map((_, j) => (
                  <td key={j} className="p-3"><Skeleton className="h-5 w-24" /></td>
                ))}</tr>
              )) : expenses.length === 0 ? (
                <tr><td colSpan={6}><EmptyState icon={ArrowDownCircle} title="لا توجد مصاريف" description="أضف مصروف جديد لتتبع النفقات" /></td></tr>
              ) : expenses.map(exp => (
                <tr key={exp.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium">{exp.description || '—'}</td>
                  <td className="p-3 text-red-600 font-mono">{formatCurrency(exp.amount, exp.currency)}</td>
                  <td className="p-3">
                    {exp.category_name_ar ? (
                      <Badge variant="secondary" style={{ backgroundColor: exp.category_color ? `${exp.category_color}20` : undefined, color: exp.category_color || undefined }}>
                        {exp.category_name_ar}
                      </Badge>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-3 text-muted-foreground">{exp.expense_date ? formatDate(exp.expense_date) : '—'}</td>
                  <td className="p-3 text-muted-foreground">{exp.vendor || '—'}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Link href={`/dashboard/finance/expenses/${exp.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-3.5 w-3.5" /></Button>
                      </Link>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => setDeleteId(exp.id)}>
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
