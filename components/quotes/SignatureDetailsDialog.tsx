'use client';

import { useTranslations, useLocale } from 'next-intl';
import { toast } from 'sonner';
import { ShieldCheck, Loader2, ExternalLink } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuote } from '@/hooks/useQuotes';
import { useQuoteOfflineEvidence } from '@/hooks/useOfflineSignature';
import { MIME_TO_EXT } from '@/lib/quotes/evidence-upload';
import { formatDate, formatFileSize } from '@/lib/utils/format';
import type { Locale } from '@/lib/i18n/config';

interface SignatureDetailsDialogProps {
  /** null closes the dialog — mirrors PublicLinkDialog's `quoteId` pattern. */
  quoteId: string | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Read-only "how was this quote signed" view (evidence-viewer, closes the
 * gap that shipped alongside public quote signing: the DB tracked
 * signature_source / signed_offline_by / evidence file, but nothing in the
 * UI ever read any of it).
 *
 * `signature_source` is null for quotes signed before this feature existed
 * (e.g. production QT-0003) — that renders an honest "unknown" label rather
 * than guessing or leaving a blank. The offline-attestation block (attester
 * + evidence button) only renders when signature_source === 'offline'; the
 * signature image renders whenever signature_data is present, regardless of
 * source, since that IS the evidence for the portal/public-link paths.
 */
export function SignatureDetailsDialog({ quoteId, onOpenChange }: SignatureDetailsDialogProps) {
  const t = useTranslations('finance.quotes.signatureDetails');
  const locale = useLocale() as Locale;
  const open = !!quoteId;

  const quoteQuery = useQuote(quoteId ?? undefined);
  const evidenceQuery = useQuoteOfflineEvidence(quoteId ?? undefined);
  const quote = quoteQuery.data;

  const handleViewEvidence = async () => {
    const result = await evidenceQuery.refetch();
    if (result.error || !result.data?.signed_url) {
      toast.error(t('offlineSection.evidenceLoadError'));
      return;
    }
    window.open(result.data.signed_url, '_blank', 'noopener,noreferrer');
  };

  const methodKey = quote?.signature_source
    ? (`methods.${quote.signature_source}` as Parameters<typeof t>[0])
    : null;
  const methodLabel = methodKey && t.has(methodKey) ? t(methodKey) : t('methods.unknown');
  const evidenceExt = quote?.signed_evidence_mime ? MIME_TO_EXT[quote.signed_evidence_mime] : undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-orange-600 dark:text-orange-400" aria-hidden="true" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {quoteQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : quoteQuery.isError ? (
          <p className="text-sm text-destructive">{t('loadError')}</p>
        ) : !quote?.signed_at ? (
          <p className="text-sm text-muted-foreground">{t('notSignedYet')}</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2 rounded-lg border p-3 text-sm dark:border-gray-800">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t('methodLabel')}</span>
                <span className="font-medium">{methodLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t('signedByLabel')}</span>
                <span className="font-medium">{quote.signed_by || '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t('signedAtLabel')}</span>
                <span>{formatDate(quote.signed_at, 'dd-MM-yyyy HH:mm', locale)}</span>
              </div>
            </div>

            {quote.signature_data && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">{t('signatureImageLabel')}</p>
                <img
                  src={quote.signature_data}
                  alt={t('signatureImageLabel')}
                  className="max-w-[300px] rounded border bg-white dark:bg-gray-900"
                />
              </div>
            )}

            {quote.signature_source === 'offline' && (
              <div className="space-y-2 rounded-lg border p-3 text-sm dark:border-gray-800">
                <p className="font-medium">{t('offlineSection.title')}</p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t('offlineSection.attestedByLabel')}</span>
                  <span className="font-medium">{quote.signed_offline_by || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t('offlineSection.attestedAtLabel')}</span>
                  <span>{formatDate(quote.signed_offline_at, 'dd-MM-yyyy HH:mm', locale)}</span>
                </div>

                {quote.signed_evidence_mime ? (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-xs text-muted-foreground">
                      {t('offlineSection.evidenceFileInfo', {
                        type: (evidenceExt ?? quote.signed_evidence_mime).toUpperCase(),
                        size: quote.signed_evidence_size ? formatFileSize(quote.signed_evidence_size) : '—',
                      })}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleViewEvidence}
                      disabled={evidenceQuery.isFetching}
                    >
                      {evidenceQuery.isFetching ? (
                        <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <ExternalLink className="me-2 h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {t('offlineSection.viewEvidenceButton')}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('offlineSection.evidenceNotAvailable')}</p>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('closeButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
