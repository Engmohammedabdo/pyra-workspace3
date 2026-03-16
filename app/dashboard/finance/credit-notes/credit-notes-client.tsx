'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowRight, FileCheck, Plus, Trash2 } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils/format';

interface CreditNote {
  id: string;
  credit_note_number: string;
  invoice_id: string | null;
  client_name: string | null;
  client_company: string | null;
  reason: string;
  status: string;
  issue_date: string;
  total: number;
  applied_amount: number;
  currency: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft:     { label: 'مسودة',  color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  issued:    { label: 'صادر',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  applied:   { label: 'مطبق',   color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  cancelled: { label: 'ملغي',   color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
};

export default function CreditNotesClient() {
  const router = useRouter();
  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/dashboard/credit-notes?${params}`);
      const json = await res.json();
      if (json.data) setNotes(json.data);
      if (json.meta) setTotal(json.meta.total || 0);
    } catch {
      toast.error('فشل في تحميل الإشعارات الدائنة');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance">
            <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileCheck className="h-6 w-6" /> إشعارات دائنة
          </h1>
        </div>
        <Link href="/dashboard/finance/credit-notes/new">
          <Button><Plus className="h-4 w-4 me-2" /> إشعار دائن جديد</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="بحث بالرقم أو العميل..."
          className="flex-1 min-w-[200px]"
        />
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="draft">مسودة</SelectItem>
            <SelectItem value="issued">صادر</SelectItem>
            <SelectItem value="applied">مطبق</SelectItem>
            <SelectItem value="cancelled">ملغي</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : notes.length === 0 ? (
        <EmptyState
          icon={FileCheck}
          title="لا توجد إشعارات دائنة"
          description="أنشئ إشعار دائن جديد لإدارة المرتجعات والتعديلات"
          actionLabel="إشعار دائن جديد"
          onAction={() => router.push('/dashboard/finance/credit-notes/new')}
        />
      ) : (
        <div className="space-y-3">
          {notes.map(cn => {
            const st = STATUS_MAP[cn.status] || STATUS_MAP.draft;
            return (
              <Link key={cn.id} href={`/dashboard/finance/credit-notes/${cn.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                        <FileCheck className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm" dir="ltr">{cn.credit_note_number}</span>
                          <Badge className={st.color}>{st.label}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {cn.client_name || 'بدون عميل'} — {cn.reason?.slice(0, 50)}
                        </p>
                      </div>
                    </div>
                    <div className="text-end">
                      <p className="font-bold font-mono">{formatCurrency(cn.total, cn.currency)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(cn.issue_date)}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>السابق</Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>التالي</Button>
        </div>
      )}
    </div>
  );
}
