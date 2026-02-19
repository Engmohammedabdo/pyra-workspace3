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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowRight,
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
  Send,
  Loader2,
  MessageSquare,
  Eye,
  Search,
  History,
  Filter,
} from 'lucide-react';
import { MentionTextarea } from '@/components/portal/mention-textarea';
import { PortalFilePreview } from '@/components/portal/portal-file-preview';

// ---------- Types ----------

interface ProjectFile {
  id: string;
  file_name: string;
  file_type: string;
  file_path: string;
  file_size?: number;
  added_at: string;
  approval?: {
    id: string;
    status: 'pending' | 'approved' | 'revision_requested';
    comment: string | null;
    reviewed_at: string | null;
  };
}

interface ProjectComment {
  id: string;
  author_type: 'client' | 'team';
  author_name: string;
  text: string;
  file_id: string | null;
  parent_id: string | null;
  created_at: string;
}

interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'in_progress' | 'review' | 'completed' | 'archived';
  updated_at: string;
  files: ProjectFile[];
  comments: ProjectComment[];
}

// ---------- Helpers ----------

const statusConfig: Record<string, { label: string; className: string }> = {
  active: {
    label: 'نشط',
    className: 'bg-green-500/10 text-green-600 border-green-500/20',
  },
  in_progress: {
    label: 'قيد التنفيذ',
    className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  },
  review: {
    label: 'قيد المراجعة',
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  },
  completed: {
    label: 'مكتمل',
    className: 'bg-green-500/10 text-green-600 border-green-500/20',
  },
  archived: {
    label: 'مؤرشف',
    className: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  },
};

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

