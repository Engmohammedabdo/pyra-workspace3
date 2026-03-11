'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FileSignature } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { StaggerContainer, StaggerItem } from '@/components/ui/stagger-list';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';

interface PortalContract {
  id: string;
  title: string | null;
  project_name: string | null;
  contract_type: string | null;
  total_value: number;
  currency: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  retainer_amount: number;
  retainer_cycle: string | null;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
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

export default function PortalContractsPage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<PortalContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetch('/api/portal/contracts')
      .then(r => r.json())
      .then(j => { if (j.data) setContracts(j.data); })
      .catch(() => toast.error('فشل في تحميل العقود'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = statusFilter === 'all'
    ? contracts
    : contracts.filter(c => c.status === statusFilter);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileSignature className="h-6 w-6" />
          العقود
        </h1>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="active">نشط</SelectItem>
            <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
            <SelectItem value="completed">مكتمل</SelectItem>
            <SelectItem value="cancelled">ملغي</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="لا توجد عقود"
          description="لم يتم إضافة أي عقود بعد"
        />
      ) : (
        <StaggerContainer>
          <div className="space-y-3">
            {filtered.map(c => {
              const statusInfo = STATUS_MAP[c.status] || { label: c.status, variant: 'outline' as const };
              return (
                <StaggerItem key={c.id}>
                  <div
                    className="rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/portal/contracts/${c.id}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{c.title || 'بدون عنوان'}</span>
                          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                          {c.contract_type && (
                            <Badge variant="outline" className="text-xs">
                              {TYPE_MAP[c.contract_type] || c.contract_type}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {c.project_name && <span>{c.project_name}</span>}
                          {c.start_date && <span>{c.start_date}</span>}
                          {c.end_date && <span>→ {c.end_date}</span>}
                        </div>
                      </div>
                      <div className="text-end shrink-0">
                        <p className="font-mono font-bold">
                          {formatCurrency(c.total_value, c.currency)}
                        </p>
                        {c.contract_type === 'retainer' && c.retainer_amount > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(c.retainer_amount, c.currency)} / {c.retainer_cycle === 'quarterly' ? 'ربع سنوي' : 'شهري'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </StaggerItem>
              );
            })}
          </div>
        </StaggerContainer>
      )}
    </div>
  );
}
