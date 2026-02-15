'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FileText, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatDate, formatCurrency } from '@/lib/utils/format';

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

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      // Quotes API may not exist yet, so handle gracefully
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await fetch(`/api/shares?${params}`);
      // fallback: try to list from pyra_quotes if API exists
      // For now, we'll show an empty state since quotes CRUD will come in Phase 6
      setQuotes([]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" /> عروض الأسعار</h1>
          <p className="text-muted-foreground">إدارة عروض الأسعار والفواتير</p>
        </div>
        <Button disabled>
          إنشاء عرض سعر (المرحلة 6)
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} className="ps-9" />
        </div>
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
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b">{Array.from({ length: 6 }).map((_, j) => <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>)}</tr>
                )) : quotes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                      <p>لا توجد عروض أسعار</p>
                      <p className="text-xs mt-1">سيتم إضافة نظام عروض الأسعار الكامل في المرحلة 6</p>
                    </td>
                  </tr>
                ) : quotes.map(q => {
                  const s = STATUS_MAP[q.status] || { label: q.status, variant: 'secondary' as const };
                  return (
                    <tr key={q.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono">{q.quote_number}</td>
                      <td className="p-3">{q.client_name || q.client_company || '—'}</td>
                      <td className="p-3 text-muted-foreground">{q.project_name || '—'}</td>
                      <td className="p-3 font-mono">{formatCurrency(q.total, q.currency)}</td>
                      <td className="p-3"><Badge variant={s.variant}>{s.label}</Badge></td>
                      <td className="p-3 text-muted-foreground text-xs">{formatDate(q.estimate_date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
