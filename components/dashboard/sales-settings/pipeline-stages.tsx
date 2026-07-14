'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { mutateAPI } from '@/hooks/api-helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, GripVertical, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// Picker offers the custom palette; COLOR_BG additionally covers the canonical
// stage colors (violet/sky/…/gold/stone) so pre-existing stages render their dot.
const COLORS = ['blue', 'yellow', 'orange', 'purple', 'indigo', 'green', 'red', 'gray', 'pink', 'brown'];
const COLOR_BG: Record<string, string> = {
  blue: 'bg-blue-500', yellow: 'bg-yellow-500', orange: 'bg-orange-500',
  purple: 'bg-purple-500', indigo: 'bg-indigo-500', green: 'bg-green-500',
  red: 'bg-red-500', gray: 'bg-gray-500', pink: 'bg-pink-500', brown: 'bg-amber-700',
  violet: 'bg-violet-500', sky: 'bg-sky-500', amber: 'bg-amber-500',
  emerald: 'bg-emerald-500', gold: 'bg-yellow-500', stone: 'bg-stone-500',
};

interface Stage { id: string; name?: string; name_ar: string; color: string; sort_order?: number }

/** One reorderable stage row. The GripVertical is the drag handle so a plain
 *  click elsewhere on the row doesn't start a drag. */
function SortableStageRow({ stage }: { stage: Stage }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 p-2 rounded-lg bg-card hover:bg-muted/50',
        isDragging && 'opacity-70 shadow-lg ring-1 ring-orange-300 dark:ring-orange-700/60',
      )}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/40 rounded"
        aria-label={`إعادة ترتيب ${stage.name_ar}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className={cn('w-4 h-4 rounded-full shrink-0', COLOR_BG[stage.color] || 'bg-gray-500')} />
      <span className="flex-1 text-sm font-medium truncate">{stage.name_ar}</span>
      <Badge variant="outline" className="text-xs">{stage.name || '—'}</Badge>
    </div>
  );
}

export function PipelineStagesManager({ stages, onRefresh }: { stages: any[]; onRefresh: () => void }) {
  const [newStage, setNewStage] = useState({ name: '', name_ar: '', color: 'blue' });
  const [adding, setAdding] = useState(false);
  const [items, setItems] = useState<Stage[]>(stages);
  const [savingOrder, setSavingOrder] = useState(false);
  const queryClient = useQueryClient();

  // Keep the local order in sync when the parent re-fetches (after add / reorder
  // persist / any external change). During a drag the parent isn't refetching,
  // so this doesn't fight the in-progress reorder.
  useEffect(() => { setItems(stages); }, [stages]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // The pipeline board (usePipelineStages) caches the stage list for 5 min under
  // ['crm','pipeline-stages']. Invalidate after any stage mutation so the board
  // (خط المبيعات) reflects the change immediately instead of after the cache
  // goes stale or a full reload.
  function invalidateBoard() {
    queryClient.invalidateQueries({ queryKey: ['crm', 'pipeline-stages'] });
  }

  async function handleAdd() {
    if (!newStage.name_ar.trim()) { toast.error('اسم المرحلة مطلوب'); return; }
    setAdding(true);
    try {
      await mutateAPI('/api/dashboard/sales/pipeline-stages', 'POST', newStage);
      toast.success('تمت إضافة المرحلة');
      setNewStage({ name: '', name_ar: '', color: 'blue' });
      onRefresh();
      invalidateBoard();
    } catch { toast.error('فشل الإضافة'); } finally { setAdding(false); }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((s) => s.id === active.id);
    const newIndex = items.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered); // optimistic
    setSavingOrder(true);
    try {
      // Persist sequential sort_order = visual index (bulk PUT). This also
      // resolves any pre-existing duplicate sort_order values (e.g. custom
      // stages that all defaulted to 99).
      await mutateAPI('/api/dashboard/sales/pipeline-stages', 'PUT', {
        stages: reordered.map((s, i) => ({ id: s.id, sort_order: i })),
      });
      toast.success('تم حفظ الترتيب');
      invalidateBoard();
      onRefresh();
    } catch {
      toast.error('فشل حفظ الترتيب');
      setItems(stages); // revert to last server state
    } finally {
      setSavingOrder(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          مراحل خط المبيعات
          {savingOrder && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
          <GripVertical className="h-3 w-3 shrink-0" />
          اسحب المقبض لإعادة ترتيب المراحل — الترتيب ينعكس على خط المبيعات مباشرة.
        </p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {items.map((stage) => (
                <SortableStageRow key={stage.id} stage={stage} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
