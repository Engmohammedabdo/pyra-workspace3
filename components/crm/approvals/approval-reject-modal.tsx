'use client';

/**
 * Reject confirmation modal for the Closed-Won approvals queue.
 *
 * Required reason (≥ 10 chars). Submit button stays disabled until the
 * threshold is met. The reason is posted as `{ reason }` to
 * POST /api/crm/approvals/[lead_id]/reject.
 *
 * On submit, the parent ApprovalCard runs the optimistic update —
 * this modal only collects the reason and returns it via onConfirm.
 */

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, XCircle } from 'lucide-react';
import { dirFor, type Locale } from '@/lib/i18n/config';

const MIN_REASON_LENGTH = 10;

interface ApprovalRejectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill / context — shows the lead's name in the modal title. */
  leadName: string;
  submitting: boolean;
  /** Called when the user clicks "تأكيد الرفض" with a valid reason. */ // i18n-exempt: doc comment
  onConfirm: (reason: string) => void;
}

export function ApprovalRejectModal({
  open,
  onOpenChange,
  leadName,
  submitting,
  onConfirm,
}: ApprovalRejectModalProps) {
  const t = useTranslations('crm.approvals.rejectModal');
  const tCommon = useTranslations('common.actions');
  const locale = useLocale() as Locale;
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const trimmed = reason.trim();
  const valid = trimmed.length >= MIN_REASON_LENGTH;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" dir={dirFor(locale)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="size-5 text-red-500" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{leadName}</span>
            {t('description')}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !submitting) onConfirm(trimmed);
          }}
          className="space-y-3 py-2"
        >
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason" className="text-xs">
              {t('reasonLabel')} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder={t('reasonPlaceholder')}
              autoFocus
              required
              minLength={MIN_REASON_LENGTH}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {t('minChars', { count: trimmed.length, min: MIN_REASON_LENGTH })}
            </p>
          </div>

          <DialogFooter className="!flex-row gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!valid || submitting}
            >
              {submitting ? <Loader2 className="size-4 animate-spin me-1.5" /> : null}
              {t('confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
