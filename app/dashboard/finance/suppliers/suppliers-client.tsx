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
import { ArrowRight, Truck, Plus, Mail, Phone } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { toast } from 'sonner';

interface Supplier {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  currency: string;
  payment_terms_days: number;
}

export default function SuppliersClient() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (activeFilter) params.set('active', activeFilter);

      const res = await fetch(`/api/dashboard/suppliers?${params}`);
      const json = await res.json();
      if (json.data) setSuppliers(json.data);
      if (json.meta) setTotal(json.meta.total || 0);
    } catch {
      toast.error('فشل في تحميل الموردين');
    } finally {
      setLoading(false);
    }
  }, [page, search, activeFilter]);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance">
            <Button variant="ghost" size="icon" aria-label="رجوع"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6" /> الموردين
          </h1>
        </div>
        <Link href="/dashboard/finance/suppliers/new">
          <Button><Plus className="h-4 w-4 me-2" /> مورد جديد</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="بحث بالاسم أو الشركة..."
          className="flex-1 min-w-[200px]"
        />
        <Select value={activeFilter} onValueChange={v => { setActiveFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="true">نشط</SelectItem>
            <SelectItem value="false">غير نشط</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : suppliers.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="لا يوجد موردين"
          description="أضف مورداً جديداً لربطه بالمصروفات وأوامر الشراء"
          actionLabel="مورد جديد"
          onAction={() => router.push('/dashboard/finance/suppliers/new')}
        />
      ) : (
        <div className="space-y-3">
          {suppliers.map(sup => (
            <Link key={sup.id} href={`/dashboard/finance/suppliers/${sup.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
                      <Truck className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{sup.name}</span>
                        <Badge className={sup.is_active
                          ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                        }>
                          {sup.is_active ? 'نشط' : 'غير نشط'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {sup.company && <span>{sup.company}</span>}
                        {sup.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{sup.email}</span>}
                        {sup.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{sup.phone}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-end text-xs text-muted-foreground">
                    <p>شروط الدفع: {sup.payment_terms_days} يوم</p>
                    <p>{sup.currency}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
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
