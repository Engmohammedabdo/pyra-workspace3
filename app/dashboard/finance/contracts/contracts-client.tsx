'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ArrowRight, FileSignature, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils/format';
import { DataTable, type ColumnDef, type SortConfig } from '@/components/ui/data-table';

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
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

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

  /* ── sort handler ── */
  const handleSortChange = useCallback((key: string) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return prev.direction === 'asc' ? { key, direction: 'desc' } : null;
      }
      return { key, direction: 'asc' };
    });
  }, []);

  /* ── sorted contracts ── */
  const sortedContracts = useMemo(() => {
    if (!sortConfig) return contracts;
    return [...contracts].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      switch (sortConfig.key) {
        case 'title': aVal = a.title || ''; bVal = b.title || ''; break;
        case 'client': aVal = a.client_company || a.client_name || ''; bVal = b.client_company || b.client_name || ''; break;
        case 'total_value': aVal = a.total_value; bVal = b.total_value; break;
        case 'collection': aVal = a.total_value > 0 ? a.amount_collected / a.total_value : 0; bVal = b.total_value > 0 ? b.amount_collected / b.total_value : 0; break;
        default: return 0;
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortConfig.direction === 'asc'
        ? String(aVal).localeCompare(String(bVal), 'ar')
        : String(bVal).localeCompare(String(aVal), 'ar');
    });
  }, [contracts, sortConfig]);

  /* ── column definitions ── */
  const columns: ColumnDef<Contract>[] = useMemo(() => [
    {
      key: 'title',
      header: 'العنوان',
      sortable: true,
      render: (c) => <span className="font-medium">{c.title || '—'}</span>,
    },
    {
      key: 'client',
      header: 'العميل',
      sortable: true,
      className: 'text-muted-foreground',
      render: (c) => c.client_company || c.client_name || '—',
    },
    {
      key: 'type',
      header: 'النوع',
      className: 'text-muted-foreground',
      render: (c) => c.contract_type ? TYPE_MAP[c.contract_type] || c.contract_type : '—',
    },
    {
      key: 'total_value',
      header: 'القيمة',
      sortable: true,
      render: (c) => <span className="font-mono">{formatCurrency(c.total_value, c.currency)}</span>,
    },
    {
      key: 'collection',
      header: 'التحصيل',
      sortable: true,
      render: (c) => {
        const progress = c.total_value > 0 ? Math.round((c.amount_collected / c.total_value) * 100) : 0;
        return (
          <div className="space-y-1 min-w-[120px]">
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
        );
      },
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (c) => (
        <Badge variant={STATUS_MAP[c.status]?.variant || 'outline'}>
          {STATUS_MAP[c.status]?.label || c.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      render: (c) => (
        <div className="flex items-center gap-1" data-no-row-click>
          <Link href={`/dashboard/finance/contracts/${c.id}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-3.5 w-3.5" /></Button>
          </Link>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => setDeleteId(c.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ], []);

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
      <DataTable
        columns={columns}
        data={sortedContracts}
        loading={loading}
        emptyState={{
          icon: FileSignature,
          title: 'لا توجد عقود',
          description: 'أنشئ عقد جديد للبدء',
        }}
        selectable
        getRowId={(c) => c.id}
        sortConfig={sortConfig}
        onSortChange={handleSortChange}
        bulkActions={[
          {
            label: 'حذف المحدد',
            icon: Trash2,
            variant: 'destructive',
            onClick: (ids) => {
              if (ids.length > 0) setDeleteId(ids[0]);
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
