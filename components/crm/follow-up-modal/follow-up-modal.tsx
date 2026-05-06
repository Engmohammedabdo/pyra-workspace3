'use client';

/**
 * Schedule Follow-up modal — small dialog launched from the Lead Detail
 * header (and the Lead sidebar's "schedule" CTA in v1.x).
 *
 * Form:
 *   Title              — defaults to "متابعة"
 *   Due-at             — quick-pick (بكره / 3 أيام / أسبوع / أسبوعين) or custom
 *   Notes              — optional textarea
 *
 * Submit → useCreateFollowUp → POST /api/crm/follow-ups.
 * The hook invalidates ['crm','follow-ups'], the parent lead query, and
 * the timeline so the new follow_up_created activity appears immediately.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
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

interface FollowUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  /** Pre-fill the title (e.g. "متابعة بعد إرسال العرض"). */
  defaultTitle?: string;
}

function quickDateLocal(daysFromNow: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function FollowUpModal({ open, onOpenChange, leadId, defaultTitle }: FollowUpModalProps) {
  const create = useCreateFollowUp();
  const [title, setTitle] = useState('متابعة');
  const [dueAt, setDueAt] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle ?? 'متابعة');
      setDueAt(quickDateLocal(1)); // default to "tomorrow 10am"
      setNotes('');
    }
  }, [open, defaultTitle]);

  async function handleSubmit() {
    const t = title.trim();
    if (!t) {
      toast.error('عنوان المتابعة مطلوب');
      return;
    }
    if (!dueAt) {
      toast.error('وقت المتابعة مطلوب');
      return;
    }
    try {
      await create.mutateAsync({
        lead_id: leadId,
        title: t,
        due_at: new Date(dueAt).toISOString(),
        notes: notes.trim() || undefined,
      });
      toast.success('تم جدولة المتابعة');
      onOpenChange(false);
    } catch (err) {
      console.error('Create follow-up failed:', err);
      toast.error('فشل جدولة المتابعة');
    }
  }

  const submitting = create.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>جدولة متابعة</DialogTitle>
          <DialogDescription>
            ستظهر في "متابعاتي" وفي الـ sidebar الخاص بهذا الـ Lead.
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
            <Label htmlFor="fu-title" className="text-xs">العنوان</Label>
            <Input
              id="fu-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">متى؟</Label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'بكره', days: 1 },
                { label: 'بعد 3 أيام', days: 3 },
                { label: 'بعد أسبوع', days: 7 },
                { label: 'بعد أسبوعين', days: 14 },
                { label: 'بعد شهر', days: 30 },
              ].map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setDueAt(quickDateLocal(q.days))}
                  className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs hover:bg-muted"
                >
                  {q.label}
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
            <Label htmlFor="fu-notes" className="text-xs">ملاحظات (اختياري)</Label>
            <Textarea
              id="fu-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثلاً: نتابع رد على العرض، نرسل الأسعار، ..."
              className="resize-none"
            />
          </div>

          <DialogFooter className="!flex-row gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting} className="bg-orange-500 hover:bg-orange-600 text-white">
              {submitting ? <Loader2 className="size-4 animate-spin me-1.5" /> : null}
              جدولة
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
