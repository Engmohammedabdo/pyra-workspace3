'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, GripVertical, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const COLORS = ['blue', 'yellow', 'orange', 'purple', 'indigo', 'green', 'red', 'gray', 'pink', 'brown'];
const COLOR_BG: Record<string, string> = {
  blue: 'bg-blue-500', yellow: 'bg-yellow-500', orange: 'bg-orange-500',
  purple: 'bg-purple-500', indigo: 'bg-indigo-500', green: 'bg-green-500',
  red: 'bg-red-500', gray: 'bg-gray-500', pink: 'bg-pink-500', brown: 'bg-amber-700',
};

export function PipelineStagesManager({ stages, onRefresh }: { stages: any[]; onRefresh: () => void }) {
  const [newStage, setNewStage] = useState({ name: '', name_ar: '', color: 'blue' });
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!newStage.name_ar.trim()) { toast.error('اسم المرحلة مطلوب'); return; }
    setAdding(true);
    try {
      const res = await fetch('/api/dashboard/sales/pipeline-stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStage),
      });
      if (!res.ok) throw new Error();
      toast.success('تمت إضافة المرحلة');
      setNewStage({ name: '', name_ar: '', color: 'blue' });
      onRefresh();
    } catch { toast.error('فشل الإضافة'); } finally { setAdding(false); }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">مراحل خط المبيعات</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {stages.map((stage: any) => (
          <div key={stage.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <div className={cn('w-4 h-4 rounded-full', COLOR_BG[stage.color] || 'bg-gray-500')} />
            <span className="flex-1 text-sm font-medium">{stage.name_ar}</span>
            <Badge variant="outline" className="text-xs">{stage.name || '—'}</Badge>
          </div>
        ))}
        <div className="border-t pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
          <div><Label className="text-xs">الاسم (عربي)</Label><Input value={newStage.name_ar} onChange={e => setNewStage(s => ({ ...s, name_ar: e.target.value }))} /></div>
          <div><Label className="text-xs">الاسم (إنجليزي)</Label><Input value={newStage.name} onChange={e => setNewStage(s => ({ ...s, name: e.target.value }))} /></div>
          <div><Label className="text-xs">اللون</Label><Select value={newStage.color} onValueChange={v => setNewStage(s => ({ ...s, color: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COLORS.map(c => <SelectItem key={c} value={c}><div className="flex items-center gap-2"><div className={cn('w-3 h-3 rounded-full', COLOR_BG[c])}/>{c}</div></SelectItem>)}</SelectContent></Select></div>
          <Button onClick={handleAdd} disabled={adding}>{adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} إضافة</Button>
        </div>
      </CardContent>
    </Card>
  );
}
