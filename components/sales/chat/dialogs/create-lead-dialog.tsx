'use client';

import { useState, useEffect } from 'react';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { X, UserPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface PipelineStage {
  id: string;
  name_ar: string;
  color: string;
  is_default: boolean;
}

interface CreateLeadDialogProps {
  contactName: string | null;
  phone: string;
  onClose: () => void;
  onCreated: (leadId: string) => void;
}

export function CreateLeadDialog({ contactName, phone, onClose, onCreated }: CreateLeadDialogProps) {
  const [name, setName] = useState(contactName || '');
  const [phoneValue, setPhoneValue] = useState(phone ? `+${phone}` : '');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [stageId, setStageId] = useState('');
  const [priority, setPriority] = useState('medium');
  const [notes, setNotes] = useState('');
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchStages() {
      try {
        const stagesList = await fetchAPI<PipelineStage[]>('/api/dashboard/sales/pipeline-stages');
        setStages(stagesList);
        // Set default stage
        const def = stagesList.find((s: PipelineStage) => s.is_default);
        if (def) setStageId(def.id);
        else if (stagesList.length) setStageId(stagesList[0].id);
      } catch {
        // silent
      }
    }
    fetchStages();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('اسم العميل المحتمل مطلوب');
      return;
    }

    setSaving(true);
    try {
      const result = await mutateAPI<{ id?: string }>('/api/dashboard/sales/leads', 'POST', {
        name: name.trim(),
        phone: phoneValue.replace(/\D/g, '') || undefined,
        email: email.trim() || undefined,
        company: company.trim() || undefined,
        stage_id: stageId || undefined,
        priority,
        notes: notes.trim() || undefined,
        source: 'whatsapp',
      });
      toast.success('تم إنشاء العميل المحتمل بنجاح');
      onCreated(result?.id || '');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل إنشاء العميل المحتمل');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full bg-muted/30 rounded-xl px-3 py-2 text-sm border border-border/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/40';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="bg-card border border-border/60 rounded-2xl shadow-2xl dark:shadow-black/25 w-full max-w-md mx-4 max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <UserPlus className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="font-semibold text-sm">إنشاء عميل محتمل</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onClose} aria-label="إغلاق">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">الاسم *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="اسم العميل المحتمل"
              className={inputCls}
              required
              autoFocus
            />
          </div>

          {/* Phone */}
          <div>
            <label className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">رقم الهاتف</label>
            <input
              value={phoneValue}
              onChange={e => setPhoneValue(e.target.value)}
              placeholder="+971..."
              dir="ltr"
              className={cn(inputCls, 'tabular-nums')}
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">البريد الإلكتروني</label>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@example.com"
              type="email"
              dir="ltr"
              className={inputCls}
            />
          </div>

          {/* Company */}
          <div>
            <label className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">الشركة</label>
            <input
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="اسم الشركة"
              className={inputCls}
            />
          </div>

          {/* Stage + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">المرحلة</label>
              <select value={stageId} onChange={e => setStageId(e.target.value)} className={inputCls}>
                {stages.map(s => (
                  <option key={s.id} value={s.id}>{s.name_ar}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">الأولوية</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className={inputCls}>
                <option value="low">منخفض</option>
                <option value="medium">متوسط</option>
                <option value="high">مرتفع</option>
                <option value="urgent">عاجل</option>
              </select>
            </div>
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
            disabled={saving || !name.trim()}
            className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin me-2" />
            ) : (
              <UserPlus className="h-4 w-4 me-2" />
            )}
            إنشاء عميل محتمل
          </Button>
        </form>
      </div>
    </div>
  );
}
