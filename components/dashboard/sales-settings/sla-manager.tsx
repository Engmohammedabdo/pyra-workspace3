'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
import { Shield, Plus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';
import {
  useSlaPolicies,
  useCreateSlaPolicy,
  useUpdateSlaPolicy,
  useDeleteSlaPolicy,
} from '@/hooks/useWhatsApp';
import type { SlaPolicy } from '@/hooks/useWhatsApp';
import { SlaStatsCard } from '@/components/sales/chat/sla/sla-stats-card';

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'منخفضة', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400' },
  { value: 'normal', label: 'عادية', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-400' },
  { value: 'high', label: 'عالية', color: 'bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400' },
  { value: 'urgent', label: 'عاجلة', color: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400' },
];

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;
  if (remaining === 0) return `${hours} ساعة`;
  return `${hours} ساعة و ${remaining} دقيقة`;
}

interface SlaFormData {
  name: string;
  name_ar: string;
  first_response_minutes: number;
  resolution_minutes: number;
  priority: string;
}

const defaultFormData: SlaFormData = {
  name: '',
  name_ar: '',
  first_response_minutes: 30,
  resolution_minutes: 480,
  priority: 'normal',
};

export function SlaManager() {
  const { data: policies = [], isLoading } = useSlaPolicies();
  const createMutation = useCreateSlaPolicy();
  const updateMutation = useUpdateSlaPolicy();
  const deleteMutation = useDeleteSlaPolicy();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<SlaPolicy | null>(null);
  const [formData, setFormData] = useState<SlaFormData>(defaultFormData);

  function openCreate() {
    setEditingPolicy(null);
    setFormData(defaultFormData);
    setDialogOpen(true);
  }

  function openEdit(policy: SlaPolicy) {
    setEditingPolicy(policy);
    setFormData({
      name: policy.name,
      name_ar: policy.name_ar || '',
      first_response_minutes: policy.first_response_minutes,
      resolution_minutes: policy.resolution_minutes,
      priority: policy.priority,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!formData.name) {
      toast.error('اسم السياسة مطلوب');
      return;
    }

    try {
      if (editingPolicy) {
        await updateMutation.mutateAsync({
          id: editingPolicy.id,
          ...formData,
        });
        toast.success('تم تحديث السياسة');
      } else {
        await createMutation.mutateAsync(formData);
        toast.success('تم إنشاء السياسة');
      }
      setDialogOpen(false);
    } catch {
      toast.error('فشل حفظ السياسة');
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('تم حذف السياسة');
    } catch {
      toast.error('فشل حذف السياسة');
    }
  }

  async function handleToggleActive(policy: SlaPolicy) {
    try {
      await updateMutation.mutateAsync({
        id: policy.id,
        is_active: !policy.is_active,
      });
      toast.success(policy.is_active ? 'تم تعطيل السياسة' : 'تم تفعيل السياسة');
    } catch {
      toast.error('فشل تحديث السياسة');
    }
  }

  return (
    <div className="space-y-6">
      {/* SLA Policies */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5 text-orange-500" />
              اتفاقيات مستوى الخدمة (SLA)
            </CardTitle>
            <Button size="sm" onClick={openCreate} className="rounded-xl">
              <Plus className="h-4 w-4 me-1" />
              إضافة سياسة
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            حدد مهلة زمنية للرد الأول وحل المحادثة لكل مستوى أولوية
          </p>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">جاري التحميل...</div>
          ) : policies.length === 0 ? (
            <div className="text-center py-8">
              <Shield className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">لا توجد سياسات SLA بعد</p>
              <Button variant="outline" size="sm" className="mt-3 rounded-xl" onClick={openCreate}>
                <Plus className="h-4 w-4 me-1" />
                إنشاء أول سياسة
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/40 rounded-xl border border-border/40 overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[1fr_100px_120px_120px_80px_60px] gap-2 px-4 py-2.5 bg-muted/30 text-xs font-medium text-muted-foreground">
                <span>الاسم</span>
                <span>الأولوية</span>
                <span>الرد الأول</span>
                <span>الحل</span>
                <span>الحالة</span>
                <span></span>
              </div>
              {policies.map(policy => {
                const priorityOption = PRIORITY_OPTIONS.find(p => p.value === policy.priority);
                return (
                  <div
                    key={policy.id}
                    className="grid grid-cols-[1fr_100px_120px_120px_80px_60px] gap-2 px-4 py-3 items-center hover:bg-muted/20 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium">{policy.name}</p>
                      {policy.name_ar && (
                        <p className="text-xs text-muted-foreground">{policy.name_ar}</p>
                      )}
                    </div>
                    <div>
                      <Badge
                        variant="secondary"
                        className={cn('text-[10px]', priorityOption?.color)}
                      >
                        {priorityOption?.label || policy.priority}
                      </Badge>
                    </div>
                    <span className="text-sm tabular-nums">
                      {formatMinutes(policy.first_response_minutes)}
                    </span>
                    <span className="text-sm tabular-nums">
                      {formatMinutes(policy.resolution_minutes)}
                    </span>
                    <div>
                      <Switch
                        checked={policy.is_active}
                        onCheckedChange={() => handleToggleActive(policy)}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-lg"
                        onClick={() => openEdit(policy)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                        onClick={() => handleDelete(policy.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SLA Stats */}
      <SlaStatsCard days={30} />

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingPolicy ? 'تعديل سياسة SLA' : 'إنشاء سياسة SLA جديدة'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>اسم السياسة (English)</Label>
              <Input
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Standard SLA"
              />
            </div>
            <div className="space-y-2">
              <Label>اسم السياسة (عربي)</Label>
              <Input
                value={formData.name_ar}
                onChange={e => setFormData(prev => ({ ...prev, name_ar: e.target.value }))}
                placeholder="مثال: اتفاقية عادية"
              />
            </div>
            <div className="space-y-2">
              <Label>الأولوية</Label>
              <Select
                value={formData.priority}
                onValueChange={v => setFormData(prev => ({ ...prev, priority: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>مهلة الرد الأول (دقيقة)</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.first_response_minutes}
                  onChange={e => setFormData(prev => ({
                    ...prev,
                    first_response_minutes: parseInt(e.target.value, 10) || 1,
                  }))}
                />
                <p className="text-[10px] text-muted-foreground">
                  {formatMinutes(formData.first_response_minutes)}
                </p>
              </div>
              <div className="space-y-2">
                <Label>مهلة الحل (دقيقة)</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.resolution_minutes}
                  onChange={e => setFormData(prev => ({
                    ...prev,
                    resolution_minutes: parseInt(e.target.value, 10) || 1,
                  }))}
                />
                <p className="text-[10px] text-muted-foreground">
                  {formatMinutes(formData.resolution_minutes)}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingPolicy ? 'تحديث' : 'إنشاء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
