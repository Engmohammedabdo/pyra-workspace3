'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils/cn';
import {
  TASK_REJECTION_KINDS,
  type TaskRejectionKind,
} from '@/lib/constants/task-review';

export interface TaskRejectionInput {
  note: string;
  rejection_kind: TaskRejectionKind;
}

interface TaskRejectionDialogProps {
  open: boolean;
  isSubmitting: boolean;
  feedsQualityScore: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: TaskRejectionInput) => void | Promise<void>;
}

export function TaskRejectionDialog({
  open,
  isSubmitting,
  feedsQualityScore,
  onOpenChange,
  onConfirm,
}: TaskRejectionDialogProps) {
  const t = useTranslations('boards.sheet.pipeline.rejectionDialog');
  const [kind, setKind] = useState<TaskRejectionKind | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) {
      setKind(null);
      setNote('');
    }
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isSubmitting) {
      setKind(null);
      setNote('');
    }
    onOpenChange(nextOpen);
  };

  const handleConfirm = () => {
    const trimmedNote = note.trim();
    if (!kind || !trimmedNote || isSubmitting) return;
    void onConfirm({ note: trimmedNote, rejection_kind: kind });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t(feedsQualityScore ? 'qualityDescription' : 'description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p id="task-rejection-kind-label" className="text-sm font-medium">
              {t('kindLabel')}
            </p>
            <div
              role="radiogroup"
              aria-labelledby="task-rejection-kind-label"
              className="grid gap-2 sm:grid-cols-2"
            >
              {([
                TASK_REJECTION_KINDS.REVISION,
                TASK_REJECTION_KINDS.OUTRIGHT,
              ] as const).map((option) => (
                <Button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={kind === option}
                  variant="outline"
                  className={cn(
                    'h-auto min-h-20 items-start justify-start whitespace-normal p-3 text-start',
                    kind === option
                      ? 'border-orange-500 bg-orange-50 text-orange-900 dark:bg-orange-950/30 dark:text-orange-100'
                      : 'bg-white text-foreground dark:bg-slate-950',
                  )}
                  onClick={() => setKind(option)}
                >
                  <span>
                    <span className="block font-semibold">{t(`${option}.title`)}</span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {t(`${option}.description`)}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="task-rejection-note" className="text-sm font-medium">
              {t('noteLabel')}
            </label>
            <Textarea
              id="task-rejection-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('notePlaceholder')}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => handleOpenChange(false)}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isSubmitting || !kind || !note.trim()}
            onClick={handleConfirm}
          >
            {isSubmitting ? t('submitting') : t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
