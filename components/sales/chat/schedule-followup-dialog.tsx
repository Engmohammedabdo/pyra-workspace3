'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { X, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ScheduleFollowupDialogProps {
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

export function ScheduleFollowupDialog({ leadId, onClose, onScheduled }: ScheduleFollowupDialogProps) {
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
      const res = await fetch('/api/dashboard/sales/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          due_at: new Date(dueAt).toISOString(),
          title: title.trim() || 'متابعة واتساب',
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'فشل الجدولة');
      }

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="bg-card border border-border/60 rounded-2xl shadow-2xl w-full max-w-sm mx-4 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center">
              <Clock className="h-4.5 w-4.5 text-sky-600 dark:text-sky-400" />
            </div>
            <h3 className="font-semibold text-sm">جدولة متابعة</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

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
            <label className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">التاريخ والوقت *</label>
            <input
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
            <label className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">العنوان</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="متابعة واتساب"
              className={inputCls}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">ملاحظات</label>
            <textarea
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
      </div>
    </div>
  );
}