/** Render comment text with @mentions highlighted in orange. */
function renderTextWithMentions(text: string) {
  const mentionRegex = /@([\w\u0600-\u06FF]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Push text before the mention
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Push highlighted mention
    parts.push(
      <span
        key={match.index}
        className="text-orange-600 font-semibold"
      >
        @{match[1]}
      </span>
    );
    lastIndex = mentionRegex.lastIndex;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

// ---------- Component ----------

export default function PortalProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('files');

  // Revision dialog
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [revisionFileId, setRevisionFileId] = useState<string | null>(null);
  const [revisionComment, setRevisionComment] = useState('');
  const [revisionLoading, setRevisionLoading] = useState(false);

  // Comment form
  const [newComment, setNewComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  // File action loading states
  const [approveLoading, setApproveLoading] = useState<string | null>(null);

  // File comment dialog
  const [fileCommentDialogOpen, setFileCommentDialogOpen] = useState(false);
  const [fileCommentFileId, setFileCommentFileId] = useState<string | null>(null);
  const [fileCommentFileName, setFileCommentFileName] = useState('');
  const [fileCommentText, setFileCommentText] = useState('');
  const [fileCommentLoading, setFileCommentLoading] = useState(false);

  // File preview
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Comment filtering & search
  const [commentSearch, setCommentSearch] = useState('');
  const [commentFileFilter, setCommentFileFilter] = useState<string>('all');
  const [commentAuthorFilter, setCommentAuthorFilter] = useState<string>('all');

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/projects/${projectId}`);
      const json = await res.json();
      if (res.ok && json.data) {
        const d = json.data;
        // API returns { project, project_files, file_approvals, comments }
        // Transform into the shape the UI expects
        const approvalMap = new Map(
          (d.file_approvals || []).map((a: { file_id: string; id: string; status: string; comment: string | null; reviewed_at: string | null }) => [
            a.file_id,
            { id: a.id, status: a.status, comment: a.comment, reviewed_at: a.reviewed_at },
          ])
        );

        const files: ProjectFile[] = (d.project_files || []).map(
          (f: { id: string; file_name: string; mime_type: string; file_path: string; file_size?: number; created_at: string }) => ({
            id: f.id,
            file_name: f.file_name,
            file_type: f.mime_type || 'application/octet-stream',
            file_path: f.file_path,
            file_size: f.file_size,
            added_at: f.created_at,
            approval: approvalMap.get(f.id) || undefined,
          })
        );

        setProject({
          id: d.project.id,
          name: d.project.name,
          description: d.project.description,
          status: d.project.status,
          updated_at: d.project.updated_at,
          files,
          comments: d.comments || [],
        });
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // ---------- Actions ----------

  // Approve dialog
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveFileId, setApproveFileId] = useState<string | null>(null);
  const [approveComment, setApproveComment] = useState('');

  async function handleApprove(fileId: string) {
    setApproveLoading(fileId);
    try {
      const res = await fetch(`/api/portal/files/${fileId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: approveComment.trim() || undefined }),
      });
      if (res.ok) {
        toast.success('تمت الموافقة على الملف بنجاح');
        setApproveDialogOpen(false);
        setApproveComment('');
        setApproveFileId(null);
        await fetchProject();
      } else {
        toast.error('حدث خطأ أثناء الموافقة على الملف');
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setApproveLoading(null);
    }
  }

  // Check if file is "new" (added in the last 48 hours)
  function isNewFile(addedAt: string): boolean {
    const added = new Date(addedAt).getTime();
    const now = Date.now();
    return now - added < 48 * 60 * 60 * 1000;
  }

  async function handleRevisionSubmit() {
    if (!revisionFileId || !revisionComment.trim()) return;
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
        await fetchProject();
      } else {
        toast.error('حدث خطأ أثناء إرسال طلب التعديل');
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setRevisionLoading(false);
    }
  }

  async function handleDownload(fileId: string) {
    try {
      window.open(`/api/portal/files/${fileId}/download`, '_blank');
    } catch {
      toast.error('حدث خطأ أثناء تحميل الملف');
    }
  }

  async function handleFileCommentSubmit() {
    if (!fileCommentFileId || !fileCommentText.trim()) return;
    setFileCommentLoading(true);
    try {
      const res = await fetch(`/api/portal/projects/${projectId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: fileCommentText.trim(),
          file_id: fileCommentFileId,
        }),
      });
      if (res.ok) {
        toast.success('تم إرسال التعليق على الملف بنجاح');
        setFileCommentDialogOpen(false);
        setFileCommentText('');
        setFileCommentFileId(null);
        await fetchProject();
      } else {
        toast.error('حدث خطأ أثناء إرسال التعليق');
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setFileCommentLoading(false);
    }
  }

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setCommentLoading(true);
    try {
      const res = await fetch(`/api/portal/projects/${projectId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newComment.trim() }),
      });
      if (res.ok) {
        toast.success('تم إرسال التعليق بنجاح');
        setNewComment('');
        await fetchProject();
      } else {
        toast.error('حدث خطأ أثناء إرسال التعليق');
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setCommentLoading(false);
    }
  }

  // ---------- Loading ----------

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-12 w-full max-w-md" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-10 w-72" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/portal/projects')}
          className="gap-2"
        >
          <ArrowRight className="h-4 w-4" />
          العودة للمشاريع
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <h2 className="text-lg font-semibold mb-2">المشروع غير موجود</h2>
            <p className="text-muted-foreground text-sm">
              لم يتم العثور على المشروع المطلوب
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = statusConfig[project.status] ?? statusConfig.active;

  // ---------- Render ----------

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/portal/projects')}
        className="gap-2"
      >
        <ArrowRight className="h-4 w-4" />
        العودة للمشاريع
      </Button>

      {/* Project Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <Badge className={cn(status.className)}>{status.label}</Badge>
        </div>
        {project.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {project.description}
          </p>
        )}
      </div>

      {/* Tabs: Files + Comments + Activity */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="files">
            الملفات ({project.files.length})
          </TabsTrigger>
          <TabsTrigger value="comments">
            التعليقات ({project.comments.length})
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            النشاط
          </TabsTrigger>
        </TabsList>

        {/* ---- FILES TAB ---- */}
        <TabsContent value="files" className="mt-4">
          {project.files.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <FileIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  لا توجد ملفات في هذا المشروع
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {project.files.map((file) => {
                const FileTypeIcon = getFileIcon(file.file_type);
                const approval = file.approval;
                const approvalStatus = approval
                  ? approvalStatusConfig[approval.status]
                  : null;

                return (
                  <Card key={file.id}>
                    <CardContent className="flex items-center gap-4 py-4">
                      {/* File Icon */}
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <FileTypeIcon className="h-5 w-5 text-muted-foreground" />
                      </div>

                      {/* File Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p
                            className="text-sm font-medium truncate cursor-pointer hover:text-orange-500 transition-colors"
                            onClick={() => { setPreviewFile(file); setPreviewOpen(true); }}
                          >
                            {file.file_name}
                          </p>
                          {isNewFile(file.added_at) && (
                            <Badge className="text-[9px] px-1.5 py-0 bg-orange-500 text-white border-0 animate-pulse">
                              جديد
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          {file.file_size != null && (
                            <span>{formatFileSize(file.file_size)}</span>
                          )}
                          <span>{formatDate(file.added_at)}</span>
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
                          {approval?.comment && (
                            <span className="text-muted-foreground italic truncate max-w-48" title={approval.comment}>
                              &ldquo;{approval.comment}&rdquo;
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setFileCommentFileId(file.id);
                            setFileCommentFileName(file.file_name);
                            setFileCommentDialogOpen(true);
                          }}
                          className="gap-1.5"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">تعليق</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setPreviewFile(file); setPreviewOpen(true); }}
                          className="gap-1.5 text-orange-500 hover:text-orange-600 border-orange-500/30 hover:bg-orange-500/10"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">معاينة</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(file.id)}
                          className="gap-1.5"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">تحميل</span>
                        </Button>

                        {(!approval || approval.status === 'pending') && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => {
                                setApproveFileId(file.id);
                                setApproveDialogOpen(true);
                              }}
                              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">موافقة</span>
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setRevisionFileId(file.id);
                                setRevisionDialogOpen(true);
                              }}
                              className="gap-1.5 border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">تعديل</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ---- COMMENTS TAB ---- */}
        <TabsContent value="comments" className="mt-4 space-y-4">
          {/* Comment Filters */}
          {project.comments.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="ابحث في التعليقات..."
                  value={commentSearch}
                  onChange={(e) => setCommentSearch(e.target.value)}
                  className="ps-9 h-9 text-sm"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant={commentAuthorFilter === 'all' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setCommentAuthorFilter('all')}
                >
                  الكل
                </Button>
                <Button
                  variant={commentAuthorFilter === 'team' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => setCommentAuthorFilter('team')}
                >
                  <Filter className="h-3 w-3" />
                  فريق العمل
                </Button>
                <Button
                  variant={commentAuthorFilter === 'client' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => setCommentAuthorFilter('client')}
                >
                  <Filter className="h-3 w-3" />
                  العميل
                </Button>
                {project.files.some(f => project.comments.some(c => c.file_id === f.id)) && (
                  <>
                    <div className="w-px h-5 bg-border mx-1" />
                    <Button
                      variant={commentFileFilter === 'all' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setCommentFileFilter('all')}
                    >
                      كل الملفات
                    </Button>
                    <Button
                      variant={commentFileFilter === 'general' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setCommentFileFilter('general')}
                    >
                      عام
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Filtered Comments */}
          <FilteredComments
            comments={project.comments}
            files={project.files}
            search={commentSearch}
            authorFilter={commentAuthorFilter}
            fileFilter={commentFileFilter}
            renderTextWithMentions={renderTextWithMentions}
          />

          {/* New Comment Form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">أضف تعليق</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitComment} className="space-y-3">
                <MentionTextarea
                  value={newComment}
                  onChange={setNewComment}
                  projectId={projectId}
                  placeholder="اكتب تعليقك هنا... (استخدم @ لذكر شخص من فريق العمل)"
                  required
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={commentLoading || !newComment.trim()}
                    className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    {commentLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    إرسال
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- ACTIVITY TAB ---- */}
        <TabsContent value="activity" className="mt-4">
          <ActivityTimeline project={project} />
        </TabsContent>
      </Tabs>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              تأكيد الموافقة
            </DialogTitle>
            <DialogDescription>
              هل أنت متأكد من الموافقة على هذا الملف؟ يمكنك إضافة تعليق اختياري.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="approve-comment">تعليق (اختياري)</Label>
            <textarea
              id="approve-comment"
              value={approveComment}
              onChange={(e) => setApproveComment(e.target.value)}
              placeholder="مثال: ممتاز، التصميم مطابق للمطلوب..."
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setApproveDialogOpen(false);
                setApproveComment('');
                setApproveFileId(null);
              }}
            >
              إلغاء
            </Button>
            <Button
              onClick={() => approveFileId && handleApprove(approveFileId)}
              disabled={approveLoading !== null}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              {approveLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              تأكيد الموافقة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <Label htmlFor="revision-comment">الملاحظات</Label>
            <textarea
              id="revision-comment"
              value={revisionComment}
              onChange={(e) => setRevisionComment(e.target.value)}
              placeholder="اكتب ملاحظاتك هنا..."
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

      {/* File Comment Dialog */}
      <Dialog open={fileCommentDialogOpen} onOpenChange={setFileCommentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعليق على ملف</DialogTitle>
            <DialogDescription>
              أضف تعليقك على: {fileCommentFileName}
              <br />
              <span className="text-xs">استخدم @ لذكر شخص من فريق العمل</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="file-comment-text">التعليق</Label>
            <MentionTextarea
              id="file-comment-text"
              value={fileCommentText}
              onChange={setFileCommentText}
              projectId={projectId}
              placeholder="اكتب تعليقك هنا... (مثال: @أحمد الرجاء مراجعة التصميم)"
              rows={4}
              required
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setFileCommentDialogOpen(false);
                setFileCommentText('');
                setFileCommentFileId(null);
              }}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleFileCommentSubmit}
              disabled={fileCommentLoading || !fileCommentText.trim()}
              className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
            >
              {fileCommentLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              إرسال التعليق
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

// ── Filtered Comments Component ──

function FilteredComments({
  comments,
  files,
  search,
  authorFilter,
  fileFilter,
  renderTextWithMentions,
}: {
  comments: ProjectComment[];
  files: ProjectFile[];
  search: string;
  authorFilter: string;
  fileFilter: string;
  renderTextWithMentions: (text: string) => React.ReactNode;
}) {
  const fileMap = useMemo(() => {
    const m = new Map<string, string>();
    files.forEach(f => m.set(f.id, f.file_name));
    return m;
  }, [files]);

  const filtered = useMemo(() => {
    let list = comments;

    // Author filter
    if (authorFilter !== 'all') {
      list = list.filter(c => c.author_type === authorFilter);
    }

    // File filter
    if (fileFilter === 'general') {
      list = list.filter(c => !c.file_id);
    } else if (fileFilter !== 'all') {
      list = list.filter(c => c.file_id === fileFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(c =>
        c.text.toLowerCase().includes(q) ||
        c.author_name.toLowerCase().includes(q)
      );
    }

    return list;
  }, [comments, authorFilter, fileFilter, search]);

  if (comments.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            لا توجد تعليقات حتى الآن. كن أول من يعلق!
          </p>
        </CardContent>
      </Card>
    );
  }

  if (filtered.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <Search className="h-6 w-6 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">
            لا توجد تعليقات تطابق معايير البحث
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {filtered.length === comments.length
          ? `${comments.length} تعليق`
          : `${filtered.length} من ${comments.length} تعليق`}
      </p>
      {filtered.map((comment) => {
        const isTeam = comment.author_type === 'team';
        const fileName = comment.file_id ? fileMap.get(comment.file_id) : null;

        return (
          <Card
            key={comment.id}
            className={cn(isTeam && 'bg-blue-500/5 border-blue-500/15')}
          >
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-sm font-medium">
                  {comment.author_name}
                </span>
                <Badge
                  className={cn(
                    'text-[10px] px-2 py-0',
                    isTeam
                      ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                      : 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                  )}
                >
                  {isTeam ? 'فريق العمل' : 'العميل'}
                </Badge>
                {fileName && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-2 py-0 gap-1 text-muted-foreground"
                  >
                    <FileText className="h-2.5 w-2.5" />
                    {fileName}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground ms-auto">
                  {formatRelativeDate(comment.created_at)}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-foreground/80">
                {renderTextWithMentions(comment.text)}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Activity Timeline Component ──

interface ActivityEvent {
  id: string;
  type: 'file_added' | 'comment' | 'approval' | 'revision' | 'status_change';
  title: string;
  description: string;
  date: string;
  icon: string;
  color: string;
}

function ActivityTimeline({ project }: { project: ProjectDetail }) {
  const events = useMemo(() => {
    const list: ActivityEvent[] = [];

    // File events
    project.files.forEach(f => {
      list.push({
        id: `file-${f.id}`,
        type: 'file_added',
        title: 'تم إضافة ملف',
        description: f.file_name,
        date: f.added_at,
        icon: '📄',
        color: 'border-blue-500',
      });

      if (f.approval) {
        if (f.approval.status === 'approved') {
          list.push({
            id: `approval-${f.id}`,
            type: 'approval',
            title: 'تمت الموافقة على ملف',
            description: f.file_name + (f.approval.comment ? ` — ${f.approval.comment}` : ''),
            date: f.approval.reviewed_at || f.added_at,
            icon: '✅',
            color: 'border-green-500',
          });
        } else if (f.approval.status === 'revision_requested') {
          list.push({
            id: `revision-${f.id}`,
            type: 'revision',
            title: 'تم طلب تعديل',
            description: f.file_name + (f.approval.comment ? ` — ${f.approval.comment}` : ''),
            date: f.approval.reviewed_at || f.added_at,
            icon: '🔄',
            color: 'border-amber-500',
          });
        }
      }
    });

    // Comment events
    project.comments.forEach(c => {
      list.push({
        id: `comment-${c.id}`,
        type: 'comment',
        title: c.author_type === 'team' ? `تعليق من ${c.author_name}` : `تعليق العميل`,
        description: c.text.length > 80 ? c.text.slice(0, 80) + '...' : c.text,
        date: c.created_at,
        icon: c.author_type === 'team' ? '💬' : '🗨️',
        color: c.author_type === 'team' ? 'border-blue-400' : 'border-orange-400',
      });
    });

    // Sort by date descending (newest first)
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [project]);

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <History className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            لا توجد أنشطة مسجلة حتى الآن
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group events by date
  const grouped = events.reduce<Record<string, ActivityEvent[]>>((acc, event) => {
    const dateKey = formatDate(event.date);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([date, dayEvents]) => (
        <div key={date}>
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted-foreground px-2">{date}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-0 relative">
            {/* Vertical timeline line */}
            <div className="absolute start-[15px] top-2 bottom-2 w-px bg-border" />

            {dayEvents.map((event, idx) => (
              <div key={event.id} className="flex items-start gap-3 py-2 relative">
                {/* Timeline dot */}
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 bg-background border-2 z-10',
                  event.color
                )}>
                  {event.icon}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-sm font-medium">{event.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {event.description}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {formatRelativeDate(event.date)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
