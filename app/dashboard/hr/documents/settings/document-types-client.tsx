'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, FileText, Loader2, Calendar } from 'lucide-react';
import {
  useDocumentTypes,
  useCreateDocumentType,
  useUpdateDocumentType,
  useDeleteDocumentType,
} from '@/hooks/useDocumentTypes';
import type { PyraDocumentType } from '@/types/database';

interface DocTypeForm {
  name: string;
  name_ar: string;
  requires_expiry: boolean;
  sort_order: number;
}

const EMPTY_FORM: DocTypeForm = {
  name: '',
  name_ar: '',
  requires_expiry: false,
  sort_order: 0,
};

export default function DocumentTypesClient() {
  const { data: docTypes = [], isLoading } = useDocumentTypes();
  const createMut = useCreateDocumentType();
  const updateMut = useUpdateDocumentType();
  const deleteMut = useDeleteDocumentType();

  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DocTypeForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const saving = createMut.isPending || updateMut.isPending;
  const deleting = deleteMut.isPending;

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, sort_order: docTypes.length });
    setShowDialog(true);
  };

  const openEdit = (dt: PyraDocumentType) => {
    setEditingId(dt.id);
    setForm({
      name: dt.name,
      name_ar: dt.name_ar,
      requires_expiry: dt.requires_expiry,
      sort_order: dt.sort_order,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.name_ar.trim()) {
      toast.error('يرجى ملء الاسم بالعربي والإنجليزي');
      return;
    }
    try {
      if (editingId) {
        await updateMut.mutateAsync({ id: editingId, ...form });
        toast.success('تم تحديث نوع الوثيقة');
      } else {
        await createMut.mutateAsync(form);
        toast.success('تم إنشاء نوع الوثيقة');
      }
      setShowDialog(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل الحفظ';
      toast.error(msg);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMut.mutateAsync(deleteId);
      toast.success('تم حذف نوع الوثيقة');
      setDeleteId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل الحذف';
      toast.error(msg);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-56" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">أنواع الوثائق</h1>
          <p className="text-sm text-muted-foreground">
            إدارة أنواع الوثائق والشهادات المستخدمة في ملفات الموظفين
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Plus className="h-4 w-4 me-2" />
          إضافة نوع
        </Button>
      </div>

      {/* List */}
      {docTypes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="لا توجد أنواع وثائق"
          description="أضف أنواع الوثائق لبدء إدارة ملفات الموظفين"
          actionLabel="إضافة نوع وثيقة"
          onAction={openCreate}
        />
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              أنواع الوثائق ({docTypes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {docTypes.map((dt) => (
                <div
                  key={dt.id}
                  className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-4 w-4 text-orange-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{dt.name_ar}</p>
                        <span className="text-xs text-muted-foreground">({dt.name})</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {dt.requires_expiry ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-amber-400 text-amber-600 dark:text-amber-400"
                          >
                            <Calendar className="h-2.5 w-2.5 me-1" />
                            يتطلب تاريخ انتهاء
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            بدون انتهاء
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          ترتيب: {dt.sort_order}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => openEdit(dt)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                      onClick={() => setDeleteId(dt.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'تعديل نوع الوثيقة' : 'إضافة نوع وثيقة جديد'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">الاسم (إنجليزي) *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Passport"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">الاسم (عربي) *</label>
                <Input
                  value={form.name_ar}
                  onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                  placeholder="جواز السفر"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">الترتيب</label>
              <Input
                type="number"
                min={0}
                value={form.sort_order}
                onChange={(e) =>
                  setForm({ ...form, sort_order: Number(e.target.value) })
                }
                dir="ltr"
              />
            </div>

            <div className="flex items-center justify-between py-2 border rounded-lg px-3 bg-muted/30 dark:bg-muted/20">
              <div>
                <p className="text-sm font-medium">يتطلب تاريخ انتهاء</p>
                <p className="text-xs text-muted-foreground">
                  مثل: جواز السفر، الإقامة، رخصة القيادة
                </p>
              </div>
              <Switch
                checked={form.requires_expiry}
                onCheckedChange={(v) => setForm({ ...form, requires_expiry: v })}
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={saving || !form.name.trim() || !form.name_ar.trim()}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 me-2 animate-spin" />
                  جاري الحفظ...
                </>
              ) : editingId ? (
                'تحديث'
              ) : (
                'إنشاء'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              هل أنت متأكد من حذف هذا النوع؟ سيتم إلغاء تفعيله ولن يظهر في النظام.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteId(null)}>
                إلغاء
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 me-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 me-2" />
                )}
                حذف
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
