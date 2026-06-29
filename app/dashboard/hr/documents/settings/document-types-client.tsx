'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Plus, Trash2, FileText, Loader2 } from 'lucide-react';
import { DocTypeRow } from '@/components/hr/documents/DocTypeRow';
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
                <DocTypeRow
                  key={dt.id}
                  docType={dt}
                  onEdit={openEdit}
                  onDelete={setDeleteId}
                />
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
      <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
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
