'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils/cn';
import { formatDate, formatFileSize } from '@/lib/utils/format';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Download,
  CheckCircle,
  RotateCcw,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  File as FileIcon,
  FileText,
  FolderOpen,
  Search,
  Loader2,
  Eye,
} from 'lucide-react';
import { PortalFilePreview } from '@/components/portal/portal-file-preview';

// ---------- Types ----------

interface FileWithProject {
  id: string;
  file_name: string;
  file_type: string;
  file_size?: number;
  added_at: string;
  project_id: string;
  project_name: string;
  approval: {
    id: string;
    status: 'pending' | 'approved' | 'revision_requested';
    comment: string | null;
  } | null;
}

// ---------- Helpers ----------

const approvalStatusConfig: Record<string, { label: string; className: string }> = {
  pending: {
    label: 'بانتظار المراجعة',
    className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  },
  approved: {
    label: 'تمت الموافقة',
    className: 'bg-green-500/10 text-green-600 border-green-500/20',
  },
  revision_requested: {
    label: 'مطلوب تعديل',
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  },
};

const approvalFilterOptions = [
  { value: 'all', label: 'جميع الحالات' },
  { value: 'pending', label: 'بانتظار المراجعة' },
  { value: 'approved', label: 'تمت الموافقة' },
  { value: 'revision_requested', label: 'مطلوب تعديل' },
];

function isNewFile(addedAt: string): boolean {
  const added = new Date(addedAt).getTime();
  return Date.now() - added < 48 * 60 * 60 * 1000;
}

function getFileIcon(fileType: string) {
  const type = fileType.toLowerCase();
  if (type.startsWith('image/')) return FileImage;
  if (type.startsWith('video/')) return FileVideo;
  if (type.startsWith('audio/')) return FileAudio;
  if (type.includes('zip') || type.includes('rar') || type.includes('archive'))
    return FileArchive;
  if (type.includes('pdf') || type.includes('document') || type.includes('word'))
    return FileText;
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv'))
    return FileSpreadsheet;
  if (type.includes('html') || type.includes('javascript') || type.includes('json') || type.includes('css'))
    return FileCode;
  return FileIcon;
}

// ---------- Component ----------

