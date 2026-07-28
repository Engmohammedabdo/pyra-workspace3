'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { toast } from 'sonner';
import { Link2, Copy, Loader2, Eye, Clock, CalendarClock } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/hooks/api-helpers';
import { useQuoteLink, useCreateQuoteLink, useRevokeQuoteLink } from '@/hooks/useDocumentLinks';
import { formatDate } from '@/lib/utils/format';
import type { Locale } from '@/lib/i18n/config';

interface PublicLinkDialogProps {
  /** null closes the dialog — mirrors the delete-quote dialog's `selected` pattern in quotes-client.tsx. */
  quoteId: string | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Mint / inspect / revoke a quote's public signing link (Task 7).
 *
 * The freshly-minted `token`/`url` only ever lives in this component's local
 * state — GET /api/quotes/[id]/link never returns it (S-5, migration 054's
 * table comment), so re-opening this dialog for the same quote later shows
 * the link's metadata but no copyable URL, by design.
 */
export function PublicLinkDialog({ quoteId, onOpenChange }: PublicLinkDialogProps) {
  const t = useTranslations('finance.quotes.publicLink');
  const locale = useLocale() as Locale;
  const open = !!quoteId;

  const linkQuery = useQuoteLink(quoteId ?? undefined);
  const createMutation = useCreateQuoteLink();
  const revokeMutation = useRevokeQuoteLink();

  const [mintedUrl, setMintedUrl] = useState<string | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);

  // Fresh session per quote — a token minted for quote A must never linger
  // and render as if it belonged to quote B when the row dropdown is reused.
  useEffect(() => {
    setMintedUrl(null);
    setShowRevokeConfirm(false);
  }, [quoteId]);

  const handleCreate = async () => {
    if (!quoteId) return;
    try {
      const result = await createMutation.mutateAsync(quoteId);
      if (!result.token) {
        // Lost a concurrent-mint race — the API correctly refused to
        // fabricate a token for a link this request didn't create (S-5).
        // There is nothing to copy; tell the truth instead of a fake success.
        setMintedUrl(null);
        toast.info(t('raceLostToast'));
        return;
      }
      setMintedUrl(result.url);
      toast.success(t('createSuccessToast'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('createErrorToast'));
    }
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('copiedToast'));
    } catch {
      toast.error(t('createErrorToast'));
    }
  };

  const handleRevoke = async () => {
    if (!quoteId) return;
    try {
      await revokeMutation.mutateAsync(quoteId);
      setMintedUrl(null);
      setShowRevokeConfirm(false);
      toast.success(t('revokeSuccessToast'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('revokeErrorToast'));
    }
  };

  const link = linkQuery.data;
  const hasLiveLink = !!link?.exists;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-orange-600 dark:text-orange-400" aria-hidden="true" />
              {t('title')}
            </DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          {linkQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : linkQuery.isError ? (
            <p className="text-sm text-destructive">{t('loadError')}</p>
          ) : (
            <div className="space-y-4">
              {mintedUrl ? (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="quote-link-url">{t('urlLabel')}</label>
                  <div className="flex items-center gap-2">
                    <Input id="quote-link-url" value={mintedUrl} readOnly dir="ltr" className="font-mono text-xs" />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleCopy(mintedUrl)}
                      aria-label={t('copyButton')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {hasLiveLink ? t('existingNoToken') : t('noLinkYet')}
                </p>
              )}

              {hasLiveLink && (
                <div className="space-y-2 rounded-lg border p-3 text-sm dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" /> {t('viewCountLabel')}
                    </span>
                    <span className="font-mono">{link?.view_count ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {t('lastViewedLabel')}
                    </span>
                    <span>
                      {link?.last_viewed_at
                        ? formatDate(link.last_viewed_at, 'dd-MM-yyyy HH:mm', locale)
                        : t('neverViewed')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> {t('expiresAtLabel')}
                    </span>
                    <span>
                      {link?.expires_at
                        ? formatDate(link.expires_at, 'dd-MM-yyyy HH:mm', locale)
                        : t('neverExpires')}
                    </span>
                  </div>
                  <div className="pt-1 text-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setShowRevokeConfirm(true)}
                    >
                      {t('revokeButton')}
                    </Button>
                  </div>
                </div>
              )}

              {hasLiveLink && <p className="text-xs text-muted-foreground">{t('regenerateHint')}</p>}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('closeButton')}
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={createMutation.isPending || linkQuery.isLoading}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              {createMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {hasLiveLink ? t('regenerateButton') : t('generateButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRevokeConfirm} onOpenChange={setShowRevokeConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('revokeConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">{t('revokeConfirmBody')}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowRevokeConfirm(false)}>
              {t('cancelButton')}
            </Button>
            <Button type="button" variant="destructive" onClick={handleRevoke} disabled={revokeMutation.isPending}>
              {revokeMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('revokeConfirmButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
