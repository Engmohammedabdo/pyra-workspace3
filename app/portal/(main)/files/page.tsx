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
  File as FileIconLucide,
  FileText,
  FolderOpen,
  Folder,
  Search,
  Loader2,
  Eye,
  ChevronLeft,
  LayoutGrid,
  List,
  ChevronRight,
  Home,
} from 'lucide-react';
import { PortalFilePreview } from '@/components/portal/portal-file-preview';
import { PdfThumbnail } from '@/components/portal/pdf-thumbnail';
import { resolveMimeType } from '@/lib/utils/mime';

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

interface TreeFolder {
  name: string;
  label: string;
  fileCount: number;
  totalSize: number;
}

interface LevelContents {
  folders: TreeFolder[];
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

function isImageType(fileType: string): boolean {
  return fileType.toLowerCase().startsWith('image/');
}

function isPdfType(fileType: string): boolean {
  return fileType.toLowerCase() === 'application/pdf';
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
  return FileIconLucide;
}

function getFileColorBg(fileType: string): string {
  const type = fileType.toLowerCase();
  if (type.startsWith('image/')) return 'bg-emerald-50 text-emerald-500';
  if (type.startsWith('video/')) return 'bg-purple-50 text-purple-500';
  if (type.startsWith('audio/')) return 'bg-pink-50 text-pink-500';
  if (type.includes('zip') || type.includes('rar') || type.includes('archive'))
    return 'bg-amber-50 text-amber-600';
  if (type.includes('pdf'))
    return 'bg-red-50 text-red-500';
  if (type.includes('document') || type.includes('word'))
    return 'bg-blue-50 text-blue-500';
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv'))
    return 'bg-green-50 text-green-600';
  if (type.includes('html') || type.includes('javascript') || type.includes('json') || type.includes('css') || type.includes('markdown'))
    return 'bg-cyan-50 text-cyan-500';
  return 'bg-gray-50 text-gray-400';
}

/**
 * Extract subfolder parts from a file path as an array.
 * Path format: projects/{company}/{project}/{sub1}/{sub2}/.../filename
 * Returns: ['sub1', 'sub2', ...] (empty array if file is at project root)
 */
function getSubfolderParts(filePath: string): string[] {
  const parts = filePath.split('/');
  // parts: ['projects', company, project, sub1, sub2, ..., filename]
  if (parts.length <= 4) return []; // file at project root
  return parts.slice(3, parts.length - 1);
}

/**
 * Format a single folder segment name for display.
 * Replaces dashes/underscores with spaces, capitalizes words.
 */
function formatSegmentName(segment: string): string {
  return segment
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Given all files and the current navigation path,
 * compute what's visible at this level:
 * - folders: immediate child directories
 * - files: files that live at exactly this depth
 */
function getItemsAtLevel(files: FileWithProject[], currentPath: string[]): LevelContents {
  const depth = currentPath.length;
  const folderMap = new Map<string, { count: number; totalSize: number }>();
  const filesAtLevel: FileWithProject[] = [];

  for (const file of files) {
    const parts = getSubfolderParts(file.file_path);

    // Check if file is under the current path
    let matches = true;
    for (let i = 0; i < depth; i++) {
      if (i >= parts.length || parts[i] !== currentPath[i]) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;

    if (parts.length === depth) {
      // File is exactly at this level (no deeper subfolder)
      filesAtLevel.push(file);
    } else if (parts.length > depth) {
      // File is in a child folder — count the immediate child folder
      const folderName = parts[depth];
      const existing = folderMap.get(folderName) || { count: 0, totalSize: 0 };
      existing.count++;
      existing.totalSize += file.file_size || 0;
      folderMap.set(folderName, existing);
    }
  }

  const folders: TreeFolder[] = Array.from(folderMap.entries())
    .map(([name, info]) => ({
      name,
      label: formatSegmentName(name),
      fileCount: info.count,
      totalSize: info.totalSize,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { folders, files: filesAtLevel };
}

// ---------- Sub-Components ----------

function FolderCard({
  folder,
  onClick,
}: {
  folder: TreeFolder;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-muted/40 hover:shadow-md transition-all duration-200 text-start min-w-[180px] max-w-[240px] shrink-0 group"
    >
      <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center shrink-0 group-hover:bg-orange-200 transition-colors">
        <Folder className="h-5 w-5 text-orange-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{folder.label}</p>
        <p className="text-[11px] text-muted-foreground">
          {folder.fileCount} ملف
          {folder.totalSize > 0 && <> · {formatFileSize(folder.totalSize)}</>}
        </p>
      </div>
    </button>
  );
}

function FileCard({
  file,
  onPreview,
  onDownload,
  onApprove,
  onRevision,
  approveLoading,
}: {
  file: FileWithProject;
  onPreview: () => void;
  onDownload: () => void;
  onApprove: () => void;
  onRevision: () => void;
  approveLoading: boolean;
}) {
  const FileTypeIcon = getFileIcon(file.file_type);
  const colorBg = getFileColorBg(file.file_type);
  const approval = file.approval;
  const approvalStatus = approval ? approvalStatusConfig[approval.status] : null;
  const isImage = isImageType(file.file_type);
  const isPdf = isPdfType(file.file_type);
  const [imgError, setImgError] = useState(false);
  const canAct = !approval || approval.status === 'pending';

  return (
    <div
      className="group relative rounded-xl border bg-card overflow-hidden hover:shadow-lg hover:border-orange-200 transition-all duration-200 cursor-pointer"
      onClick={onPreview}
    >
      {/* Thumbnail / Icon Area */}
      <div className="aspect-[4/3] relative overflow-hidden bg-muted/20">
        {isImage && !imgError ? (
          <img
            src={`/api/portal/files/${file.id}/thumbnail`}
            alt={file.file_name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : isPdf ? (
          <PdfThumbnail
            url={`/api/portal/files/${file.id}/view`}
            fileName={file.file_name}
            className="w-full h-full"
          />
        ) : (
          <div className={cn('w-full h-full flex items-center justify-center', colorBg)}>
            <FileTypeIcon className="h-12 w-12 opacity-80" />
          </div>
        )}

        {/* Hover overlay with actions */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); onPreview(); }}
            className="w-9 h-9 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-lg transition-transform hover:scale-110"
            title="معاينة"
          >
            <Eye className="h-4 w-4 text-gray-700" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
            className="w-9 h-9 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-lg transition-transform hover:scale-110"
            title="تحميل"
          >
            <Download className="h-4 w-4 text-gray-700" />
          </button>
          {canAct && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onApprove(); }}
                disabled={approveLoading}
                className="w-9 h-9 rounded-full bg-green-500/90 hover:bg-green-500 flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                title="موافقة"
              >
                {approveLoading ? (
                  <Loader2 className="h-4 w-4 text-white animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-white" />
                )}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRevision(); }}
                className="w-9 h-9 rounded-full bg-amber-500/90 hover:bg-amber-500 flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                title="طلب تعديل"
              >
                <RotateCcw className="h-4 w-4 text-white" />
              </button>
            </>
          )}
        </div>

        {/* Top badges */}
        <div className="absolute top-2 start-2 flex items-center gap-1">
          {isNewFile(file.added_at) && (
            <Badge className="text-[9px] px-1.5 py-0 bg-orange-500 text-white border-0 shadow-sm">
              جديد
            </Badge>
          )}
          {approvalStatus && (
            <Badge className={cn('text-[9px] px-1.5 py-0 shadow-sm', approvalStatus.className)}>
              {approvalStatus.label}
            </Badge>
          )}
        </div>
      </div>

      {/* File Info */}
      <div className="p-3">
        <p className="text-sm font-medium line-clamp-2 leading-tight mb-1" title={file.file_name}>
          {file.file_name}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {file.file_size != null && (
            <span>{formatFileSize(file.file_size)}</span>
          )}
          {file.file_size != null && <span>·</span>}
          <span>{formatDate(file.added_at)}</span>
        </div>
      </div>
    </div>
  );
}

function FileRow({
  file,
  onPreview,
  onDownload,
  onApprove,
  onRevision,
  approveLoading,
}: {
  file: FileWithProject;
  onPreview: () => void;
  onDownload: () => void;
  onApprove: () => void;
  onRevision: () => void;
  approveLoading: boolean;
}) {
  const FileTypeIcon = getFileIcon(file.file_type);
  const approval = file.approval;
  const approvalStatus = approval ? approvalStatusConfig[approval.status] : null;
  const canAct = !approval || approval.status === 'pending';

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors border-b last:border-b-0">
      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
        <FileTypeIcon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-sm truncate cursor-pointer hover:text-orange-500 transition-colors"
            onClick={onPreview}
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
        <Button variant="ghost" size="sm" onClick={onPreview} className="h-8 w-8 p-0 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10" title="معاينة">
          <Eye className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onDownload} className="h-8 w-8 p-0" title="تحميل">
          <Download className="h-4 w-4" />
        </Button>
        {canAct && (
          <>
            <Button
              variant="ghost" size="sm" onClick={onApprove} disabled={approveLoading}
              className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-500/10" title="موافقة"
            >
              {approveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost" size="sm" onClick={onRevision}
              className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10" title="طلب تعديل"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Main Component ----------

export default function PortalFilesPage() {
  const [files, setFiles] = useState<FileWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPath, setCurrentPath] = useState<string[]>([]);

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

  // Restore view mode from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('portal-files-view');
    if (saved === 'list' || saved === 'grid') setViewMode(saved);
  }, []);

  const toggleViewMode = useCallback((mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('portal-files-view', mode);
  }, []);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/files');
      const json = await res.json();
      if (res.ok && json.data) {
        const mapped: FileWithProject[] = (json.data as Array<Record<string, unknown>>).map((f) => {
          const fileName = f.file_name as string;
          const storedMime = (f.mime_type || f.file_type || null) as string | null;
          return {
            id: f.id as string,
            file_name: fileName,
            file_type: resolveMimeType(fileName, storedMime),
            file_path: (f.file_path || '') as string,
            file_size: f.file_size as number | undefined,
            added_at: (f.created_at || f.added_at) as string,
            project_id: f.project_id as string,
            project_name: f.project_name as string,
            approval: f.approval as FileWithProject['approval'],
          };
        });
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

  // Unique projects
  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of files) {
      if (!map.has(f.project_id)) map.set(f.project_id, f.project_name);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [files]);

  // Filter files
  const filteredFiles = useMemo(() => {
    let list = files;
    if (projectFilter !== 'all') list = list.filter((f) => f.project_id === projectFilter);
    if (statusFilter !== 'all') {
      list = list.filter((f) => {
        if (statusFilter === 'pending') return !f.approval || f.approval.status === 'pending';
        return f.approval?.status === statusFilter;
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((f) => f.file_name.toLowerCase().includes(q));
    }
    return list;
  }, [files, projectFilter, statusFilter, search]);

  // Get folders + files at the current navigation level
  const levelContents = useMemo(
    () => getItemsAtLevel(filteredFiles, currentPath),
    [filteredFiles, currentPath]
  );

  // Count total items in current view
  const totalFolders = levelContents.folders.length;
  const totalFilesAtLevel = levelContents.files.length;

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

  function openPreview(file: FileWithProject) {
    setPreviewFile(file);
    setPreviewOpen(true);
  }

  function openRevision(fileId: string) {
    setRevisionFileId(fileId);
    setRevisionDialogOpen(true);
  }

  // ---------- Render helpers ----------

  function renderFileGrid(fileList: FileWithProject[]) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {fileList.map((file) => (
          <FileCard
            key={file.id}
            file={file}
            onPreview={() => openPreview(file)}
            onDownload={() => handleDownload(file.id)}
            onApprove={() => handleApprove(file.id)}
            onRevision={() => openRevision(file.id)}
            approveLoading={approveLoading === file.id}
          />
        ))}
      </div>
    );
  }

  function renderFileList(fileList: FileWithProject[]) {
    return (
      <Card className="overflow-hidden">
        {fileList.map((file) => (
          <FileRow
            key={file.id}
            file={file}
            onPreview={() => openPreview(file)}
            onDownload={() => handleDownload(file.id)}
            onApprove={() => handleApprove(file.id)}
            onRevision={() => openRevision(file.id)}
            approveLoading={approveLoading === file.id}
          />
        ))}
      </Card>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ---------- Render ----------

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">الملفات</h1>
          <p className="text-muted-foreground text-sm mt-1">
            استعرض جميع ملفات مشاريعك وحمّلها
          </p>
        </div>
        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          <button
            onClick={() => toggleViewMode('grid')}
            className={cn(
              'p-2 rounded-md transition-colors',
              viewMode === 'grid'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title="عرض شبكي"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => toggleViewMode('list')}
            className={cn(
              'p-2 rounded-md transition-colors',
              viewMode === 'list'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title="عرض قائمة"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
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
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
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
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
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
        <span>{filteredFiles.length} ملف إجمالي</span>
        {(totalFolders > 0 || totalFilesAtLevel > 0) && (
          <>
            <span>·</span>
            <span>
              {totalFolders > 0 && <>{totalFolders} مجلد</>}
              {totalFolders > 0 && totalFilesAtLevel > 0 && ' و '}
              {totalFilesAtLevel > 0 && <>{totalFilesAtLevel} ملف</>}
              {' '}في هذا المستوى
            </span>
          </>
        )}
        {filteredFiles.length !== files.length && (
          <>
            <span>·</span>
            <span>من أصل {files.length}</span>
          </>
        )}
      </div>

      {/* Breadcrumb */}
      {currentPath.length > 0 && (
        <div className="flex items-center gap-1.5 text-sm flex-wrap">
          <button
            onClick={() => setCurrentPath([])}
            className="flex items-center gap-1 text-orange-600 hover:text-orange-700 transition-colors font-medium"
          >
            <Home className="h-3.5 w-3.5" />
            الكل
          </button>
          {currentPath.map((segment, idx) => {
            const isLast = idx === currentPath.length - 1;
            return (
              <span key={idx} className="flex items-center gap-1.5">
                <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
                {isLast ? (
                  <span className="font-semibold">
                    {formatSegmentName(segment)}
                  </span>
                ) : (
                  <button
                    onClick={() => setCurrentPath(currentPath.slice(0, idx + 1))}
                    className="text-orange-600 hover:text-orange-700 transition-colors font-medium"
                  >
                    {formatSegmentName(segment)}
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Content */}
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
      ) : totalFolders === 0 && totalFilesAtLevel === 0 ? (
        /* ── Empty level (no folders or files at this depth) ── */
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              هذا المجلد فارغ
            </p>
            {currentPath.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 text-orange-600 hover:text-orange-700"
                onClick={() => setCurrentPath(currentPath.slice(0, -1))}
              >
                <ChevronRight className="h-4 w-4 me-1" />
                رجوع
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        /* ── Current level: Folder cards + files ── */
        <div className="space-y-6">
          {/* Folder Cards */}
          {totalFolders > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                المجلدات
              </h3>
              <div className="flex flex-wrap gap-3">
                {levelContents.folders.map((folder) => (
                  <FolderCard
                    key={folder.name}
                    folder={folder}
                    onClick={() => setCurrentPath([...currentPath, folder.name])}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Files at this level */}
          {totalFilesAtLevel > 0 && (
            <div>
              {totalFolders > 0 && (
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  الملفات
                </h3>
              )}
              {viewMode === 'grid'
                ? renderFileGrid(levelContents.files)
                : renderFileList(levelContents.files)
              }
            </div>
          )}

          {/* Hint when only folders are visible */}
          {totalFilesAtLevel === 0 && totalFolders > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              اضغط على أي مجلد لعرض محتوياته
            </p>
          )}
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
