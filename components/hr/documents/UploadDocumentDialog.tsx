'use client';

import { useState, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
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
import type { Locale } from '@/lib/i18n/config';

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_SIZE_MB = MAX_SIZE / (1024 * 1024);

interface Props {
  open: boolean;
  onClose: () => void;
  employees: User[];
  /** Pre-select and lock the employee field (used by the user-detail page). */
  defaultEmployeeUsername?: string;
}

export function UploadDocumentDialog({ open, onClose, employees, defaultEmployeeUsername }: Props) {
  const t = useTranslations('hr.documents.uploadDialog');
  const locale = useLocale() as Locale;
  const { data: docTypes = [] } = useDocumentTypes();
  const uploadMut = useUploadEmployeeDocument();

  const [employeeUsername, setEmployeeUsername] = useState(defaultEmployeeUsername ?? '');
  const [typeId, setTypeId] = useState('');
  const [label, setLabel] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedType = docTypes.find((dt) => dt.id === typeId);
  const requiresExpiry = selectedType?.requires_expiry ?? false;

  function reset() {
    setEmployeeUsername(defaultEmployeeUsername ?? '');
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
      toast.error(t('toasts.fileTypeUnsupported'));
      e.target.value = '';
      return;
    }
    if (f.size > MAX_SIZE) {
      toast.error(t('toasts.fileTooLarge', { max: MAX_SIZE_MB }));
      e.target.value = '';
      return;
    }
    setFile(f);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeUsername) { toast.error(t('toasts.employeeRequired')); return; }
    if (!typeId) { toast.error(t('toasts.typeRequired')); return; }
    if (!file) { toast.error(t('toasts.fileRequired')); return; }
    if (requiresExpiry && !expiryDate) { toast.error(t('toasts.expiryRequired')); return; }

    uploadMut.mutate(
      { file, employee_username: employeeUsername, type_id: typeId,
        label: label || undefined, expiry_date: expiryDate || null,
        notes: notes || undefined },
      {
        onSuccess: () => {
          toast.success(t('toasts.uploadSuccess'));
          reset();
          onClose();
        },
        onError: (err: Error) => toast.error(err.message || t('toasts.uploadFailed')),
      },
    );
  }

  function handleOpenChange(v: boolean) {
    if (!v) { reset(); onClose(); }
  }

  const activeTypes = docTypes.filter((dt) => dt.is_active);
  const isPending = uploadMut.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Employee */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('employeeLabel')}</label>
            <Select
              value={employeeUsername}
              onValueChange={setEmployeeUsername}
              disabled={!!defaultEmployeeUsername}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder={t('employeePlaceholder')} />
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
            <label className="text-sm font-medium">{t('typeLabel')}</label>
            <Select value={typeId} onValueChange={(v) => { setTypeId(v); setExpiryDate(''); }}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder={t('typePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {activeTypes.map((dt) => (
                  <SelectItem key={dt.id} value={dt.id}>
                    {locale === 'ar' ? dt.name_ar : (dt.name || dt.name_ar)}
                    {dt.requires_expiry && ' *'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('labelLabel')}</label>
            <Input
              className="h-11"
              placeholder={t('labelPlaceholder')}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          {/* Expiry date */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t('expiryLabel')} {requiresExpiry && <span className="text-red-500">*</span>}
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
            <label className="text-sm font-medium">{t('notesLabel')}</label>
            <Textarea
              placeholder={t('notesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* File */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('fileLabel')}</label>
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
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
            >
              {isPending ? (
                <><Loader2 className="h-4 w-4 me-2 animate-spin" /> {t('uploading')}</>
              ) : (
                <><Upload className="h-4 w-4 me-2" /> {t('submit')}</>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
