'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ListTree, Plus, Trash2, Save, Loader2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';

interface ContractItem {
  title: string;
  description?: string;
  children?: ContractItem[];
}

interface ContractItemsEditorProps {
  contractId: string;
}

export function ContractItemsEditor({ contractId }: ContractItemsEditorProps) {
  const [items, setItems] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/finance/contracts/${contractId}/items`);
      const j = await res.json();
      if (j.data?.items) {
        setItems(j.data.items.map((item: { title: string; description?: string; children?: { title: string; description?: string }[] }) => ({
          title: item.title,
          description: item.description || '',
          children: (item.children || []).map((c: { title: string; description?: string }) => ({
            title: c.title,
            description: c.description || '',
          })),
        })));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSave = async () => {
    // Validate: all items must have titles
    const invalid = items.some(i => !i.title.trim()) ||
      items.some(i => i.children?.some(c => !c.title.trim()));

    if (invalid) {
      toast.error('جميع البنود يجب أن تحتوي على عنوان');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/finance/contracts/${contractId}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (res.ok) {
        toast.success('تم حفظ بنود العقد');
        setHasChanges(false);
      } else {
        const j = await res.json().catch(() => null);
        toast.error(j?.error || 'فشل في حفظ البنود');
      }
    } catch {
      toast.error('فشل في حفظ البنود');
    } finally {
      setSaving(false);
    }
  };

  const addItem = () => {
    setItems(prev => [...prev, { title: '', description: '', children: [] }]);
    setHasChanges(true);
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setHasChanges(true);
  };

  const updateItem = (idx: number, field: 'title' | 'description', value: string) => {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item
    ));
    setHasChanges(true);
  };

  const addChild = (parentIdx: number) => {
    setItems(prev => prev.map((item, i) =>
      i === parentIdx
        ? { ...item, children: [...(item.children || []), { title: '', description: '' }] }
        : item
    ));
    setHasChanges(true);
  };

  const removeChild = (parentIdx: number, childIdx: number) => {
    setItems(prev => prev.map((item, i) =>
      i === parentIdx
        ? { ...item, children: (item.children || []).filter((_, ci) => ci !== childIdx) }
        : item
    ));
    setHasChanges(true);
  };

  const updateChild = (parentIdx: number, childIdx: number, field: 'title' | 'description', value: string) => {
    setItems(prev => prev.map((item, i) =>
      i === parentIdx
        ? {
            ...item,
            children: (item.children || []).map((child, ci) =>
              ci === childIdx ? { ...child, [field]: value } : child
            ),
          }
        : item
    ));
    setHasChanges(true);
  };

  const arabicLetters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي'];

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ListTree className="h-4 w-4" />
            نطاق العمل
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ListTree className="h-4 w-4 text-orange-500" />
            نطاق العمل
          </CardTitle>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Save className="h-4 w-4 ml-1" />}
                حفظ البنود
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={addItem}>
              <Plus className="h-4 w-4 ml-1" />
              إضافة بند
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={ListTree}
            title="لا توجد بنود بعد"
            description="أضف بنود نطاق العمل لتظهر في الفواتير والبوابة"
            actionLabel="إضافة أول بند"
            onAction={addItem}
          />
        ) : (
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-border bg-card p-3 space-y-3"
              >
                {/* Parent item row */}
                <div className="flex items-start gap-2">
                  <div className="flex items-center gap-1 pt-2 text-muted-foreground shrink-0">
                    <GripVertical className="h-4 w-4" />
                    <span className="text-sm font-mono w-5 text-center">{idx + 1}.</span>
                  </div>
                  <div className="flex-1 space-y-2">
                    <Input
                      value={item.title}
                      onChange={e => updateItem(idx, 'title', e.target.value)}
                      placeholder="عنوان البند"
                      className="font-medium"
                    />
                    <Input
                      value={item.description || ''}
                      onChange={e => updateItem(idx, 'description', e.target.value)}
                      placeholder="وصف اختياري"
                      className="text-sm text-muted-foreground"
                    />
                  </div>
                  <div className="flex items-center gap-1 pt-1 shrink-0">
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950"
                      onClick={() => addChild(idx)}
                      title="إضافة بند فرعي"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeItem(idx)}
                      title="حذف البند"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Children */}
                {item.children && item.children.length > 0 && (
                  <div className="me-9 space-y-2 border-s-2 border-orange-200 dark:border-orange-900/50 ps-3">
                    {item.children.map((child, cIdx) => (
                      <div key={cIdx} className="flex items-start gap-2">
                        <span className="text-sm text-muted-foreground pt-2 shrink-0 w-5 text-center font-mono">
                          {arabicLetters[cIdx] || String(cIdx + 1)}.
                        </span>
                        <div className="flex-1">
                          <Input
                            value={child.title}
                            onChange={e => updateChild(idx, cIdx, 'title', e.target.value)}
                            placeholder="عنوان البند الفرعي"
                            className="text-sm"
                          />
                        </div>
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={() => removeChild(idx, cIdx)}
                          title="حذف"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Save button at bottom too if many items */}
            {items.length > 3 && hasChanges && (
              <div className="flex justify-end pt-2">
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Save className="h-4 w-4 ml-1" />}
                  حفظ البنود
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
