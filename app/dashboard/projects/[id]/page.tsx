'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { formatDate, formatRelativeDate, formatFileSize } from '@/lib/utils/format';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ArrowRight,
  Download,
  CheckCircle,
  Clock,
  AlertTriangle,
  Briefcase,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  File as FileIcon,
  MessageSquare,
  Send,
  Loader2,
  Eye,
  EyeOff,
  HardDrive,
  RotateCcw,
  Users,
  FolderOpen,
  Folder,
  ChevronDown,
  ChevronLeft,
} from 'lucide-react';

// ---------- Types ----------

interface Project {
  id: string;
  name: string;
  description: string | null;
  client_company: string;
  status: string;
  created_at: string;
  file_count?: number;
  comment_count?: number;
  approved_count?: number;
  pending_count?: number;
  revision_count?: number;
  total_file_size?: number;
  unread_team_comments?: number;
}

interface ProjectFile {
  id: string;
  file_name: string;
  mime_type: string;
  file_path: string;
  file_size?: number;
  client_visible: boolean;
  uploaded_by: string;
  created_at: string;
}

interface Comment {
  id: string;
  project_id: string;
  file_id: string | null;
  author_type: 'client' | 'team';
  author_name: string;
  text: string;
  mentions: string[];
  parent_id: string | null;
  is_read_by_client: boolean;
  is_read_by_team: boolean;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: 'نشط', color: 'bg-green-500/10 text-green-600 border-green-500/20' },
  in_progress: { label: 'قيد التنفيذ', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  review: { label: 'مراجعة', color: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
  completed: { label: 'مكتمل', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  archived: { label: 'مؤرشف', color: 'bg-gray-500/10 text-gray-600 border-gray-500/20' },
};

function getFileIcon(mimeType: string) {
  const type = mimeType.toLowerCase();
  if (type.startsWith('image/')) return FileImage;
  if (type.startsWith('video/')) return FileVideo;
  if (type.startsWith('audio/')) return FileAudio;
  if (type.includes('zip') || type.includes('rar') || type.includes('archive')) return FileArchive;
  if (type.includes('pdf') || type.includes('document') || type.includes('word')) return FileText;
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return FileSpreadsheet;
  if (type.includes('html') || type.includes('javascript') || type.includes('json') || type.includes('css')) return FileCode;
  return FileIcon;
}

/** Extract subfolder from a file_path like "projects/client/Etmam/Subfolder/file.pdf" */
function extractSubfolder(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  // Skip bucket prefix: projects/client/project/... -> grab folder before filename
  if (parts.length >= 5) {
    // e.g., projects/injazat/Etmam/Identity/logo.png -> "Identity"
    return parts.slice(3, -1).join('/') || 'ملفات عامة';
  }
  return 'ملفات عامة';
}

/** Pretty-print folder name */
function formatFolderName(folder: string): string {
  if (folder === 'ملفات عامة') return folder;
  return folder
    .split('/')
    .map((s) => decodeURIComponent(s).replace(/[-_]/g, ' '))
    .join(' / ');
}

/** Group files by subfolder */
function groupFilesByFolder(files: ProjectFile[]): Record<string, ProjectFile[]> {
  const groups: Record<string, ProjectFile[]> = {};
  for (const file of files) {
    const folder = extractSubfolder(file.file_path);
    if (!groups[folder]) groups[folder] = [];
    groups[folder].push(file);
  }
  // Sort: ملفات عامة first, then alphabetical
  const sorted: Record<string, ProjectFile[]> = {};
  const keys = Object.keys(groups).sort((a, b) => {
    if (a === 'ملفات عامة') return -1;
    if (b === 'ملفات عامة') return 1;
    return a.localeCompare(b);
  });
  for (const key of keys) {
    sorted[key] = groups[key].sort((a, b) => a.file_name.localeCompare(b.file_name));
  }
  return sorted;
}

/** Render comment text with @mentions highlighted */
function renderTextWithMentions(text: string) {
  const mentionRegex = /@([\w\u0600-\u06FF]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={match.index} className="text-orange-600 font-semibold">
        @{match[1]}
      </span>
    );
    lastIndex = mentionRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

// ---------- Component ----------

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filesLoading, setFilesLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [visibilityUpdating, setVisibilityUpdating] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);

  // Fetch project details
  const fetchProject = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const json = await res.json();
      if (json.data) setProject(json.data);
      else toast.error(json.error || 'فشل في جلب بيانات المشروع');
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Fetch project files
  const fetchFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/files`);
      const json = await res.json();
      if (json.data) setFiles(json.data);
    } catch {
      console.error('Failed to fetch files');
    } finally {
      setFilesLoading(false);
    }
  }, [projectId]);

  // Fetch project comments
  const fetchComments = useCallback(async () => {
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/comments?project_id=${projectId}`);
      const json = await res.json();
      if (json.data) setComments(json.data);
    } catch {
      console.error('Failed to fetch comments');
    } finally {
      setCommentsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
    fetchFiles();
    fetchComments();
  }, [fetchProject, fetchFiles, fetchComments]);

  // Group files by folder
  const groupedFiles = useMemo(() => groupFilesByFolder(files), [files]);

  // Visibility stats
  const visibleCount = useMemo(() => files.filter((f) => f.client_visible).length, [files]);

  // Toggle file visibility — optimistic update + API call
  const toggleVisibility = useCallback(
    async (fileIds: string[], newVisible: boolean) => {
      // Optimistic update
      setFiles((prev) =>
        prev.map((f) => (fileIds.includes(f.id) ? { ...f, client_visible: newVisible } : f))
      );

      // Track updating state for UI feedback
      setVisibilityUpdating((prev) => {
        const next = new Set(prev);
        fileIds.forEach((id) => next.add(id));
        return next;
      });

      try {
        const res = await fetch(`/api/projects/${projectId}/files/visibility`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_ids: fileIds, client_visible: newVisible }),
        });
        const json = await res.json();
        if (json.error) {
          // Revert on error
          setFiles((prev) =>
            prev.map((f) => (fileIds.includes(f.id) ? { ...f, client_visible: !newVisible } : f))
          );
          toast.error(json.error);
        }
      } catch {
        // Revert on network error
        setFiles((prev) =>
          prev.map((f) => (fileIds.includes(f.id) ? { ...f, client_visible: !newVisible } : f))
        );
        toast.error('فشل في تحديث ظهور الملفات');
      } finally {
        setVisibilityUpdating((prev) => {
          const next = new Set(prev);
          fileIds.forEach((id) => next.delete(id));
          return next;
        });
      }
    },
    [projectId]
  );

  // Toggle all files in a folder
  const toggleFolderVisibility = useCallback(
    (folderFiles: ProjectFile[]) => {
      const allVisible = folderFiles.every((f) => f.client_visible);
      const ids = folderFiles.map((f) => f.id);
      toggleVisibility(ids, !allVisible);
    },
    [toggleVisibility]
  );

  // Toggle single file
  const toggleSingleFileVisibility = useCallback(
    (file: ProjectFile) => {
      toggleVisibility([file.id], !file.client_visible);
    },
    [toggleVisibility]
  );

  // Toggle all files
  const toggleAllVisibility = useCallback(() => {
    const allVisible = files.every((f) => f.client_visible);
    const ids = files.map((f) => f.id);
    toggleVisibility(ids, !allVisible);
  }, [files, toggleVisibility]);

  // Toggle folder collapse
  const toggleFolder = (folder: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [folder]: !prev[folder] }));
  };

  // Sync files from Storage → pyra_project_files
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/files/sync`, { method: 'POST' });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        const d = json.data;
        if (d.synced > 0) {
          toast.success(d.message);
          fetchFiles(); // Reload file list
        } else {
          toast.info(d.message);
        }
      }
    } catch {
      toast.error('فشل في مزامنة الملفات');
    } finally {
      setSyncing(false);
    }
  };

  // Submit new comment
  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setCommentLoading(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, text: newComment.trim() }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        setNewComment('');
        fetchComments();
        toast.success('تم إرسال التعليق');
      }
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setCommentLoading(false);
    }
  };

  // Download file
  const handleDownload = async (file: ProjectFile) => {
    try {
      const pathSegments = file.file_path.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(`/api/files/download/${pathSegments}`);
      if (!res.ok) {
        toast.error('فشل في تحميل الملف');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('حدث خطأ في التحميل');
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Briefcase className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h2 className="text-lg font-semibold">المشروع غير موجود</h2>
        <p className="text-muted-foreground text-sm mt-1">قد يكون تم حذفه أو لا تملك صلاحية الوصول</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/dashboard/projects')}>
          <ArrowRight className="h-4 w-4 me-2" /> الرجوع للمشاريع
        </Button>
      </div>
    );
  }

  const status = STATUS_MAP[project.status] || { label: project.status, color: '' };
  const allVisible = files.length > 0 && files.every((f) => f.client_visible);
  const someVisible = files.some((f) => f.client_visible);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/projects')}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <Badge className={cn('border', status.color)}>{status.label}</Badge>
            </div>
            {project.description && (
              <p className="text-muted-foreground text-sm mt-1">{project.description}</p>
            )}
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>{project.client_company}</span>
              <span>·</span>
              <span>{formatDate(project.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{project.file_count ?? files.length}</p>
                  <p className="text-xs text-muted-foreground">ملفات</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{project.approved_count ?? 0}</p>
                  <p className="text-xs text-muted-foreground">موافقات</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <MessageSquare className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{project.comment_count ?? comments.length}</p>
                  <p className="text-xs text-muted-foreground">تعليقات</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <HardDrive className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatFileSize(project.total_file_size || 0)}</p>
                  <p className="text-xs text-muted-foreground">حجم الملفات</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Files Section — Folder-grouped with visibility checkboxes */}
          <div className="lg:col-span-3 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" /> ملفات المشروع
                  </CardTitle>
                  <div className="flex items-center gap-3">
                    {/* Sync from Storage */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1.5 text-xs"
                          onClick={handleSync}
                          disabled={syncing}
                        >
                          {syncing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                          مزامنة الملفات
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>مزامنة الملفات من التخزين السحابي</TooltipContent>
                    </Tooltip>
                    {files.length > 0 && (
                      <>
                        {/* Visible count badge */}
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs gap-1',
                            visibleCount > 0
                              ? 'border-green-500/30 text-green-600'
                              : 'border-muted-foreground/30 text-muted-foreground'
                          )}
                        >
                          <Eye className="h-3 w-3" />
                          {visibleCount} من {files.length} مرئي للعميل
                        </Badge>
                        {/* Toggle all */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                'h-7 gap-1.5 text-xs',
                                allVisible
                                  ? 'border-green-500/30 text-green-600 hover:text-red-600 hover:border-red-500/30'
                                  : 'border-muted-foreground/30 hover:text-green-600 hover:border-green-500/30'
                              )}
                              onClick={toggleAllVisibility}
                            >
                              {allVisible ? (
                                <>
                                  <EyeOff className="h-3 w-3" /> إخفاء الكل
                                </>
                              ) : (
                                <>
                                  <Eye className="h-3 w-3" /> إظهار الكل
                                </>
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {allVisible ? 'إخفاء جميع الملفات عن العميل' : 'إظهار جميع الملفات للعميل'}
                          </TooltipContent>
                        </Tooltip>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filesLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : files.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    لا توجد ملفات
                  </div>
                ) : (
                  <div className="overflow-y-auto max-h-[calc(100vh-320px)] scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
                    <div className="divide-y">
                      {Object.entries(groupedFiles).map(([folder, folderFiles]) => {
                        const isCollapsed = collapsedFolders[folder];
                        const folderAllVisible = folderFiles.every((f) => f.client_visible);
                        const folderSomeVisible = folderFiles.some((f) => f.client_visible);
                        const folderVisibleCount = folderFiles.filter((f) => f.client_visible).length;

                        return (
                          <div key={folder}>
                            {/* Folder Header */}
                            <div
                              className="flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 cursor-pointer transition-colors sticky top-0 z-10"
                              onClick={() => toggleFolder(folder)}
                            >
                              {/* Folder collapse icon */}
                              {isCollapsed ? (
                                <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              )}

                              {/* Folder icon */}
                              {isCollapsed ? (
                                <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                              ) : (
                                <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
                              )}

                              {/* Folder name */}
                              <span className="text-xs font-semibold flex-1 truncate">
                                {formatFolderName(folder)}
                              </span>

                              {/* Folder visibility count */}
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {folderVisibleCount}/{folderFiles.length}
                              </span>

                              {/* Folder visibility toggle */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className={cn(
                                      'p-1 rounded-md transition-colors shrink-0',
                                      folderAllVisible
                                        ? 'text-green-600 hover:bg-green-500/10'
                                        : folderSomeVisible
                                        ? 'text-amber-500 hover:bg-amber-500/10'
                                        : 'text-muted-foreground/50 hover:bg-muted'
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFolderVisibility(folderFiles);
                                    }}
                                  >
                                    {folderAllVisible ? (
                                      <Eye className="h-3.5 w-3.5" />
                                    ) : (
                                      <EyeOff className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {folderAllVisible
                                    ? `إخفاء كل ملفات "${formatFolderName(folder)}" عن العميل`
                                    : `إظهار كل ملفات "${formatFolderName(folder)}" للعميل`}
                                </TooltipContent>
                              </Tooltip>
                            </div>

                            {/* Folder Files */}
                            {!isCollapsed && (
                              <div className="divide-y divide-dashed">
                                {folderFiles.map((file) => {
                                  const Icon = getFileIcon(file.mime_type);
                                  const isUpdating = visibilityUpdating.has(file.id);

                                  return (
                                    <div
                                      key={file.id}
                                      className={cn(
                                        'flex items-center gap-3 py-2.5 px-3 ps-8 hover:bg-muted/30 transition-colors group',
                                        file.client_visible && 'bg-green-500/[0.02]'
                                      )}
                                    >
                                      {/* Visibility checkbox */}
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="shrink-0">
                                            <Checkbox
                                              checked={file.client_visible}
                                              disabled={isUpdating}
                                              onCheckedChange={() => toggleSingleFileVisibility(file)}
                                              className={cn(
                                                'h-4 w-4 transition-colors',
                                                file.client_visible
                                                  ? 'border-green-500 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500'
                                                  : 'border-muted-foreground/40'
                                              )}
                                            />
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {file.client_visible ? 'إخفاء عن العميل' : 'إظهار للعميل'}
                                        </TooltipContent>
                                      </Tooltip>

                                      {/* File icon */}
                                      <div
                                        className={cn(
                                          'p-1.5 rounded-lg shrink-0',
                                          file.client_visible ? 'bg-green-500/10' : 'bg-muted'
                                        )}
                                      >
                                        <Icon
                                          className={cn(
                                            'h-3.5 w-3.5',
                                            file.client_visible ? 'text-green-600' : 'text-muted-foreground'
                                          )}
                                        />
                                      </div>

                                      {/* File info */}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{file.file_name}</p>
                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                          {file.file_size && <span>{formatFileSize(file.file_size)}</span>}
                                          {file.file_size && <span>·</span>}
                                          <span>{formatRelativeDate(file.created_at)}</span>
                                          <span>·</span>
                                          <span>{file.uploaded_by}</span>
                                        </div>
                                      </div>

                                      {/* Visibility indicator */}
                                      {isUpdating ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                                      ) : file.client_visible ? (
                                        <Badge
                                          variant="outline"
                                          className="text-[9px] px-1.5 py-0 border-green-500/30 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                        >
                                          <Eye className="h-2 w-2 me-0.5" /> مرئي
                                        </Badge>
                                      ) : (
                                        <Badge
                                          variant="outline"
                                          className="text-[9px] px-1.5 py-0 border-muted-foreground/20 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                        >
                                          <EyeOff className="h-2 w-2 me-0.5" /> مخفي
                                        </Badge>
                                      )}

                                      {/* Download button */}
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                        onClick={() => handleDownload(file)}
                                      >
                                        <Download className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Comments Section */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> التعليقات
                  {(project.unread_team_comments ?? 0) > 0 && (
                    <Badge className="text-[10px] bg-orange-500 text-white">
                      {project.unread_team_comments} جديد
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {commentsLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : comments.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    لا توجد تعليقات بعد
                  </div>
                ) : (
                  <ScrollArea className="max-h-[400px]">
                    <div className="divide-y">
                      {comments.map((comment) => {
                        const isTeam = comment.author_type === 'team';
                        return (
                          <div
                            key={comment.id}
                            className={cn(
                              'p-3',
                              !comment.is_read_by_team && !isTeam && 'bg-orange-500/5'
                            )}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold">{comment.author_name}</span>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[9px] px-1.5 py-0',
                                  isTeam
                                    ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                                    : 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                                )}
                              >
                                {isTeam ? 'فريق العمل' : 'العميل'}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground ms-auto">
                                {formatRelativeDate(comment.created_at)}
                              </span>
                            </div>
                            <p className="text-sm leading-relaxed text-foreground/80">
                              {renderTextWithMentions(comment.text)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}

                {/* New Comment Form */}
                <div className="border-t p-3">
                  <form onSubmit={handleSubmitComment} className="space-y-2">
                    <textarea
                      value={newComment}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewComment(e.target.value)}
                      placeholder="اكتب ردك هنا..."
                      rows={2}
                      className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={commentLoading || !newComment.trim()}
                        className="gap-1.5"
                      >
                        {commentLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        إرسال
                      </Button>
                    </div>
                  </form>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
