'use client';

import { useState, useEffect } from 'react';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils/cn';
import { UserPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';

interface PipelineStage {
  id: string;
  name_ar: string;
  color: string;
  is_default: boolean;
}

interface CreateLeadDialogProps {
  open?: boolean;
  contactName: string | null;
  phone: string;
  onClose: () => void;
  onCreated: (leadId: string) => void;
}

export function CreateLeadDialog({ open = true, contactName, phone, onClose, onCreated }: CreateLeadDialogProps) {
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
        // Use the CRM stages endpoint (stg_* only). The legacy
        // /api/dashboard/sales/pipeline-stages returns BOTH legacy stage_* and
        // CRM stg_* rows with TWO is_default=true rows — .find(is_default) there
        // deterministically picked legacy 'stage_new', which the CRM pipeline
        // board silently drops (only stg_* columns render) → invisible lead.
        const stagesList = await fetchAPI<PipelineStage[]>('/api/crm/pipeline-stages');
        setStages(stagesList);
        // Default to the canonical new-inquiry stage — never stagesList[0]
        // (that is stg_reshuffle now, sort_order 0).
        const def = stagesList.find((s: PipelineStage) => s.is_default);
        setStageId(def?.id ?? PIPELINE_STAGE_IDS.NEW_INQUIRY);
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
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 rounded-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b border-border/60 flex-row items-center gap-2.5 space-y-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
            <UserPlus className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <DialogTitle className="text-sm">إنشاء عميل محتمل</DialogTitle>
          <DialogDescription className="sr-only">نموذج</DialogDescription>
        </DialogHeader>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="create-lead-name" className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">الاسم *</label>
            <input
              id="create-lead-name"
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
            <label htmlFor="create-lead-phone" className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">رقم الهاتف</label>
            <input
              id="create-lead-phone"
              value={phoneValue}
              onChange={e => setPhoneValue(e.target.value)}
              placeholder="+971..."
              dir="ltr"
              className={cn(inputCls, 'tabular-nums')}
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="create-lead-email" className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">البريد الإلكتروني</label>
            <input
              id="create-lead-email"
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
            <label htmlFor="create-lead-company" className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">الشركة</label>
            <input
              id="create-lead-company"
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="اسم الشركة"
              className={inputCls}
            />
          </div>

          {/* Stage + Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="create-lead-stage" className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">المرحلة</label>
              <select id="create-lead-stage" value={stageId} onChange={e => setStageId(e.target.value)} className={inputCls}>
                {stages.map(s => (
                  <option key={s.id} value={s.id}>{s.name_ar}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="create-lead-priority" className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">الأولوية</label>
              <select id="create-lead-priority" value={priority} onChange={e => setPriority(e.target.value)} className={inputCls}>
                <option value="low">منخفض</option>
                <option value="medium">متوسط</option>
                <option value="high">مرتفع</option>
                <option value="urgent">عاجل</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="create-lead-notes" className="text-xs font-medium text-muted-foreground/70 mb-1.5 block">ملاحظات</label>
            <textarea
              id="create-lead-notes"
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
      </DialogContent>
    </Dialog>
  );
}
