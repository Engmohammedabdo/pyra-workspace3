'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

export function MilestoneDialog({ open, onOpenChange, milestone, form, setForm, onSave, loading, totalValue, currency }: { open: boolean, onOpenChange: (v: boolean) => void, milestone: any, form: any, setForm: (f: any) => void, onSave: () => void, loading: boolean, totalValue: number, currency: string }) {
  const calculatedAmount = totalValue * (Number(form.percentage || 0) / 100);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{milestone ? 'تعديل المرحلة' : 'إضافة مرحلة جديدة'}</DialogTitle>
          <DialogDescription>
            {milestone ? 'تعديل بيانات المرحلة' : 'أدخل بيانات المرحلة الجديدة'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>عنوان المرحلة *</Label>
            <Input value={form.title} onChange={e => setForm((p: any) => ({ ...p, title: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>الوصف</Label>
            <Textarea value={form.description} onChange={e => setForm((p: any) => ({ ...p, description: e.target.value }))} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>النسبة (%) *</Label>
              <Input type="number" step="0.01" min="0.01" max="100" value={form.percentage} onChange={e => setForm((p: any) => ({ ...p, percentage: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>المبلغ المحسوب</Label>
              <Input value={calculatedAmount > 0 ? calculatedAmount.toLocaleString() : '-'} disabled className="bg-muted" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>تاريخ الاستحقاق</Label>
            <Input type="date" value={form.due_date} onChange={e => setForm((p: any) => ({ ...p, due_date: e.target.value }))} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={onSave} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 me-1 animate-spin" />}
            {milestone ? 'حفظ التعديلات' : 'إضافة'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
