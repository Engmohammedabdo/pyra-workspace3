'use client';

import { useState } from 'react';
import { mutateAPI } from '@/hooks/api-helpers';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { X, StickyNote, Loader2, Phone, Mail, Users, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface AddNoteDialogProps {
  leadId: string;
  onClose: () => void;
  onAdded: () => void;
}

const ACTIVITY_TYPES = [
  { value: 'note', label: 'ملاحظة', icon: StickyNote, color: 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10' },
  { value: 'call', label: 'مكالمة', icon: Phone, color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10' },
  { value: 'email', label: 'بريد', icon: Mail, color: 'text-purple-600 dark:text-purple-400 bg-purple-500/10' },
  { value: 'meeting', label: 'اجتماع', icon: Users, color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
];

export function AddNoteDialog({ leadId, onClose, onAdded }: AddNoteDialogProps) {
  const [type, setType] = useState('note');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      toast.error('النص مطلوب');
      return;
    }

    setSaving(true);
    try {
      await mutateAPI(`/api/dashboard/sales/leads/${leadId}/activities`, 'POST', {
        activity_type: type,
        description: description.trim(),
      });

      toast.success('تمت إضافة النشاط بنجاح');
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل إضافة النشاط');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="bg-card border border-border/60 rounded-2xl shadow-2xl w-full max-w-sm mx-4 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <FileText className="h-4.5 w-4.5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <h3 className="font-semibold text-sm">إضافة نشاط</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Activity Type */}
          <div className="flex gap-2">
            {ACTIVITY_TYPES.map(at => {
              const Icon = at.icon;
              return (
                <button
                  key={at.value}
                  type="button"
                  onClick={() => setType(at.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border',
                    type === at.value
                      ? `${at.color} border-current/20`
                      : 'bg-muted/30 text-muted-foreground/60 border-transparent hover:bg-muted/50'
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {at.label}
                </button>
              );
            })}
          </div>

          {/* Description */}
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="اكتب الملاحظة هنا..."
            rows={4}
            className="w-full bg-muted/30 rounded-xl px-3 py-2.5 text-sm border border-border/40 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500/40 resize-none"
            autoFocus
            required
          />

          {/* Submit */}
          <Button
            type="submit"
            disabled={saving || !description.trim()}
            className="w-full rounded-xl bg-yellow-600 hover:bg-yellow-700 text-white"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin me-2" />
            ) : (
              <StickyNote className="h-4 w-4 me-2" />
            )}
            حفظ
          </Button>
        </form>
      </div>
    </div>
  );
}
