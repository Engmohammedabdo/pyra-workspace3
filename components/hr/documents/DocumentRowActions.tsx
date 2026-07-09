'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { MoreHorizontal, Download, Pencil, Trash2, Loader2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useUpdateEmployeeDocument, useDeleteEmployeeDocument } from '@/hooks/useEmployeeDocuments';
import { useDocumentTypes } from '@/hooks/useDocumentTypes';
import type { PyraEmployeeDocument } from '@/types/database';
import type { Locale } from '@/lib/i18n/config';

interface Props { doc: PyraEmployeeDocument }

export function DocumentRowActions({ doc }: Props) {
  const t = useTranslations('hr.documents.rowActions');
  const locale = useLocale() as Locale;
  const { data: docTypes = [] } = useDocumentTypes();
  const updateMut = useUpdateEmployeeDocument();
  const deleteMut = useDeleteEmployeeDocument();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Edit form state
  const [typeId, setTypeId] = useState(doc.type_id);
  const [label, setLabel] = useState(doc.label ?? '');
  const [expiryDate, setExpiryDate] = useState(doc.expiry_date ?? '');
  const [notes, setNotes] = useState(doc.notes ?? '');

  function openEdit() {
    setTypeId(doc.type_id);
    setLabel(doc.label ?? '');
    setExpiryDate(doc.expiry_date ?? '');
    setNotes(doc.notes ?? '');
    setEditOpen(true);
  }

  function handleDownload() {
    if (!doc.signed_url) { toast.error(t('toasts.downloadUnavailable')); return; }
    window.open(doc.signed_url, '_blank', 'noopener,noreferrer');
  }

  async function handleSave() {
    try {
      await updateMut.mutateAsync({
        id: doc.id,
        type_id: typeId,
        label: label || null,
        expiry_date: expiryDate || null,
        notes: notes || null,
      } as Parameters<typeof updateMut.mutateAsync>[0]);
      toast.success(t('toasts.updateSuccess'));
      setEditOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('toasts.updateFailed'));
    }
  }

  async function handleDelete() {
    try {
      await deleteMut.mutateAsync(doc.id);
      toast.success(t('toasts.deleteSuccess'));
      setDeleteOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('toasts.deleteFailed'));
    }
  }

  const activeTypes = docTypes.filter((dt) => dt.is_active);
  const selectedType = docTypes.find((dt) => dt.id === typeId);
  const requiresExpiry = selectedType?.requires_expiry ?? false;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">{t('optionsAria')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleDownload}>
            <Download className="h-4 w-4 me-2" />
            {t('download')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openEdit}>
            <Pencil className="h-4 w-4 me-2" />
            {t('edit')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="text-red-600 dark:text-red-400"
          >
            <Trash2 className="h-4 w-4 me-2" />
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('editDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('editDialog.typeLabel')}</label>
              <Select value={typeId} onValueChange={(v) => { setTypeId(v); setExpiryDate(''); }}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activeTypes.map((dt) => (
                    <SelectItem key={dt.id} value={dt.id}>
                      {locale === 'ar' ? dt.name_ar : (dt.name || dt.name_ar)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('editDialog.labelLabel')}</label>
              <Input className="h-11" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t('editDialog.expiryLabel')} {requiresExpiry && <span className="text-red-500">*</span>}
              </label>
              <Input
                type="date"
                className="h-11"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('editDialog.notesLabel')}</label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>
                {t('editDialog.cancel')}
              </Button>
              <Button
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                onClick={handleSave}
                disabled={updateMut.isPending || (requiresExpiry && !expiryDate)}
              >
                {updateMut.isPending ? (
                  <><Loader2 className="h-4 w-4 me-2 animate-spin" /> {t('editDialog.saving')}</>
                ) : t('editDialog.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('deleteDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              {t('deleteDialog.confirmText')}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                {t('deleteDialog.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? (
                  <Loader2 className="h-4 w-4 me-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 me-2" />
                )}
                {t('deleteDialog.delete')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