export default function PortalFilesPage() {
  const [files, setFiles] = useState<FileWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Revision dialog
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [revisionFileId, setRevisionFileId] = useState<string | null>(null);
  const [revisionComment, setRevisionComment] = useState('');
  const [revisionLoading, setRevisionLoading] = useState(false);

  // Approve loading
  const [approveLoading, setApproveLoading] = useState<string | null>(null);

  // File preview
  const [previewFile, setPreviewFile] = useState<FileWithProject | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/files');
      const json = await res.json();
      if (res.ok && json.data) {
        // API returns mime_type; frontend expects file_type
        const mapped: FileWithProject[] = (json.data as Array<Record<string, unknown>>).map((f) => ({
          id: f.id as string,
          file_name: f.file_name as string,
          file_type: (f.mime_type || f.file_type || 'application/octet-stream') as string,
          file_size: f.file_size as number | undefined,
          added_at: (f.created_at || f.added_at) as string,
          project_id: f.project_id as string,
          project_name: f.project_name as string,
          approval: f.approval as FileWithProject['approval'],
        }));
        setFiles(mapped);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Unique projects for filter dropdown
  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of files) {
      if (!map.has(f.project_id)) {
        map.set(f.project_id, f.project_name);
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [files]);

  // Filter files
  const filteredFiles = useMemo(() => {
    let list = files;
    if (projectFilter !== 'all') {
      list = list.filter((f) => f.project_id === projectFilter);
    }
    if (statusFilter !== 'all') {
      list = list.filter((f) => {
        if (statusFilter === 'pending') {
          return !f.approval || f.approval.status === 'pending';
        }
        return f.approval?.status === statusFilter;
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((f) => f.file_name.toLowerCase().includes(q));
    }
    return list;
  }, [files, projectFilter, statusFilter, search]);

  // ---------- Actions ----------

  async function handleApprove(fileId: string) {
    setApproveLoading(fileId);
    try {
      const res = await fetch(`/api/portal/files/${fileId}/approve`, {
        method: 'POST',
      });
      if (res.ok) {
        toast.success('تمت الموافقة على الملف بنجاح');
        await fetchFiles();
      } else {
        toast.error('حدث خطأ أثناء الموافقة على الملف');
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setApproveLoading(null);
    }
  }

  async function handleRevisionSubmit() {
    if (!revisionFileId || !revisionComment.trim()) return;
    if (revisionComment.trim().length > 5000) {
      toast.error('التعليق طويل جداً (الحد الأقصى 5000 حرف)');
      return;
    }
    setRevisionLoading(true);
    try {
      const res = await fetch(`/api/portal/files/${revisionFileId}/revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: revisionComment.trim() }),
      });
      if (res.ok) {
        toast.success('تم إرسال طلب التعديل بنجاح');
        setRevisionDialogOpen(false);
        setRevisionComment('');
        setRevisionFileId(null);
        await fetchFiles();
      } else {
        toast.error('حدث خطأ أثناء إرسال طلب التعديل');
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setRevisionLoading(false);
    }
  }

  function handleDownload(fileId: string) {
    window.open(`/api/portal/files/${fileId}/download`, '_blank');
  }

  // ---------- Loading ----------

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56 mt-2" />
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-64" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  // ---------- Render ----------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">الملفات</h1>
        <p className="text-muted-foreground text-sm mt-1">
          استعرض جميع ملفات مشاريعك وحمّلها
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end flex-wrap">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">المشروع</Label>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="جميع المشاريع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع المشاريع</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">حالة الموافقة</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="جميع الحالات" />
            </SelectTrigger>
            <SelectContent>
              {approvalFilterOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative w-full sm:w-64 sm:ms-auto">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث عن ملف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
      </div>

      {/* Files Table / List */}
      {filteredFiles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-orange-500/10 flex items-center justify-center mb-4">
              <FolderOpen className="h-7 w-7 text-orange-500" />
            </div>
            <h2 className="text-lg font-semibold mb-2">لا توجد ملفات</h2>
            <p className="text-muted-foreground text-sm max-w-md">
              لا توجد ملفات تطابق معايير البحث الحالية
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Table Header (desktop) */}
          <div className="hidden lg:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-muted-foreground">
            <div className="col-span-4">اسم الملف</div>
            <div className="col-span-2">المشروع</div>
            <div className="col-span-2">الحالة</div>
            <div className="col-span-1">الحجم</div>
            <div className="col-span-1">التاريخ</div>
            <div className="col-span-2 text-end">الإجراءات</div>
          </div>

          {filteredFiles.map((file) => {
            const FileTypeIcon = getFileIcon(file.file_type);
            const approval = file.approval;
            const approvalStatus = approval
              ? approvalStatusConfig[approval.status]
              : null;

            return (
              <Card key={file.id}>
                <CardContent className="py-3">
                  {/* Desktop: Table Row */}
                  <div className="hidden lg:grid grid-cols-12 gap-4 items-center">
                    <div className="col-span-4 flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                        <FileTypeIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <span
                        className="text-sm truncate cursor-pointer hover:text-orange-500 transition-colors"
                        onClick={() => { setPreviewFile(file); setPreviewOpen(true); }}
                      >
                        {file.file_name}
                      </span>
                      {isNewFile(file.added_at) && (
                        <Badge className="text-[9px] px-1.5 py-0 bg-orange-500 text-white border-0 shrink-0">
                          جديد
                        </Badge>
                      )}
                    </div>
                    <div className="col-span-2 text-sm text-muted-foreground truncate">
                      {file.project_name}
                    </div>
                    <div className="col-span-2">
                      {approvalStatus ? (
                        <Badge
                          className={cn(
                            'text-[10px] px-2 py-0',
                            approvalStatus.className
                          )}
                        >
                          {approvalStatus.label}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="col-span-1 text-xs text-muted-foreground">
                      {file.file_size != null ? formatFileSize(file.file_size) : '—'}
                    </div>
                    <div className="col-span-1 text-xs text-muted-foreground">
                      {formatDate(file.added_at)}
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setPreviewFile(file); setPreviewOpen(true); }}
                        className="h-8 w-8 p-0 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10"
                        title="معاينة"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(file.id)}
                        className="h-8 w-8 p-0"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {(!approval || approval.status === 'pending') && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleApprove(file.id)}
                            disabled={approveLoading === file.id}
                            className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-500/10"
                          >
                            {approveLoading === file.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRevisionFileId(file.id);
                              setRevisionDialogOpen(true);
                            }}
                            className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Mobile: Card Layout */}
                  <div className="lg:hidden flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <FileTypeIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className="text-sm font-medium truncate cursor-pointer hover:text-orange-500 transition-colors"
                          onClick={() => { setPreviewFile(file); setPreviewOpen(true); }}
                        >
                          {file.file_name}
                        </p>
                        {isNewFile(file.added_at) && (
                          <Badge className="text-[9px] px-1.5 py-0 bg-orange-500 text-white border-0 shrink-0">
                            جديد
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>{file.project_name}</span>
                        {file.file_size != null && (
                          <>
                            <span>&middot;</span>
                            <span>{formatFileSize(file.file_size)}</span>
                          </>
                        )}
                        {approvalStatus && (
                          <Badge
                            className={cn(
                              'text-[10px] px-2 py-0',
                              approvalStatus.className
                            )}
                          >
                            {approvalStatus.label}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setPreviewFile(file); setPreviewOpen(true); }}
                        className="h-8 w-8 p-0 text-orange-500"
                        title="معاينة"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(file.id)}
                        className="h-8 w-8 p-0"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {(!approval || approval.status === 'pending') && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleApprove(file.id)}
                            disabled={approveLoading === file.id}
                            className="h-8 w-8 p-0 text-green-600"
                          >
                            {approveLoading === file.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRevisionFileId(file.id);
                              setRevisionDialogOpen(true);
                            }}
                            className="h-8 w-8 p-0 text-amber-600"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Revision Dialog */}
      <Dialog open={revisionDialogOpen} onOpenChange={setRevisionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>طلب تعديل</DialogTitle>
            <DialogDescription>
              أضف ملاحظاتك حول التعديلات المطلوبة على هذا الملف
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="revision-comment-files">الملاحظات</Label>
            <textarea
              id="revision-comment-files"
              value={revisionComment}
              onChange={(e) => setRevisionComment(e.target.value)}
              placeholder="اكتب ملاحظاتك هنا..."
              maxLength={5000}
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              required
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setRevisionDialogOpen(false);
                setRevisionComment('');
                setRevisionFileId(null);
              }}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleRevisionSubmit}
              disabled={revisionLoading || !revisionComment.trim()}
              className="gap-2 bg-amber-500 hover:bg-amber-600 text-white"
            >
              {revisionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              إرسال طلب التعديل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Preview */}
      <PortalFilePreview
        file={
          previewFile
            ? {
                id: previewFile.id,
                file_name: previewFile.file_name,
                file_type: previewFile.file_type,
                file_size: previewFile.file_size,
              }
            : null
        }
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </div>
  );
}
