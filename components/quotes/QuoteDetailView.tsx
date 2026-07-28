'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ChevronRight, Download, PenTool, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatDate } from '@/lib/utils/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import dynamic from 'next/dynamic';
import { QUOTE_STATUS } from '@/lib/constants/statuses';
import type { Locale } from '@/lib/i18n/config';

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
  /** Hidden on the public /d/<token> page — there is no list to go back to. */
  showBack?: boolean;
  /**
   * Whether the sign button may render at all. Distinct from the quote's own
   * status check: the public page also blocks signing when the link's
   * content_hash no longer matches (the quote changed after the link was
   * sent) or a block reason came back from the server — reasons the
   * component itself has no way to know. Defaults to true so portal
   * behaviour is unchanged.
   */
  canSign?: boolean;
}

export function QuoteDetailView({
  detail,
  onBack,
  onDownload,
  onSign,
  downloading,
  signing,
  showBack = true,
  canSign = true,
}: QuoteDetailProps) {
  const t = useTranslations('finance.quotes.detail');
  const locale = useLocale() as Locale;
  const [showSign, setShowSign] = useState(false);
  const [signName, setSignName] = useState('');
  const [signData, setSignData] = useState('');

  // The public payload (lib/quotes/public-payload.ts) never includes
  // signature_data — only the portal's full fetch does. So "already signed"
  // must be derived from status, not from the presence of the image, or a
  // signed public quote would show a stale "sign again" button.
  const isSigned = detail.status === QUOTE_STATUS.SIGNED || detail.status === QUOTE_STATUS.INVOICED;
  const isDead = detail.status === QUOTE_STATUS.EXPIRED || detail.status === QUOTE_STATUS.CANCELLED;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {showBack && (
          <Button variant="ghost" onClick={onBack} className="gap-1">
            <ChevronRight className="h-4 w-4" /> {t('back')}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onDownload} disabled={downloading} className="gap-1.5">
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {t('downloadPdf')}
        </Button>
      </div>

      <Card className="max-w-[800px] mx-auto">
        <CardHeader className="text-center border-b">
          <CardTitle className="text-xl text-portal">{detail.company_name || t('companyFallback')}</CardTitle>
          <p className="text-xs text-muted-foreground">{t('companyTagline')}</p>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground block">{t('fields.quoteNumber')}</span>
              <span className="font-mono">{detail.quote_number}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">{t('fields.date')}</span>
              <span>{formatDate(detail.estimate_date, undefined, locale)}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">{t('fields.validUntil')}</span>
              <span>{detail.expiry_date ? formatDate(detail.expiry_date, undefined, locale) : '—'}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">{t('fields.project')}</span>
              <span>{detail.project_name || '—'}</span>
            </div>
          </div>
          <Separator />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-portal text-white">
                  <th className="p-2 text-start w-10">#</th>
                  <th className="p-2 text-start">{t('table.description')}</th>
                  <th className="p-2 text-start w-16">{t('table.quantity')}</th>
                  <th className="p-2 text-start w-24">{t('table.rate')}</th>
                  <th className="p-2 text-start w-24">{t('table.total')}</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((item: any, idx: number) => (
                  <tr key={item.id ?? idx} className="border-b">
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
                <span className="text-muted-foreground">{t('totals.subtotal')}</span>
                <span className="font-mono" dir="ltr">{fmtNum(detail.subtotal)} {detail.currency}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('totals.tax', { rate: detail.tax_rate })}</span>
                <span className="font-mono" dir="ltr">{fmtNum(detail.tax_amount)} {detail.currency}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold">
                <span>{t('totals.total')}</span>
                <span className="font-mono text-portal" dir="ltr">{fmtNum(detail.total)} {detail.currency}</span>
              </div>
            </div>
          </div>
          {detail.notes && (
            <div className="bg-muted/30 rounded-lg p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-1">{t('notes')}</p>
              <p className="text-sm">{detail.notes}</p>
            </div>
          )}
          {isSigned ? (
            <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/30 dark:border-green-800/30">
              <p className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2">{t('signedBadge')}</p>
              {detail.signature_data && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={detail.signature_data} alt="Signature" className="border rounded bg-white dark:bg-gray-900 max-w-[300px]" />
              )}
              <p className="text-xs text-muted-foreground mt-2">
                {t('signedBy', {
                  signedBy: detail.signed_by ?? '',
                  signedAt: detail.signed_at ? formatDate(detail.signed_at, undefined, locale) : '',
                })}
              </p>
            </div>
          ) : (canSign && !isDead) && (
            <div className="flex justify-center">
              <Button onClick={() => setShowSign(true)} className="bg-portal hover:bg-portal-secondary">
                <PenTool className="h-4 w-4 me-2" /> {t('signButton')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showSign} onOpenChange={setShowSign}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>{t('signDialog.title')}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('signDialog.nameLabel')}</Label>
              {/* 200 chars matches MAX_SIGNED_BY_LENGTH in
                  app/api/public/quotes/[token]/sign/route.ts — signed_by is
                  unbounded `text` and append-only once set (migration 055),
                  so the UI must agree with the server's cap up front
                  (Task 6 Finding 1). */}
              <Input value={signName} onChange={e => setSignName(e.target.value)} placeholder={t('signDialog.namePlaceholder')} maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label>{t('signDialog.signatureLabel')}</Label>
              <SignaturePad onSignatureChange={setSignData} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSign(false)}>{t('signDialog.cancel')}</Button>
            <Button onClick={() => onSign(signData, signName).then(() => setShowSign(false))} disabled={signing || !signData || !signName.trim()} className="bg-portal hover:bg-portal-secondary">
              {signing ? t('signDialog.signing') : t('signDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
