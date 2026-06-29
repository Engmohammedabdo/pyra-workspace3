'use client';

import { useState, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useDocumentTypes } from '@/hooks/useDocumentTypes';
import { useUploadEmployeeDocument } from '@/hooks/useEmployeeDocuments';
import type { User } from '@/hooks/useUsers';

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

interface Props {
  open: boolean;
  onClose: () => void;
  employees: User[];
}

export function UploadDocumentDialog({ open, onClose, employees }: Props) {
  const { data: docTypes = [] } = useDocumentTypes();
  const uploadMut = useUploadEmployeeDocument();

  const [employeeUsername, setEmployeeUsername] = useState('');
  const [typeId, setTypeId] = useState('');
  const [label, setLabel] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedType = docTypes.find((t) => t.id === typeId);
  const requiresExpiry = selectedType?.requires_expiry ?? false;

  function reset() {
    setEmployeeUsername('');
    setTypeId('');
    setLabel('');
    setExpiryDate('');
    setNotes('');
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    uploadMut.reset();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ALLOWED_MIME.includes(f.type)) {
      toast.error('نوع الملف غير مدعوم. الأنواع المقبولة: PDF، JPEG، PNG، WebP');
      e.target.value = '';
      return;
    }
    if (f.size > MAX_SIZE) {
      toast.error('حجم الملف يتجاوز 20 ميجابايت');
      e.target.value = '';
      return;
    }
    setFile(f);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeUsername) { toast.error('يرجى اختيار الموظف'); return; }
    if (!typeId) { toast.error('يرجى اختيار نوع الوثيقة'); return; }
    if (!file) { toast.error('يرجى اختيار ملف'); return; }
    if (requiresExpiry && !expiryDate) { toast.error('هذا النوع يتطلب تاريخ انتهاء'); return; }

    uploadMut.mutate(
      { file, employee_username: employeeUsername, type_id: typeId,
        label: label || undefined, expiry_date: expiryDate || null,
        notes: notes || undefined },
      {
        onSuccess: () => {
          toast.success('تم رفع الوثيقة بنجاح');
          reset();
          onClose();
        },
        onError: (err: Error) => toast.error(err.message || 'فشل الرفع'),
      },
    );
  }

  function handleOpenChange(v: boolean) {
    if (!v) { reset(); onClose(); }
  }

  const activeTypes = docTypes.filter((t) => t.is_active);
  const isPending = uploadMut.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>رفع وثيقة موظف</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Employee */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">الموظف *</label>
            <Select value={employeeUsername} onValueChange={setEmployeeUsername}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="اختر موظفاً" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((u) => (
                  <SelectItem key={u.username as string} value={u.username as string}>
                    {(u.display_name || u.name || u.username) as string}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">نوع الوثيقة *</label>
            <Select value={typeId} onValueChange={(v) => { setTypeId(v); setExpiryDate(''); }}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="اختر نوع الوثيقة" />
              </SelectTrigger>
              <SelectContent>
                {activeTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name_ar}
                    {t.requires_expiry && ' *'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">التسمية</label>
            <Input
              className="h-11"
              placeholder="مثال: جواز سفر 2024"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          {/* Expiry date */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              تاريخ الانتهاء {requiresExpiry && <span className="text-red-500">*</span>}
            </label>
            <Input
              type="date"
              className="h-11"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              required={requiresExpiry}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">ملاحظات</label>
            <Textarea
              placeholder="ملاحظات اختيارية..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* File */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">الملف *</label>
            <Input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="h-11 cursor-pointer"
              onChange={handleFileChange}
            />
            {file && (
              <p className="text-xs text-muted-foreground">{file.name}</p>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => { reset(); onClose(); }}
              disabled={isPending}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
            >
              {isPending ? (
                <><Loader2 className="h-4 w-4 me-2 animate-spin" /> جاري الرفع...</>
              ) : (
                <><Upload className="h-4 w-4 me-2" /> رفع الوثيقة</>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
