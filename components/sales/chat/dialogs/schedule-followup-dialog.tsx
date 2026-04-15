'use client';

import { useState } from 'react';
import { mutateAPI } from '@/hooks/api-helpers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils/cn';
import { Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ScheduleFollowupDialogProps {
  open?: boolean;
  leadId: string;
  onClose: () => void;
  onScheduled: () => void;
}

// Quick presets relative to now
const PRESETS = [
  { label: 'بعد ساعة', hours: 1 },
  { label: 'بعد 3 ساعات', hours: 3 },
  { label: 'غداً صباحاً', hours: null, preset: 'tomorrow_morning' },
  { label: 'غداً مساءً', hours: null, preset: 'tomorrow_afternoon' },
  { label: 'بعد 3 أيام', hours: 72 },
  { label: 'بعد أسبوع', hours: 168 },
];

function getPresetDate(preset: typeof PRESETS[number]): Date {
  const d = new Date();
  if (preset.hours) {
    d.setHours(d.getHours() + preset.hours);
    return d;
  }
  if (preset.preset === 'tomorrow_morning') {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  if (preset.preset === 'tomorrow_afternoon') {
    d.setDate(d.getDate() + 1);
    d.setHours(14, 0, 0, 0);
    return d;
  }
  return d;
}

function toLocalDatetime(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function ScheduleFollowupDialog({ open = true, leadId, onClose, onScheduled }: ScheduleFollowupDialogProps) {
  const [dueAt, setDueAt] = useState(toLocalDatetime(new Date(Date.now() + 3600000)));
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dueAt) {
      toast.error('تاريخ المتابعة مطلوب');
      return;
    }

    setSaving(true);
    try {
      await mutateAPI('/api/dashboard/sales/follow-ups', 'POST', {
        lead_id: leadId,
        due_at: new Date(dueAt).toISOString(),
        title: title.trim() || 'متابعة واتساب',
        notes: notes.trim() || undefined,
      });

      toast.success('تمت جدولة المتابعة');
      onScheduled();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل جدولة المتابعة');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full bg-muted/30 rounded-xl px-3 py-2 text-sm border border-border/40 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500/40';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm p-0 gap-0 rounded-2xl">
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b border-border/60 flex-row items-center gap-2.5 space-y-0">
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
            <Clock className="h-4.5 w-4.5 text-sky-600 dark:text-sky-400" />
          </div>
          <DialogTitle className="text-sm">جدولة متابعة</DialogTitle>
        </DialogHeader>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Quick Presets */}
          <div>
            <label className="text-xs font-medium text-muted-foreground/70 mb-2 block">اختصارات سريعة</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setDueAt(toLocalDatetime(getPresetDate(p)))}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-400 hover:bg-sky-500/20 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Time */}
          <div>
            <label htmlFor="followup-due-at" className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">التاريخ والوقت *</label>
            <input
              id="followup-due-at"
              type="datetime-local"
              value={dueAt}
              onChange={e => setDueAt(e.target.value)}
              className={cn(inputCls, 'tabular-nums')}
              dir="ltr"
              required
            />
          </div>

          {/* Title */}
          <div>
            <label htmlFor="followup-title" className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">العنوان</label>
            <input
              id="followup-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="متابعة واتساب"
              className={inputCls}
            />
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="followup-notes" className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">ملاحظات</label>
            <textarea
              id="followup-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="ملاحظات اختيارية..."
              rows={2}
              className={cn(inputCls, 'resize-none')}
            />
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={saving || !dueAt}
            className="w-full rounded-xl bg-sky-600 hover:bg-sky-700 text-white"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin me-2" />
            ) : (
              <Clock className="h-4 w-4 me-2" />
            )}
            جدولة المتابعة
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
