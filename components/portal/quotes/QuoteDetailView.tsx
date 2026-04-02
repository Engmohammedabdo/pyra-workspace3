'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight, Download, PenTool, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatDate } from '@/lib/utils/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import dynamic from 'next/dynamic';

const SignaturePad = dynamic(() => import('@/components/quotes/SignaturePad'), { ssr: false });

const fmtNum = (n: number) =>
  new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

interface QuoteDetailProps {
  detail: any;
  onBack: () => void;
  onDownload: () => void;
  onSign: (data: string, name: string) => Promise<void>;
  downloading: boolean;
  signing: boolean;
}

export function QuoteDetailView({ detail, onBack, onDownload, onSign, downloading, signing }: QuoteDetailProps) {
  const [showSign, setShowSign] = useState(false);
  const [signName, setSignName] = useState('');
  const [signData, setSignData] = useState('');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} className="gap-1">
          <ChevronRight className="h-4 w-4" /> العودة للقائمة
        </Button>
        <Button variant="outline" size="sm" onClick={onDownload} disabled={downloading} className="gap-1.5">
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          تحميل PDF
        </Button>
      </div>

      <Card className="max-w-[800px] mx-auto">
        <CardHeader className="text-center border-b">
          <CardTitle className="text-xl text-portal">{detail.company_name || 'PYRAMEDIA X'}</CardTitle>
          <p className="text-xs text-muted-foreground">FOR AI SOLUTIONS</p>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-portal text-white">
                  <th className="p-2 text-start w-10">#</th>
                  <th className="p-2 text-start">الوصف</th>
                  <th className="p-2 text-start w-16">الكمية</th>
                  <th className="p-2 text-start w-24">السعر</th>
                  <th className="p-2 text-start w-24">المجموع</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((item: any, idx: number) => (
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
          <div className="flex justify-end">
            <div className="w-64 space-y-2 border rounded-lg p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">المجموع الفرعي</span>
                <span className="font-mono" dir="ltr">{fmtNum(detail.subtotal)} {detail.currency}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">ضريبة ({detail.tax_rate}%)</span>
                <span className="font-mono" dir="ltr">{fmtNum(detail.tax_amount)} {detail.currency}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold">
                <span>الإجمالي</span>
                <span className="font-mono text-portal" dir="ltr">{fmtNum(detail.total)} {detail.currency}</span>
              </div>
            </div>
          </div>
          {detail.notes && (
            <div className="bg-muted/30 rounded-lg p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-sm">{detail.notes}</p>
            </div>
          )}
          {detail.signature_data ? (
            <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/30 dark:border-green-800/30">
              <p className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2">تم التوقيع</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={detail.signature_data} alt="Signature" className="border rounded bg-white dark:bg-gray-900 max-w-[300px]" />
              <p className="text-xs text-muted-foreground mt-2">
                بواسطة: {detail.signed_by} — {detail.signed_at ? formatDate(detail.signed_at, 'dd-MM-yyyy') : ''}
              </p>
            </div>
          ) : (detail.status !== 'expired' && detail.status !== 'cancelled') && (
            <div className="flex justify-center">
              <Button onClick={() => setShowSign(true)} className="bg-portal hover:bg-portal-secondary">
                <PenTool className="h-4 w-4 me-2" /> توقيع العرض
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSign(false)}>إلغاء</Button>
            <Button onClick={() => onSign(signData, signName).then(() => setShowSign(false))} disabled={signing || !signData || !signName.trim()} className="bg-portal hover:bg-portal-secondary">
              {signing ? 'جارٍ التوقيع...' : 'تأكيد التوقيع'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
