'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils/cn';
import { formatDate, formatFileSize } from '@/lib/utils/format';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  Folder,
  Search,
  Loader2,
  Eye,
  ChevronDown,
  ChevronLeft,
} from 'lucide-react';
import { PortalFilePreview } from '@/components/portal/portal-file-preview';

// ---------- Types ----------

interface FileWithProject {
  id: string;
  file_name: string;
  file_type: string;
  file_path: string;
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

interface FolderGroup {
  folder: string;
  folderLabel: string;
  files: FileWithProject[];
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
  if (type.includes('html') || type.includes('javascript') || type.includes('json') || type.includes('css') || type.includes('markdown'))
    return FileCode;
  return FileIcon;
}

/** Extract subfolder name from file_path relative to the project storage_path.
 *  e.g. "projects/injazat/Etmam/Brand-Guideline/file.pdf" → "Brand-Guideline"
 *  e.g. "projects/injazat/Etmam/file.pdf" → "" (root)
 */
function extractSubfolder(filePath: string): string {
  // path pattern: projects/{company}/{project}/{subfolder}/.../{file}
  const parts = filePath.split('/');
  // minimum: projects/company/project/file = 4 parts → root
  // subfolder: projects/company/project/subfolder/file = 5+ parts
  if (parts.length <= 4) return '';
  // The subfolder is parts[3] (0-indexed), but it could be deeper
  // Actually, take everything between project folder and filename
  // Root = 3 folder parts (projects/company/project) + filename
  return parts.slice(3, parts.length - 1).join('/');
}

/** Format folder name for display: "legal-research/scripts" → "Legal Research / Scripts" */
function formatFolderName(folder: string): string {
  if (!folder) return 'ملفات عامة';
  return folder
    .split('/')
    .map((part) =>
      part
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    )
    .join(' / ');
}

/** Group files by their subfolder */
function groupFilesByFolder(files: FileWithProject[]): FolderGroup[] {
  const map = new Map<string, FileWithProject[]>();

  for (const f of files) {
    const folder = extractSubfolder(f.file_path);
    if (!map.has(folder)) map.set(folder, []);
    map.get(folder)!.push(f);
  }

  // Sort: root files first, then alphabetical
  const groups = Array.from(map.entries())
    .map(([folder, files]) => ({
      folder,
      folderLabel: formatFolderName(folder),
      files,
    }))
    .sort((a, b) => {
      if (a.folder === '') return -1;
      if (b.folder === '') return 1;
      return a.folder.localeCompare(b.folder);
    });

  return groups;
}

// ---------- Component ----------

export default function PortalFilesPage() {
  const [files, setFiles] = useState<FileWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

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
        const mapped: FileWithProject[] = (json.data as Array<Record<string, unknown>>).map((f) => ({
          id: f.id as string,
          file_name: f.file_name as string,
          file_type: (f.mime_type || f.file_type || 'application/octet-stream') as string,
          file_path: (f.file_path || '') as string,
          file_size: f.file_size as number | undefined,
          added_at: (f.created_at || f.added_at) as string,
          project_id: f.project_id as string,
          project_name: f.project_name as string,
          approval: f.approval as FileWithProject['approval'],
        }));
        setFiles(mapped);
      }
    } catch {
      toast.error('فشل في تحميل الملفات');
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

  // Group filtered files by folder
  const folderGroups = useMemo(() => groupFilesByFolder(filteredFiles), [filteredFiles]);

  const toggleFolder = (folder: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  // ---------- Actions ----------

  async function handleApprove(fileId: string) {
    setApproveLoading(fileId);
    try {
      const res = await fetch(`/api/portal/files/${fileId}/approve`, { method: 'POST' });
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

  // ---------- File Row ----------

  function FileRow({ file }: { file: FileWithProject }) {
    const FileTypeIcon = getFileIcon(file.file_type);
    const approval = file.approval;
    const approvalStatus = approval ? approvalStatusConfig[approval.status] : null;

    return (
      <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors border-b last:border-b-0">
        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
          <FileTypeIcon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
            {file.file_size != null && <span>{formatFileSize(file.file_size)}</span>}
            <span>&middot;</span>
            <span>{formatDate(file.added_at)}</span>
            {approvalStatus && (
              <>
                <span>&middot;</span>
                <Badge className={cn('text-[9px] px-1.5 py-0', approvalStatus.className)}>
                  {approvalStatus.label}
                </Badge>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
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
            title="تحميل"
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
                title="موافقة"
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
                title="طلب تعديل"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    );
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
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
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

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{filteredFiles.length} ملف</span>
        <span>&middot;</span>
        <span>{folderGroups.length} {folderGroups.length === 1 ? 'قسم' : 'أقسام'}</span>
        {filteredFiles.length !== files.length && (
          <>
            <span>&middot;</span>
            <span>من أصل {files.length}</span>
          </>
        )}
      </div>

      {/* Files grouped by folder */}
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
        <div className="space-y-4">
          {folderGroups.map((group) => {
            const isCollapsed = collapsedFolders.has(group.folder);
            return (
              <Card key={group.folder} className="overflow-hidden">
                {/* Folder Header */}
                <button
                  onClick={() => toggleFolder(group.folder)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors border-b"
                >
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                    <Folder className="h-4 w-4 text-orange-600" />
                  </div>
                  <div className="flex-1 text-start min-w-0">
                    <h3 className="text-sm font-semibold">{group.folderLabel}</h3>
                    <p className="text-[11px] text-muted-foreground">
                      {group.files.length} {group.files.length === 1 ? 'ملف' : 'ملفات'}
                      {group.files.reduce((sum, f) => sum + (f.file_size || 0), 0) > 0 && (
                        <> &middot; {formatFileSize(group.files.reduce((sum, f) => sum + (f.file_size || 0), 0))}</>
                      )}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-muted-foreground transition-transform duration-200',
                      isCollapsed && '-rotate-90'
                    )}
                  />
                </button>

                {/* Files */}
                {!isCollapsed && (
                  <div>
                    {group.files.map((file) => (
                      <FileRow key={file.id} file={file} />
                    ))}
                  </div>
                )}
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
