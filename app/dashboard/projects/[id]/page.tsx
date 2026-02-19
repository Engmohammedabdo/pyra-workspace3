'use client';

import { useState, useEffect, useCallback } from 'react';
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
  HardDrive,
  RotateCcw,
  Users,
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
      const res = await fetch(`/api/files/download?path=${encodeURIComponent(file.file_path)}`);
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

  return (
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
        {/* Files Section */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> ملفات المشروع
              </CardTitle>
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
                <ScrollArea className="max-h-[500px]">
                  <div className="divide-y">
                    {files.map((file) => {
                      const Icon = getFileIcon(file.mime_type);
                      return (
                        <div key={file.id} className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors">
                          <div className="p-2 rounded-lg bg-muted">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{file.file_name}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              {file.file_size && <span>{formatFileSize(file.file_size)}</span>}
                              <span>·</span>
                              <span>{formatRelativeDate(file.created_at)}</span>
                              <span>·</span>
                              <span>{file.uploaded_by}</span>
                              {file.client_visible && (
                                <>
                                  <span>·</span>
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 border-green-500/30 text-green-600">
                                    <Eye className="h-2 w-2 me-0.5" /> مرئي للعميل
                                  </Badge>
                                </>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleDownload(file)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
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
  );
}
