'use client';

/**
 * Schedule Follow-up modal — small dialog launched from the Lead Detail
 * header (and the Lead sidebar's "schedule" CTA in v1.x).
 *
 * Form:
 *   Title              — defaults to a localized "Follow-up" placeholder
 *   Due-at             — quick-pick (tomorrow / 3 days / week / 2 weeks / month) or custom
 *   Notes              — optional textarea
 *
 * Submit → useCreateFollowUp → POST /api/crm/follow-ups.
 * The hook invalidates ['crm','follow-ups'], the parent lead query, and
 * the timeline so the new follow_up_created activity appears immediately.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateFollowUp } from '@/hooks/useFollowUps';
import { dirFor, type Locale } from '@/lib/i18n/config';

interface FollowUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  /** Pre-fill the title (e.g. "Follow-up after sending the quote"). */
  defaultTitle?: string;
}

function quickDateLocal(daysFromNow: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Quick-due presets — this modal's superset of crm.modals.quickDue (adds
// `inMonth`, which the add-lead-modal quick-picks don't offer).
const QUICK_DUE_DAYS = [1, 3, 7, 14, 30] as const;
const QUICK_DUE_KEYS: Record<(typeof QUICK_DUE_DAYS)[number], string> = {
  1: 'tomorrow',
  3: 'in3Days',
  7: 'inWeek',
  14: 'in2Weeks',
  30: 'inMonth',
};

export function FollowUpModal({ open, onOpenChange, leadId, defaultTitle }: FollowUpModalProps) {
  const t = useTranslations('crm.modals.followUp');
  const tCommon = useTranslations('common.actions');
  const tQuickDue = useTranslations('crm.modals.quickDue');
  const locale = useLocale() as Locale;
  const create = useCreateFollowUp();
  const [title, setTitle] = useState(t('defaultTitle'));
  const [dueAt, setDueAt] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle ?? t('defaultTitle'));
      setDueAt(quickDateLocal(1)); // default to "tomorrow 10am"
      setNotes('');
    }
  }, [open, defaultTitle, t]);

  async function handleSubmit() {
    const titleTrimmed = title.trim();
    if (!titleTrimmed) {
      toast.error(t('requiredTitle'));
      return;
    }
    if (!dueAt) {
      toast.error(t('requiredDueAt'));
      return;
    }
    try {
      await create.mutateAsync({
        lead_id: leadId,
        title: titleTrimmed,
        due_at: new Date(dueAt).toISOString(),
        notes: notes.trim() || undefined,
      });
      toast.success(t('createSuccess'));
      onOpenChange(false);
    } catch (err) {
      console.error('Create follow-up failed:', err);
      toast.error(t('createError'));
    }
  }

  const submitting = create.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" dir={dirFor(locale)}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description')}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          className="space-y-4 py-2"
        >
          <div className="space-y-1.5">
            <Label htmlFor="fu-title" className="text-xs">{t('titleField')}</Label>
            <Input
              id="fu-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t('whenLabel')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_DUE_DAYS.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setDueAt(quickDateLocal(days))}
                  className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs hover:bg-muted"
                >
                  {tQuickDue(QUICK_DUE_KEYS[days] as Parameters<typeof tQuickDue>[0])}
                </button>
              ))}
            </div>
            <Input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fu-notes" className="text-xs">{t('notesLabel')}</Label>
            <Textarea
              id="fu-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notesPlaceholder')}
              className="resize-none"
            />
          </div>

          <DialogFooter className="!flex-row gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={submitting} className="bg-orange-500 hover:bg-orange-600 text-white">
              {submitting ? <Loader2 className="size-4 animate-spin me-1.5" /> : null}
              {t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
