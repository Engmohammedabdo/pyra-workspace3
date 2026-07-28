'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { FileSignature, Loader2, Upload } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAttestOfflineSignature } from '@/hooks/useOfflineSignature';
import { MAX_EVIDENCE_BYTES, MIME_TO_EXT } from '@/lib/quotes/evidence-upload';
import { dubaiDayKey } from '@/lib/utils/format';

interface OfflineSignDialogProps {
  /** null closes the dialog — mirrors PublicLinkDialog's `quoteId` pattern. */
  quoteId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful attestation so the caller can refresh its list. */
  onSigned?: () => void;
}

const ACCEPTED_MIME = Object.keys(MIME_TO_EXT);
const MAX_MB = MAX_EVIDENCE_BYTES / (1024 * 1024);

/**
 * Records a signature obtained outside the system (Task 8) — the customer
 * signed the PDF quote we emailed or handed over, and the admin filling this
 * form is attesting to that with the counter-signed file as evidence.
 *
 * `signed_offline_by` is derived server-side from the session and is never
 * sent from this form — the server ignores it even if it were included.
 */
export function OfflineSignDialog({ quoteId, onOpenChange, onSigned }: OfflineSignDialogProps) {
  const t = useTranslations('finance.quotes.offlineSign');
  const open = !!quoteId;
  const mutation = useAttestOfflineSignature();
  const today = dubaiDayKey();

  const [signedBy, setSignedBy] = useState('');
  const [signedAt, setSignedAt] = useState(today);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fresh session per quote — mirrors PublicLinkDialog's reset-on-quoteId-change.
  useEffect(() => {
    setSignedBy('');
    setSignedAt(today);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    mutation.reset();
    // Only the quote identity should reset the form — `today`/`mutation.reset`
    // are stable-enough for this purpose and re-running on their identity
    // would fight the user's in-progress input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ACCEPTED_MIME.includes(f.type)) {
      toast.error(t('toasts.fileTypeUnsupported'));
      e.target.value = '';
      return;
    }
    if (f.size > MAX_EVIDENCE_BYTES) {
      toast.error(t('toasts.fileTooLarge', { max: MAX_MB }));
      e.target.value = '';
      return;
    }
    setFile(f);
  }

  function handleClose() {
    onOpenChange(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!quoteId) return;
    if (!signedBy.trim()) { toast.error(t('toasts.signedByRequired')); return; }
    if (!signedAt) { toast.error(t('toasts.signedAtRequired')); return; }
    if (!file) { toast.error(t('toasts.fileRequired')); return; }

    mutation.mutate(
      { quoteId, file, signedBy: signedBy.trim(), signedAt },
      {
        onSuccess: () => {
          toast.success(t('toasts.success'));
          onSigned?.();
          handleClose();
        },
        onError: (err) => toast.error(err.message || t('toasts.failed')),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-orange-600 dark:text-orange-400" aria-hidden="true" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="offline-sign-signed-by">
              {t('signedByLabel')}
            </label>
            <Input
              id="offline-sign-signed-by"
              className="h-11"
              placeholder={t('signedByPlaceholder')}
              value={signedBy}
              onChange={(e) => setSignedBy(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="offline-sign-signed-at">
              {t('signedAtLabel')}
            </label>
            <Input
              id="offline-sign-signed-at"
              type="date"
              className="h-11"
              max={today}
              value={signedAt}
              onChange={(e) => setSignedAt(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="offline-sign-file">
              {t('fileLabel')}
            </label>
            <Input
              id="offline-sign-file"
              ref={fileRef}
              type="file"
              accept={ACCEPTED_MIME.join(',')}
              className="h-11 cursor-pointer"
              onChange={handleFileChange}
              disabled={mutation.isPending}
            />
            <p className="text-xs text-muted-foreground">{t('fileHint', { max: MAX_MB })}</p>
            {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={mutation.isPending}>
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" /> {t('submitting')}
                </>
              ) : (
                <>
                  <Upload className="me-2 h-4 w-4" aria-hidden="true" /> {t('submit')}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
