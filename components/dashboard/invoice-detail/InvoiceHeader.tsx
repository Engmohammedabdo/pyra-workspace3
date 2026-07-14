'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InvoiceStamp } from '@/components/ui/invoice-stamp';
import { formatDate } from '@/lib/utils/format';
import { ArrowRight, Pencil, Send, Download, Trash2, CreditCard, Link2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import type { Locale } from '@/lib/i18n/config';

interface InvoiceHeaderProps {
  invoiceNumber: string;
  status: { label: string; color: string };
  /** Raw invoice status key — drives the status stamp. */
  statusKey?: string;
  milestoneType?: string | null;
  issueDate: string;
  dueDate: string;
  isDraft: boolean;
  canEdit: boolean;
  canRecordPayment: boolean;
  editing: boolean;
  sending: boolean;
  generatingLink: boolean;
  onEdit: () => void;
  onSend: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onRecordPayment: () => void;
  onGeneratePaymentLink: () => void;
}

export function InvoiceHeader({
  invoiceNumber,
  status,
  statusKey,
  milestoneType,
  issueDate,
  dueDate,
  isDraft,
  canEdit,
  canRecordPayment,
  editing,
  sending,
  generatingLink,
  onEdit,
  onSend,
  onDownload,
  onDelete,
  onRecordPayment,
  onGeneratePaymentLink,
}: InvoiceHeaderProps) {
  const t = useTranslations('finance.invoices.detail.header');
  const milestoneT = useTranslations('finance.invoices.milestoneTypes');
  const locale = useLocale() as Locale;

  const milestoneLabel = milestoneType
    ? (milestoneT.has(milestoneType as Parameters<typeof milestoneT>[0])
        ? milestoneT(milestoneType as Parameters<typeof milestoneT>[0])
        : milestoneType)
    : null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/invoices">
          <Button variant="ghost" size="icon" aria-label={t('back')}>
            <ArrowRight className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono">{invoiceNumber}</h1>
            {statusKey ? (
              <InvoiceStamp status={statusKey} size="sm" title={status.label} />
            ) : (
              <Badge variant="outline" className={status.color}>{status.label}</Badge>
            )}
            {milestoneLabel && (
              <Badge variant="secondary">{milestoneLabel}</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {t('issueDueDates', { issueDate: formatDate(issueDate, undefined, locale), dueDate: formatDate(dueDate, undefined, locale) })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {canEdit && !editing && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4 me-1" /> {t('edit')}
          </Button>
        )}
        {isDraft && (
          <Button variant="outline" size="sm" className="text-blue-600 dark:text-blue-400" onClick={onSend} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 me-1 animate-spin" /> : <Send className="h-4 w-4 me-1" />}
            {t('send')}
          </Button>
        )}
        {canRecordPayment && (
          <>
            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={onRecordPayment}>
              <CreditCard className="h-4 w-4 me-1" /> {t('recordPayment')}
            </Button>
            <Button variant="outline" size="sm" className="text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/40" onClick={onGeneratePaymentLink} disabled={generatingLink}>
              {generatingLink ? <Loader2 className="h-4 w-4 me-1 animate-spin" /> : <Link2 className="h-4 w-4 me-1" />}
              {t('stripePaymentLink')}
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" onClick={onDownload}>
          <Download className="h-4 w-4 me-1" /> {t('downloadPdf')}
        </Button>
        {isDraft && (
          <Button variant="outline" size="sm" className="text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4 me-1" /> {t('delete')}
          </Button>
        )}
      </div>
    </div>
  );
}
