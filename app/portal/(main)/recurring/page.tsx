'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StaggerContainer, StaggerItem } from '@/components/ui/stagger-list';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { toast } from 'sonner';
import {
  RefreshCw,
  CalendarClock,
  FileSignature,
  FolderKanban,
  Receipt,
} from 'lucide-react';

interface RecurringInvoice {
  id: string;
  status: string;
  billing_cycle: string;
  next_generation_date: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_id: string | null;
  total: number;
  currency: string;
  created_at: string;
  contract_title: string | null;
  project_name: string | null;
  generated_count: number;
}

const CYCLE_MAP: Record<string, string> = {
  monthly: 'شهري',
  quarterly: 'ربع سنوي',
  yearly: 'سنوي',
  weekly: 'أسبوعي',
};

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'نشط', variant: 'default' },
  paused: { label: 'متوقف', variant: 'secondary' },
  cancelled: { label: 'ملغي', variant: 'destructive' },
  completed: { label: 'مكتمل', variant: 'outline' },
};

export default function PortalRecurringInvoicesPage() {
  const router = useRouter();
  const [items, setItems] = useState<RecurringInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/portal/recurring-invoices');
      const json = await res.json();
      if (json.data) setItems(json.data);
    } catch {
      toast.error('فشل في تحميل الفواتير المتكررة');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">الفواتير المتكررة</h1>
        <p className="text-muted-foreground text-sm mt-1">
          جدول الفواتير المتكررة الخاصة بحسابك
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={RefreshCw}
          title="لا توجد فواتير متكررة"
          description="لم يتم إعداد أي جدول فواتير متكررة لحسابك"
        />
      ) : (
        <StaggerContainer className="space-y-3">
          {items.map((ri) => {
            const statusInfo = STATUS_MAP[ri.status] || { label: ri.status, variant: 'outline' as const };
            const cycleLabel = CYCLE_MAP[ri.billing_cycle] || ri.billing_cycle;

            return (
              <StaggerItem key={ri.id}>
                <Card className="hover:shadow-md hover:border-portal/30 transition-all duration-200">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      {/* Left */}
                      <div className="flex items-start gap-4 min-w-0 flex-1">
                        <div className="w-12 h-12 rounded-xl bg-portal/10 flex items-center justify-center shrink-0">
                          <RefreshCw className="h-5 w-5 text-portal" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                            <Badge variant="outline" className="text-xs">{cycleLabel}</Badge>
                          </div>
                          {ri.contract_title && (
                            <p className="text-sm font-medium mt-2 flex items-center gap-1.5">
                              <FileSignature className="h-3.5 w-3.5 text-muted-foreground" />
                              {ri.contract_title}
                            </p>
                          )}
                          {ri.project_name && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                              <FolderKanban className="h-3 w-3" />
                              {ri.project_name}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                            {ri.next_generation_date && ri.status === 'active' && (
                              <span className="flex items-center gap-1">
                                <CalendarClock className="h-3 w-3" />
                                الفاتورة القادمة: {formatDate(ri.next_generation_date, 'dd/MM/yyyy')}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Receipt className="h-3 w-3" />
                              {ri.generated_count} فاتورة صادرة
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right — Amount */}
                      <div className="text-end shrink-0">
                        <p className="text-lg font-bold font-mono text-portal tabular-nums">
                          {formatCurrency(ri.total, ri.currency)}
                        </p>
                        <p className="text-xs text-muted-foreground">لكل {cycleLabel === 'شهري' ? 'شهر' : cycleLabel === 'ربع سنوي' ? 'ربع سنة' : cycleLabel === 'سنوي' ? 'سنة' : 'فترة'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      )}
    </div>
  );
}
