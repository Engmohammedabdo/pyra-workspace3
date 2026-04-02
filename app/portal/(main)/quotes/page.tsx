'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { FileText, Eye } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { StaggerContainer, StaggerItem } from '@/components/ui/stagger-list';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import { QuoteDetailView } from './QuoteDetailView';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  sent: { label: 'جديد', variant: 'default' },
  viewed: { label: 'تم العرض', variant: 'outline' },
  signed: { label: 'موقّع', variant: 'default' },
  expired: { label: 'منتهي', variant: 'destructive' },
  cancelled: { label: 'ملغي', variant: 'destructive' },
};

const generateQuotePDFAsync = () => import('@/lib/pdf/quote-pdf').then(m => m.generateQuotePDF);

export default function PortalQuotesPage() {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [detail, setDetail] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [signing, setSigning] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/portal/quotes?${params}`);
      const json = await res.json();
      if (json.data) setQuotes(json.data);
    } catch { toast.error('فشل في تحميل عروض الأسعار'); } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/portal/quotes/${id}`);
      const json = await res.json();
      if (json.data) setDetail(json.data);
    } catch { toast.error('فشل في تحميل تفاصيل العرض'); } finally { setLoadingDetail(false); }
  };

  const handleDownloadPdf = async () => {
    if (!detail) return;
    setDownloadingPdf(true);
    try {
      const generateQuotePDF = await generateQuotePDFAsync();
      await generateQuotePDF({ ...detail, items: detail.items.map((i: any) => ({ ...i })) });
      toast.success('تم تحميل الـ PDF بنجاح');
    } catch { toast.error('فشل في إنشاء ملف PDF'); } finally { setDownloadingPdf(false); }
  };

  const handleSign = async (signData: string, signName: string) => {
    setSigning(true);
    try {
      const res = await fetch(`/api/portal/quotes/${detail.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature_data: signData, signed_by: signName.trim() }),
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setDetail(prev => prev ? { ...prev, status: 'signed', signed_by: signName.trim(), signed_at: new Date().toISOString(), signature_data: signData } : null);
      fetchQuotes();
    } catch { toast.error('حدث خطأ أثناء التوقيع'); } finally { setSigning(false); }
  };

  if (detail) {
    return (
      <QuoteDetailView
        detail={detail}
        onBack={() => setDetail(null)}
        onDownload={handleDownloadPdf}
        onSign={handleSign}
        downloading={downloadingPdf}
        signing={signing}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">عروض الأسعار</h1>
        <p className="text-muted-foreground text-sm mt-1">استعرض عروض الأسعار المرسلة إليك</p>
      </div>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">جميع الحالات</SelectItem>
          <SelectItem value="sent">جديد</SelectItem>
          <SelectItem value="viewed">تم العرض</SelectItem>
          <SelectItem value="signed">موقّع</SelectItem>
          <SelectItem value="expired">منتهي</SelectItem>
        </SelectContent>
      </Select>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : quotes.length === 0 ? (
        <EmptyState icon={FileText} title="لا توجد عروض أسعار" description="لم يتم إرسال عروض أسعار إليك بعد" />
      ) : (
        <StaggerContainer className="space-y-3">
          {quotes.map(q => {
            const s = STATUS_MAP[q.status] || { label: q.status, variant: 'secondary' as const };
            return (
              <StaggerItem key={q.id}>
                <Card className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-portal/30 hover:-translate-y-0.5" onClick={() => openDetail(q.id)}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-medium">{q.quote_number}</span>
                        <Badge variant={s.variant} className="text-[10px]">{s.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{q.project_name || 'بدون مشروع'}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(q.estimate_date, 'dd-MM-yyyy')}</p>
                    </div>
                    <div className="text-end">
                      <p className="font-mono font-bold text-portal">{formatCurrency(q.total, q.currency)}</p>
                      <Eye className="h-4 w-4 text-muted-foreground mt-1 ms-auto" />
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
