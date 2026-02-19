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

      {/* Tabs: Files + Comments */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="files">
            الملفات ({project.files.length})
          </TabsTrigger>
          <TabsTrigger value="comments">
            التعليقات ({project.comments.length})
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
          {/* Comments List */}
          {project.comments.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  لا توجد تعليقات حتى الآن. كن أول من يعلق!
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {project.comments.map((comment) => {
                const isTeam = comment.author_type === 'team';
                return (
                  <Card
                    key={comment.id}
                    className={cn(
                      isTeam && 'bg-blue-500/5 border-blue-500/15'
                    )}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-center gap-2 mb-2">
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
                        <span className="text-xs text-muted-foreground ms-auto">
                          {formatRelativeDate(comment.created_at)}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-foreground/80">
                        {comment.text}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

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
