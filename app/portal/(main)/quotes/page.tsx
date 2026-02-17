'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FileText, Eye, PenTool, ChevronRight } from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';

const SignaturePad = dynamic(() => import('@/components/quotes/SignaturePad'), { ssr: false });

interface PortalQuote {
  id: string;
  quote_number: string;
  project_name: string | null;
  status: string;
  estimate_date: string;
  expiry_date: string | null;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  client_name: string | null;
  client_company: string | null;
  signed_by: string | null;
  signed_at: string | null;
  sent_at: string | null;
  created_at: string;
}

interface QuoteDetail extends PortalQuote {
  terms_conditions: { text: string }[];
  bank_details: { bank: string; account_name: string; account_no: string; iban: string };
  company_name: string | null;
  signature_data: string | null;
  items: {
    id: string;
    sort_order: number;
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }[];
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  sent: { label: 'جديد', variant: 'default' },
  viewed: { label: 'تم العرض', variant: 'outline' },
  signed: { label: 'موقّع', variant: 'default' },
  expired: { label: 'منتهي', variant: 'destructive' },
  cancelled: { label: 'ملغي', variant: 'destructive' },
};

const fmtNum = (n: number) =>
  new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export default function PortalQuotesPage() {
  const [quotes, setQuotes] = useState<PortalQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [detail, setDetail] = useState<QuoteDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showSign, setShowSign] = useState(false);
  const [signName, setSignName] = useState('');
  const [signData, setSignData] = useState('');
  const [signing, setSigning] = useState(false);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/portal/quotes?${params}`);
      const json = await res.json();
      if (json.data) setQuotes(json.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/portal/quotes/${id}`);
      const json = await res.json();
      if (json.data) setDetail(json.data);
    } catch (err) { console.error(err); } finally { setLoadingDetail(false); }
  };

  const handleSign = async () => {
    if (!detail || !signData || !signName.trim()) {
      toast.error('يرجى كتابة اسمك والتوقيع');
      return;
    }
    setSigning(true);
    try {
      const res = await fetch(`/api/portal/quotes/${detail.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature_data: signData, signed_by: signName.trim() }),
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowSign(false);
      setDetail(prev => prev ? { ...prev, status: 'signed', signed_by: signName.trim(), signed_at: new Date().toISOString(), signature_data: signData } : null);
      fetchQuotes();
    } catch (err) { console.error(err); } finally { setSigning(false); }
  };

  // Detail view
  if (detail) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setDetail(null)} className="gap-1">
          <ChevronRight className="h-4 w-4" /> العودة للقائمة
        </Button>

        <Card className="max-w-[800px] mx-auto">
          <CardHeader className="text-center border-b">
            <CardTitle className="text-xl text-orange-600">{detail.company_name || 'PYRAMEDIA X'}</CardTitle>
            <p className="text-xs text-muted-foreground">FOR AI SOLUTIONS</p>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* Quote info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-xs text-muted-foreground block">رقم العرض</span>
                <span className="font-mono">{detail.quote_number}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">التاريخ</span>
                <span>{formatDate(detail.estimate_date, 'dd-MM-yyyy')}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">صالح حتى</span>
                <span>{detail.expiry_date ? formatDate(detail.expiry_date, 'dd-MM-yyyy') : '—'}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">المشروع</span>
                <span>{detail.project_name || '—'}</span>
              </div>
            </div>

            <Separator />

            {/* Items */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-orange-500 text-white">
                    <th className="p-2 text-start w-10">#</th>
                    <th className="p-2 text-start">الوصف</th>
                    <th className="p-2 text-start w-16">الكمية</th>
                    <th className="p-2 text-start w-24">السعر</th>
                    <th className="p-2 text-start w-24">المجموع</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((item, idx) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-2 text-muted-foreground">{idx + 1}</td>
                      <td className="p-2">{item.description}</td>
                      <td className="p-2 font-mono" dir="ltr">{item.quantity}</td>
                      <td className="p-2 font-mono" dir="ltr">{fmtNum(item.rate)}</td>
                      <td className="p-2 font-mono" dir="ltr">{fmtNum(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-2 border rounded-lg p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">المجموع الفرعي</span>
                  <span className="font-mono" dir="ltr">{fmtNum(detail.subtotal)} AED</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">ضريبة ({detail.tax_rate}%)</span>
                  <span className="font-mono" dir="ltr">{fmtNum(detail.tax_amount)} AED</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>الإجمالي</span>
                  <span className="font-mono text-orange-600" dir="ltr">{fmtNum(detail.total)} AED</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {detail.notes && (
              <div className="bg-muted/30 rounded-lg p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-1">ملاحظات</p>
                <p className="text-sm">{detail.notes}</p>
              </div>
            )}

            {/* Bank Details */}
            {detail.bank_details?.bank && (
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-2">البيانات البنكية</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>البنك: {detail.bank_details.bank}</span>
                  <span>اسم الحساب: {detail.bank_details.account_name}</span>
                  <span>رقم الحساب: {detail.bank_details.account_no}</span>
                  <span>IBAN: {detail.bank_details.iban}</span>
                </div>
              </div>
            )}

            {/* Signature */}
            {detail.signature_data ? (
              <div className="border rounded-lg p-4 bg-green-50">
                <p className="text-sm font-semibold text-green-700 mb-2">تم التوقيع</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={detail.signature_data} alt="Signature" className="border rounded bg-white max-w-[300px]" />
                <p className="text-xs text-muted-foreground mt-2">
                  بواسطة: {detail.signed_by} — {detail.signed_at ? formatDate(detail.signed_at, 'dd-MM-yyyy') : ''}
                </p>
              </div>
            ) : (detail.status !== 'expired' && detail.status !== 'cancelled') && (
              <div className="flex justify-center">
                <Button onClick={() => setShowSign(true)} className="bg-orange-500 hover:bg-orange-600">
                  <PenTool className="h-4 w-4 me-2" /> توقيع العرض
                </Button>
              </div>
            )}

            {/* Terms */}
            <div className="text-[10px] text-muted-foreground border-t pt-3">
              <p className="font-semibold mb-1">الشروط والأحكام</p>
              {detail.terms_conditions?.map((t, i) => (
                <p key={i}>{i + 1}. {t.text}</p>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sign Dialog */}
        <Dialog open={showSign} onOpenChange={setShowSign}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader><DialogTitle>التوقيع الإلكتروني</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>اسم الموقع</Label>
                <Input value={signName} onChange={e => setSignName(e.target.value)} placeholder="الاسم الكامل" />
              </div>
              <div className="space-y-2">
                <Label>التوقيع</Label>
                <SignaturePad onSignatureChange={setSignData} />
              </div>
              <p className="text-xs text-muted-foreground">
                بالتوقيع، أوافق على شروط وأحكام هذا العرض
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSign(false)}>إلغاء</Button>
              <Button onClick={handleSign} disabled={signing || !signData || !signName.trim()} className="bg-orange-500 hover:bg-orange-600">
                {signing ? 'جارٍ التوقيع...' : 'تأكيد التوقيع'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">عروض الأسعار</h1>
        <p className="text-muted-foreground text-sm mt-1">استعرض عروض الأسعار المرسلة إليك</p>
      </div>

      <div className="flex items-center gap-3">
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
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : loadingDetail ? (
        <div className="space-y-3"><Skeleton className="h-[400px]" /></div>
      ) : quotes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mb-5">
              <FileText className="h-8 w-8 text-orange-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">لا توجد عروض أسعار</h2>
            <p className="text-muted-foreground text-sm">لم يتم إرسال عروض أسعار إليك بعد</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {quotes.map(q => {
            const s = STATUS_MAP[q.status] || { label: q.status, variant: 'secondary' as const };
            return (
              <Card key={q.id} className="cursor-pointer hover:border-orange-300 transition-colors" onClick={() => openDetail(q.id)}>
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
                    <p className="font-mono font-bold text-orange-600">{formatCurrency(q.total, q.currency)}</p>
                    <Eye className="h-4 w-4 text-muted-foreground mt-1 ms-auto" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
