'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Settings,
  Plus,
  CheckCircle,
  XCircle,
  ListOrdered,
} from 'lucide-react';
import type { AuthSession } from '@/lib/auth/guards';

// ============================================================
// Types
// ============================================================

interface Criterion {
  id: string;
  name: string;
  name_ar: string;
  description: string | null;
  weight: number;
  category: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

// ============================================================
// Category constants
// ============================================================

const CATEGORIES = [
  { value: 'technical', label: 'تقنية' },
  { value: 'communication', label: 'تواصل' },
  { value: 'leadership', label: 'قيادة' },
  { value: 'productivity', label: 'إنتاجية' },
  { value: 'teamwork', label: 'عمل جماعي' },
  { value: 'creativity', label: 'إبداع' },
  { value: 'other', label: 'أخرى' },
];

const CATEGORY_LABELS: Record<string, string> = {};
for (const c of CATEGORIES) {
  CATEGORY_LABELS[c.value] = c.label;
}

// ============================================================
// Main Component
// ============================================================

export default function EvaluationsSettingsClient({ session: _session }: { session: AuthSession }) {
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    name_ar: '',
    description: '',
    weight: '1',
    category: '',
  });

  const fetchCriteria = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/evaluations/criteria');
      const json = await res.json();
      if (json.data) setCriteria(json.data);
    } catch {
      toast.error('فشل في تحميل معايير التقييم');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCriteria();
  }, [fetchCriteria]);

  const handleCreate = async () => {
    if (!formData.name || !formData.name_ar) {
      toast.error('الاسم والاسم بالعربية مطلوبان');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/dashboard/evaluations/criteria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          name_ar: formData.name_ar,
          description: formData.description || null,
          weight: parseFloat(formData.weight) || 1,
          category: formData.category || null,
        }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        toast.success('تم إنشاء المعيار بنجاح');
        setCreateOpen(false);
        setFormData({ name: '', name_ar: '', description: '', weight: '1', category: '' });
        fetchCriteria();
      }
    } catch {
      toast.error('فشل في إنشاء المعيار');
    } finally {
      setCreating(false);
    }
  };

  // Group criteria by category
  const grouped = criteria.reduce<Record<string, Criterion[]>>((acc, c) => {
    const key = c.category || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="space-y-4"
      >
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-orange-500" />
          <h2 className="text-lg font-semibold">إعدادات معايير التقييم</h2>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          size="sm"
          className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Plus className="h-4 w-4" />
          معيار جديد
        </Button>
      </div>

      {/* Criteria List */}
      {criteria.length === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title="لا توجد معايير تقييم"
          description="قم بإنشاء معايير التقييم التي ستُستخدم في تقييم الموظفين"
          actionLabel="إنشاء معيار"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <Card key={category}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {CATEGORY_LABELS[category] || category}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  ({items.length} {items.length === 1 ? 'معيار' : 'معايير'})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {items.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{c.name_ar}</span>
                        <span className="text-xs text-muted-foreground">({c.name})</span>
                        {c.is_active ? (
                          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-500" />
                        )}
                      </div>
                      {c.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-end">
                        <span className="text-xs text-muted-foreground">الوزن</span>
                        <p className="text-sm font-bold text-orange-600 dark:text-orange-400">
                          {c.weight}
                        </p>
                      </div>
                      <div className="text-end">
                        <span className="text-xs text-muted-foreground">الترتيب</span>
                        <p className="text-sm font-medium">{c.sort_order}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Create Criterion Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>معيار تقييم جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>الاسم (إنجليزي)</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                placeholder="Technical Skills"
                className="mt-1"
              />
            </div>
            <div>
              <Label>الاسم (عربي)</Label>
              <Input
                value={formData.name_ar}
                onChange={(e) => setFormData((p) => ({ ...p, name_ar: e.target.value }))}
                placeholder="المهارات التقنية"
                className="mt-1"
              />
            </div>
            <div>
              <Label>الوصف (اختياري)</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                placeholder="وصف المعيار..."
                className="mt-1"
                rows={2}
              />
            </div>
            <div>
              <Label>الوزن</Label>
              <Input
                type="number"
                step="0.1"
                min="0.1"
                value={formData.weight}
                onChange={(e) => setFormData((p) => ({ ...p, weight: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>الفئة</Label>
              <Select
                value={formData.category}
                onValueChange={(v) => setFormData((p) => ({ ...p, category: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر الفئة" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {creating ? 'جارٍ الإنشاء...' : 'إنشاء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
