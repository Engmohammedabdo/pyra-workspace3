'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCancelDeduction } from '@/hooks/useDeductions';

interface CancelDeductionDialogProps {
  paymentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CancelDeductionDialog({
  paymentId,
  open,
  onOpenChange,
}: CancelDeductionDialogProps) {
  const t = useTranslations('hr.deductions.admin.cancelDialog');
  const cancelDeduction = useCancelDeduction();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open, paymentId]);

  const handleConfirm = () => {
    const documentedReason = reason.trim();
    if (!paymentId || !documentedReason) {
      toast.error(t('validation.reason'));
      return;
    }

    cancelDeduction.mutate({ payment_id: paymentId, reason: documentedReason }, {
      onSuccess: (result) => {
        toast.success(result.payroll_run ? t('successRecalculate') : t('success'));
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message || t('error')),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="deduction-cancellation-reason">{t('reasonLabel')}</Label>
          <Textarea
            id="deduction-cancellation-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('reasonPlaceholder')}
            rows={4}
            maxLength={2000}
          />
          <p className="text-xs text-muted-foreground">{t('guard')}</p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={cancelDeduction.isPending}
          >
            {t('back')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={cancelDeduction.isPending || !paymentId || !reason.trim()}
          >
            {cancelDeduction.isPending
              ? <Loader2 className="me-2 h-4 w-4 animate-spin" />
              : <Undo2 className="me-2 h-4 w-4" />}
            {cancelDeduction.isPending ? t('cancelling') : t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
