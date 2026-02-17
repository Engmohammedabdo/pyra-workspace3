'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  History,
  RotateCcw,
  Trash2,
  Download,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { formatFileSize, formatRelativeDate } from '@/lib/utils/format';
import { toast } from 'sonner';

interface FileVersion {
  id: string;
  file_path: string;
  version_path: string;
  version_number: number;
  file_size: number;
  mime_type: string;
  created_by: string;
  created_at: string;
}

interface VersionHistoryProps {
  filePath: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a restore so parent can refresh */
  onRestored?: () => void;
}

export function VersionHistory({ filePath, open, onOpenChange, onRestored }: VersionHistoryProps) {
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<FileVersion | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FileVersion | null>(null);

  const fetchVersions = useCallback(async () => {
    if (!filePath) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/files/versions?file_path=${encodeURIComponent(filePath)}`);
      const json = await res.json();
      if (json.data) setVersions(json.data);
    } catch (err) {
      console.error(err);
      toast.error('فشل تحميل تاريخ النسخ');
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => {
    if (open && filePath) {
      fetchVersions();
    }
  }, [open, filePath, fetchVersions]);

  const handleRestore = async (version: FileVersion) => {
    setConfirmRestore(null);
    setActionLoading(version.id);
    try {
      const res = await fetch(`/api/files/versions/${version.id}/restore`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        toast.success(`تم استعادة النسخة ${version.version_number}`);
        fetchVersions();
        onRestored?.();
      }
    } catch {
      toast.error('فشل استعادة النسخة');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (version: FileVersion) => {
    setConfirmDelete(null);
    setActionLoading(version.id);
    try {
      const res = await fetch(`/api/files/versions/${version.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        toast.success('تم حذف النسخة');
        fetchVersions();
      }
    } catch {
      toast.error('فشل حذف النسخة');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownload = async (version: FileVersion) => {
    try {
      const encodedPath = version.version_path
        .split('/')
        .map(encodeURIComponent)
        .join('/');
      const url = `/api/files/download/${encodedPath}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = `v${version.version_number}_${version.file_path.split('/').pop() || 'file'}`;
      a.click();
    } catch {
      toast.error('فشل تحميل النسخة');
    }
  };

  const fileName = filePath?.split('/').pop() || '';

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="p-4 border-b space-y-0">
            <div className="flex items-center gap-3">
              <History className="h-5 w-5 text-orange-500" />
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-base">تاريخ النسخ</SheetTitle>
                <SheetDescription className="text-xs truncate">
                  {decodeURIComponent(fileName)}
                </SheetDescription>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {versions.length} نسخة
              </Badge>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-auto p-4 space-y-3">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))
            ) : versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <FileText className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">لا توجد نسخ سابقة</p>
                <p className="text-xs mt-1">
                  تُحفظ النسخ تلقائياً عند رفع ملف بنفس الاسم
                </p>
              </div>
            ) : (
              versions.map((version, index) => (
                <div
                  key={version.id}
                  className={`rounded-lg border p-3 transition-colors hover:bg-muted/30 ${
                    index === 0 ? 'border-orange-200 bg-orange-50/50 dark:border-orange-900/30 dark:bg-orange-950/10' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={index === 0 ? 'default' : 'secondary'}
                        className={index === 0 ? 'bg-orange-500 hover:bg-orange-600' : ''}
                      >
                        v{version.version_number}
                      </Badge>
                      {index === 0 && (
                        <span className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">
                          أحدث نسخة
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {formatRelativeDate(version.created_at)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                    <span>{formatFileSize(version.file_size)}</span>
                    <span>·</span>
                    <span>{version.created_by}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setConfirmRestore(version)}
                      disabled={!!actionLoading}
                    >
                      <RotateCcw className="h-3 w-3 me-1" />
                      استعادة
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleDownload(version)}
                      disabled={!!actionLoading}
                    >
                      <Download className="h-3 w-3 me-1" />
                      تحميل
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive ms-auto"
                      onClick={() => setConfirmDelete(version)}
                      disabled={!!actionLoading}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Restore Confirmation Dialog */}
      <Dialog open={!!confirmRestore} onOpenChange={() => setConfirmRestore(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-orange-500" /> استعادة النسخة
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            هل تريد استعادة <strong>النسخة {confirmRestore?.version_number}</strong>؟
            <br />
            سيتم حفظ الملف الحالي كنسخة جديدة تلقائياً.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRestore(null)}>إلغاء</Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600"
              onClick={() => confirmRestore && handleRestore(confirmRestore)}
            >
              استعادة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> حذف النسخة
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            هل أنت متأكد من حذف <strong>النسخة {confirmDelete?.version_number}</strong>؟
            <br />
            لا يمكن التراجع عن هذا الإجراء.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
            >
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
