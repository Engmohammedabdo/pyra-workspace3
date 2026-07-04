'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { hasPermission } from '@/lib/auth/rbac';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { MentionTextarea } from '@/components/ui/mention-textarea';
import { renderTextWithMentions } from '@/lib/utils/mentions';
import {
  Users, Tag, CalendarDays, CalendarClock, Flag, Clock, Paperclip, Image,
  FolderOpen, ArrowRightLeft, Archive, Trash2, Plus, Check, X, Send, Copy,
  ChevronDown, Download, FileText, MessageSquare, History, CheckSquare,
  GripVertical, MoreHorizontal, Pencil, AlertTriangle, Loader2,
} from 'lucide-react';
import type { AuthSession } from '@/lib/auth/guards';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

interface Column {
  id: string;
  name: string;
  color: string;
  position: number;
  is_done_column: boolean;
  requires_approval?: boolean;
  column_type?: string;
}

interface BoardLabel {
  id: string;
  name: string;
  color: string;
}

interface Board {
  id: string;
  name: string;
  description: string | null;
  view_mode?: string;
  is_pipeline?: boolean;
  pyra_board_columns?: Column[];
  pyra_board_labels?: BoardLabel[];
}

interface Assignee {
  id?: string;
  username: string;
  assigned_by?: string;
}

interface ChecklistItem {
  id: string;
  title: string;
  is_checked: boolean;
  position?: number;
}

interface Comment {
  id: string;
  author_username?: string;
  author_name: string;
  content: string;
  created_at: string;
}

interface Attachment {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  uploaded_by: string;
  review_status: string;
  created_at: string;
}

interface Activity {
  id: string;
  username: string;
  display_name: string;
  action: string;
  details: string;
  created_at: string;
}

interface TaskDetail {
  id: string;
  title: string;
  description?: string;
  column_id: string;
  board_id: string;
  position: number;
  priority: string;
  due_date?: string;
  start_date?: string;
  stage_entered_at?: string | null;
  estimated_hours?: number;
  actual_hours?: number;
  cover_image?: string;
  is_archived?: boolean;
  created_by: string;
  created_at?: string;
  completion_percentage?: number;
  pyra_task_assignees?: Assignee[];
  pyra_task_labels?: { label_id?: string; pyra_board_labels: { id?: string; name: string; color: string } }[];
  pyra_task_checklist?: ChecklistItem[];
  pyra_task_comments?: Comment[];
  pyra_task_attachments?: Attachment[];
  pyra_task_activity?: Activity[];
}

interface TaskSheetProps {
  taskId: string;
  board: Board;
  onClose: () => void;
  onUpdate: () => void;
  session: AuthSession;
}

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

const PRIORITIES = [
  { key: 'urgent', label: 'عاجل', color: 'bg-red-500' },
  { key: 'high', label: 'مرتفع', color: 'bg-orange-500' },
  { key: 'medium', label: 'متوسط', color: 'bg-blue-500' },
  { key: 'low', label: 'منخفض', color: 'bg-gray-400' },
];

const LABEL_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'indigo', 'gray'];

const LABEL_COLOR_MAP: Record<string, string> = {
  red: 'bg-red-500', orange: 'bg-orange-500', yellow: 'bg-yellow-500',
  green: 'bg-green-500', blue: 'bg-blue-500', purple: 'bg-purple-500',
  pink: 'bg-pink-500', indigo: 'bg-indigo-500', gray: 'bg-gray-500',
};

const LABEL_BG_MAP: Record<string, string> = {
  red: 'bg-red-500/15 text-red-700 dark:text-red-300',
  orange: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  yellow: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300',
  green: 'bg-green-500/15 text-green-700 dark:text-green-300',
  blue: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  purple: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  pink: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
  indigo: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  gray: 'bg-gray-500/15 text-gray-700 dark:text-gray-300',
};

const ACTION_LABELS: Record<string, string> = {
  created: 'أنشأ المهمة', moved: 'نقل المهمة', assignee_added: 'أضاف عضو',
  assignee_removed: 'أزال عضو', comment_added: 'أضاف تعليق', checklist_added: 'أضاف عنصر',
  stage_advanced: 'نقل للمرحلة التالية', stage_approved: 'وافق', stage_rejected: 'رفض',
  file_uploaded: 'رفع ملف', file_approved: 'وافق على ملف', file_revision_requested: 'طلب تعديل',
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} د`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} س`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `منذ ${days} ي`;
  return new Date(dateStr).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function getAvatarColor(str: string) {
  const colors = ['bg-orange-500', 'bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-rose-500', 'bg-cyan-500'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ═══════════════════════════════════════════════════════════
// Stage journey stepper — pipeline boards only (signature visual)
// ═══════════════════════════════════════════════════════════

function StageStepper({ columns, currentColumnId }: { columns: Column[]; currentColumnId: string }) {
  const sorted = [...columns].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const currentIdx = sorted.findIndex(c => c.id === currentColumnId);
  const accent = (c: Column, i: number) => {
    if (i > currentIdx) return 'bg-border';
    const t = c.column_type;
    if (t === 'review') return 'bg-amber-500';
    if (t === 'approved') return 'bg-emerald-500';
    if (t === 'delivery' || c.is_done_column) return 'bg-green-600';
    if (t === 'in_progress') return 'bg-blue-500';
    return 'bg-zinc-400 dark:bg-zinc-500';
  };
  return (
    <div className="flex items-center gap-1 mt-2" aria-label="مراحل المهمة">
      {sorted.map((c, i) => (
        <div key={c.id} className="flex-1 flex flex-col gap-1 min-w-0">
          <div className={cn('h-1.5 rounded-full transition-colors', accent(c, i), i === currentIdx && 'ring-2 ring-offset-1 ring-orange-400/60 dark:ring-offset-background')} />
          <span className={cn('text-[9px] truncate text-center', i === currentIdx ? 'text-foreground font-semibold' : 'text-muted-foreground/60')}>{c.name}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════

export function TaskSheet({ taskId, board, onClose, onUpdate, session }: TaskSheetProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Inline edits
  const [editTitle, setEditTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editDesc, setEditDesc] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);

  // Comment
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  // Checklist
  const [newCheckItem, setNewCheckItem] = useState('');
  const [showCheckInput, setShowCheckInput] = useState(false);

  // Assignee search
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [allUsers, setAllUsers] = useState<{ username: string; display_name: string }[]>([]);

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false);

  // File upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Pipeline actions
  const [advancing, setAdvancing] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [linkDialog, setLinkDialog] = useState<null | 'review' | 'delivery'>(null);
  const [actionLink, setActionLink] = useState('');
  const [actionNote, setActionNote] = useState('');

  const canEdit = hasPermission(session.pyraUser.rolePermissions, 'tasks.create');
  const canDelete = hasPermission(session.pyraUser.rolePermissions, 'tasks.manage');
  const canManage = canEdit; // tasks.create — can submit/advance
  const canApprove = hasPermission(session.pyraUser.rolePermissions, 'boards.manage');

  const columns = (board.pyra_board_columns || []).sort((a, b) => a.position - b.position);
  const labels = board.pyra_board_labels || [];
  const currentCol = columns.find(c => c.id === task?.column_id);

  // ── Pipeline derivations ──
  const pipelineCols = board.is_pipeline ? columns : [];
  const currentColIdx = pipelineCols.findIndex(c => c.id === task?.column_id);
  const nextCol = currentColIdx >= 0 && currentColIdx < pipelineCols.length - 1
    ? pipelineCols[currentColIdx + 1]
    : null;
  const isLastStage = pipelineCols.length > 0 && currentColIdx === pipelineCols.length - 1;

  // ── Fetch ──
  const fetchTask = useCallback(async () => {
    try {
      const data = await fetchAPI<TaskDetail>(`/api/tasks/${taskId}`);
      if (data) {
        setTask(data);
        setEditTitle(data.title);
        setEditDesc(data.description || '');
      }
    } catch { toast.error('فشل تحميل المهمة'); }
    finally { setLoading(false); }
  }, [taskId]);

  useEffect(() => { fetchTask(); }, [fetchTask]);

  // Fetch users for assignee search
  useEffect(() => {
    fetchAPI<{ username: string; display_name: string }[]>('/api/users').then(users => {
      if (users) setAllUsers(users.map(u => ({ username: u.username, display_name: u.display_name })));
    }).catch(() => {});
  }, []);

  if (loading || !task) {
    return (
      <Sheet open onOpenChange={onClose}>
        <SheetContent side="left" className="w-full sm:max-w-3xl p-0" aria-describedby={undefined}>
          <SheetTitle className="sr-only">تحميل المهمة</SheetTitle>
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // ── Helpers ──
  const assignees = task.pyra_task_assignees || [];
  const taskLabels = task.pyra_task_labels || [];
  const checklist = (task.pyra_task_checklist || []).sort((a, b) => (a.position || 0) - (b.position || 0));
  const comments = (task.pyra_task_comments || []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const attachments = task.pyra_task_attachments || [];
  const activities = (task.pyra_task_activity || []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const checkDone = checklist.filter(c => c.is_checked).length;
  const checkTotal = checklist.length;
  const isOverdue = task.due_date && task.due_date < new Date().toISOString().split('T')[0] && !currentCol?.is_done_column;

  // ── API Calls ──
  const saveField = async (field: string, value: unknown) => {
    setSaving(true);
    try {
      await mutateAPI(`/api/tasks/${task.id}`, 'PATCH', { [field]: value });
      fetchTask();
      onUpdate();
    } catch { toast.error('فشل الحفظ'); }
    finally { setSaving(false); }
  };

  const saveTitle = () => {
    if (editTitle.trim() && editTitle !== task.title) saveField('title', editTitle.trim());
    setEditingTitle(false);
  };

  const saveDescription = () => {
    if (editDesc !== (task.description || '')) saveField('description', editDesc || null);
    setEditingDesc(false);
  };

  const addAssignee = async (username: string) => {
    try {
      await mutateAPI(`/api/tasks/${task.id}/assignees`, 'POST', { usernames: [username] });
      setAssigneeSearch('');
      fetchTask();
      onUpdate();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'تعذّر تعديل الأعضاء');
    }
  };

  const removeAssignee = async (username: string) => {
    try {
      await mutateAPI(`/api/tasks/${task.id}/assignees?username=${encodeURIComponent(username)}`, 'DELETE');
      fetchTask();
      onUpdate();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'تعذّر تعديل الأعضاء');
    }
  };

  const toggleLabel = async (labelId: string) => {
    try {
      const has = taskLabels.some(l => l.label_id === labelId);
      if (has) {
        // Remove — direct DB call via task label junction
        await mutateAPI(`/api/tasks/${task.id}`, 'PATCH', { _remove_label: labelId });
      } else {
        await mutateAPI(`/api/tasks/${task.id}`, 'PATCH', { _add_label: labelId });
      }
      fetchTask();
      onUpdate();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'تعذّر تحديث التصنيف');
    }
  };

  const addComment = async () => {
    if (!commentText.trim()) return;
    setSendingComment(true);
    try {
      await mutateAPI(`/api/tasks/${task.id}/comments`, 'POST', { content: commentText });
      setCommentText('');
      fetchTask();
    } catch { toast.error('فشل إرسال التعليق'); }
    finally { setSendingComment(false); }
  };

  const deleteComment = async (commentId: string) => {
    try {
      await mutateAPI(`/api/tasks/${task.id}/comments?commentId=${commentId}`, 'DELETE');
      fetchTask();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'تعذّر حذف التعليق');
    }
  };

  const addChecklistItem = async () => {
    if (!newCheckItem.trim()) return;
    await mutateAPI(`/api/tasks/${task.id}/checklist`, 'POST', { title: newCheckItem.trim() });
    setNewCheckItem('');
    setShowCheckInput(false);
    fetchTask();
    onUpdate();
  };

  const toggleCheckItem = async (itemId: string, currentChecked: boolean) => {
    try {
      await mutateAPI(`/api/tasks/${task.id}/checklist?itemId=${itemId}`, 'PATCH', { is_checked: !currentChecked });
      fetchTask();
      onUpdate();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'تعذّر تحديث المهمة');
    }
  };

  const deleteCheckItem = async (itemId: string) => {
    try {
      await mutateAPI(`/api/tasks/${task.id}/checklist?itemId=${itemId}`, 'DELETE');
      fetchTask();
      onUpdate();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'تعذّر حذف المهمة');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const prefix = `tasks/${task.id}`;
      // 1. Get signed upload URL
      const urlData = await mutateAPI<{ signedUrl: string; token: string; storagePath: string }>(
        '/api/files/upload-url', 'POST',
        { fileName: file.name, fileSize: file.size, mimeType: file.type, prefix }
      );

      // 2. Upload via XHR for progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', urlData.signedUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.send(file);
      });

      // 3. Complete upload (index file)
      await mutateAPI('/api/files/upload-complete', 'POST', {
        storagePath: urlData.storagePath, fileName: file.name, fileSize: file.size, mimeType: file.type,
      });

      // 4. Record as task attachment
      const bucket = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const fileUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${urlData.storagePath}`;
      await mutateAPI(`/api/boards/${board.id}/tasks/${task.id}/attachments`, 'POST', {
        file_name: file.name, file_url: fileUrl, file_size: file.size, storage_path: urlData.storagePath,
      });

      toast.success('تم رفع الملف');
      fetchTask();
    } catch { toast.error('فشل رفع الملف'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const moveToColumn = async (colId: string) => {
    try {
      await mutateAPI(`/api/tasks/${task.id}/move`, 'POST', { column_id: colId, position: 0 });
      fetchTask();
      onUpdate();
    } catch (e) {
      // Surface the server's Arabic guidance (e.g. gated-column 422 telling
      // the user to use the review/approve/deliver button instead).
      toast.error(e instanceof Error && e.message ? e.message : 'فشل نقل المهمة');
    }
  };

  // ── Pipeline: Advance / Approve / Reject ──
  const handleAdvance = async () => {
    setAdvancing(true);
    try {
      const res = await fetch(`/api/boards/${board.id}/tasks/${task.id}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'فشل في نقل المهمة'); return; }
      toast.success('تم نقل المهمة للمرحلة التالية');
      fetchTask();
      onUpdate();
    } catch { toast.error('حدث خطأ'); }
    finally { setAdvancing(false); }
  };

  const handleAdvanceWithLink = async (kind: 'review' | 'delivery') => {
    const link = actionLink.trim();
    if (!/^https:\/\/.+/i.test(link)) {
      toast.error('الصق رابط صحيح يبدأ بـ https:// (frame.io أو Google Drive)');
      return;
    }
    setAdvancing(true);
    try {
      const res = await fetch(`/api/boards/${board.id}/tasks/${task.id}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          kind === 'review'
            ? { review_link: link, note: actionNote.trim() }
            : { delivery_link: link }
        ),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'فشل في نقل المهمة'); return; }
      toast.success(kind === 'review' ? 'تم رفع النسخة للمراجعة ✓' : 'تم تسجيل التسليم النهائي ✓');
      setLinkDialog(null);
      setActionLink('');
      setActionNote('');
      fetchTask();
      onUpdate();
    } catch { toast.error('حدث خطأ'); }
    finally { setAdvancing(false); }
  };

  const handleApprove = async () => {
    setAdvancing(true);
    try {
      const res = await fetch(`/api/boards/${board.id}/tasks/${task.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'فشل في الاعتماد'); return; }
      toast.success('تم اعتماد المهمة ونقلها ✓');
      fetchTask();
      onUpdate();
    } catch { toast.error('حدث خطأ'); }
    finally { setAdvancing(false); }
  };

  const handleReject = async () => {
    if (!rejectNote.trim()) return;
    setAdvancing(true);
    try {
      const res = await fetch(`/api/boards/${board.id}/tasks/${task.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', note: rejectNote }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'فشل في طلب التعديل'); return; }
      toast.success('تم طلب التعديل وإرجاع المهمة');
      setShowReject(false);
      setRejectNote('');
      fetchTask();
      onUpdate();
    } catch { toast.error('حدث خطأ'); }
    finally { setAdvancing(false); }
  };

  // Structurally exclusive pipeline action UI — single precedence chain.
  // Order matters: approval gate → review submit → delivery submit → generic advance.
  const renderPipelineActions = () => {
    if (!board.is_pipeline || !nextCol || isLastStage) return null;

    // 1. Next stage requires admin approval
    if (nextCol.requires_approval) {
      if (!canApprove) {
        return (
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-center">
            <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">⏳ في انتظار مراجعة الأدمن</p>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
          <ArrowRightLeft className="h-4 w-4 text-emerald-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-emerald-700 dark:text-emerald-300">قرار المراجعة — راجع الرابط في المرفقات أولاً</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {showReject ? (
              <div className="flex items-center gap-1.5">
                <Input value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="ملخص التعديلات المطلوبة (إجباري)..." className="h-8 text-xs w-44" />
                <Button size="sm" variant="destructive" className="h-8 text-xs" disabled={advancing || !rejectNote.trim()} onClick={handleReject}>طلب تعديل ✗</Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setShowReject(false); setRejectNote(''); }}>إلغاء</Button>
              </div>
            ) : (
              <>
                <Button size="sm" variant="ghost" className="h-8 text-xs text-red-500" onClick={() => setShowReject(true)}>طلب تعديل</Button>
                <Button size="sm" className="h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white" disabled={advancing} onClick={handleApprove}>
                  {advancing ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري...</> : 'اعتماد ✓'}
                </Button>
              </>
            )}
          </div>
        </div>
      );
    }

    // 2. Review column — needs a review link
    if (nextCol.column_type === 'review' && canManage) {
      return linkDialog === 'review' ? (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 space-y-2">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">رابط النسخة (frame.io أو Google Drive)</p>
          <Input value={actionLink} onChange={e => setActionLink(e.target.value)} placeholder="https://f.io/..." className="h-8 text-xs" dir="ltr" />
          <Input value={actionNote} onChange={e => setActionNote(e.target.value)} placeholder="ملاحظة اختيارية..." className="h-8 text-xs" />
          <div className="flex gap-1.5">
            <Button size="sm" className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-white" disabled={advancing || !actionLink.trim()} onClick={() => handleAdvanceWithLink('review')}>
              {advancing ? 'جاري...' : 'رفع للمراجعة 👀'}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setLinkDialog(null); setActionLink(''); setActionNote(''); }}>إلغاء</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" className="h-11 text-xs w-full bg-amber-500 hover:bg-amber-600 text-white" onClick={() => setLinkDialog('review')}>
          👀 رفع للمراجعة
        </Button>
      );
    }

    // 3. Delivery column — needs the final Drive link
    if (nextCol.column_type === 'delivery' && canManage) {
      return linkDialog === 'delivery' ? (
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 space-y-2">
          <p className="text-xs font-medium text-green-800 dark:text-green-300">رابط الفاينل على Google Drive (فولدر التسليمات)</p>
          <Input value={actionLink} onChange={e => setActionLink(e.target.value)} placeholder="https://drive.google.com/..." className="h-8 text-xs" dir="ltr" />
          <div className="flex gap-1.5">
            <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white" disabled={advancing || !actionLink.trim()} onClick={() => handleAdvanceWithLink('delivery')}>
              {advancing ? 'جاري...' : 'تسليم نهائي 📦'}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setLinkDialog(null); setActionLink(''); setActionNote(''); }}>إلغاء</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" className="h-11 text-xs w-full bg-green-600 hover:bg-green-700 text-white" onClick={() => setLinkDialog('delivery')}>
          📦 تسليم نهائي
        </Button>
      );
    }

    // 4. Untyped, non-gated column — generic advance
    if (canManage) {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
          <ArrowRightLeft className="h-4 w-4 text-emerald-500 shrink-0" />
          <p className="flex-1 text-xs text-emerald-700 dark:text-emerald-300">المرحلة التالية: <strong>{nextCol.name}</strong></p>
          <Button size="sm" className="h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white" disabled={advancing} onClick={handleAdvance}>
            {advancing ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري...</> : 'نقل للتالي'}
          </Button>
        </div>
      );
    }

    return null;
  };

  const archiveTask = async () => {
    await saveField('is_archived', true);
    onClose();
  };

  const deleteTask = async () => {
    await mutateAPI(`/api/tasks/${task.id}`, 'DELETE');
    toast.success('تم حذف المهمة');
    onUpdate();
    onClose();
  };

  const filteredUsers = allUsers.filter(u =>
    !assignees.some(a => a.username === u.username) &&
    (!assigneeSearch ||
      u.display_name.toLowerCase().includes(assigneeSearch.toLowerCase()) ||
      u.username.toLowerCase().includes(assigneeSearch.toLowerCase()))
  ).slice(0, 20);

  // ── Extracted action list (shared by desktop sidebar + mobile action bar) ──
  // Same Popover-wrapped triggers, restyled per breakpoint via `compact`.
  // Only one breakpoint is visible at a time, so mounting both is safe —
  // shared state (assigneeSearch, confirmDelete, etc.) reads consistently.
  const renderActions = (compact: boolean) => {
    return (
      <>
        {/* Assignees */}
        <div>
          <Popover>
            <PopoverTrigger asChild>
              <SidebarBtn icon={Users} label="الأعضاء / تعيين" compact={compact} />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-2">
              <Input
                value={assigneeSearch}
                onChange={e => setAssigneeSearch(e.target.value)}
                placeholder="بحث عن عضو..."
                className="h-8 text-xs mb-2"
              />
              {/* Current assignees */}
              {assignees.map(a => {
                const matched = allUsers.find(u => u.username === a.username);
                const label = matched?.display_name || a.username;
                return (
                  <div key={a.username} className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted text-xs">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className={cn('text-[8px] text-white', getAvatarColor(a.username))}>
                          {a.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {label}
                    </div>
                    <button onClick={() => removeAssignee(a.username)} className="text-red-400 hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
              {assignees.length > 0 && filteredUsers.length > 0 && (
                <div className="border-t border-border/30 my-1.5" />
              )}
              {/* Pickable list — always visible, filtered by search when typed */}
              <div className="max-h-48 overflow-y-auto">
                {filteredUsers.map(u => (
                  <button
                    key={u.username}
                    onClick={() => addAssignee(u.username)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-xs text-start"
                  >
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className={cn('text-[8px] text-white', getAvatarColor(u.username))}>
                        {u.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p>{u.display_name}</p>
                      <p className="text-[10px] text-muted-foreground">{u.username}</p>
                    </div>
                  </button>
                ))}
                {filteredUsers.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">لا يوجد مستخدمون</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
          {!compact && assignees.length === 0 && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 ps-3 -mt-1 mb-1">
              لم يُعيَّن أحد
            </p>
          )}
        </div>

        {/* Labels */}
        <Popover>
          <PopoverTrigger asChild>
            <SidebarBtn icon={Tag} label="التصنيفات" compact={compact} />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-48 p-2">
            {labels.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">لا توجد تصنيفات</p>
            ) : labels.map(l => {
              const active = taskLabels.some(tl => tl.label_id === l.id);
              return (
                <button
                  key={l.id}
                  onClick={() => toggleLabel(l.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-start transition-colors',
                    active ? 'bg-orange-500/10' : 'hover:bg-muted'
                  )}
                >
                  <div className={cn('w-3 h-3 rounded-sm', LABEL_COLOR_MAP[l.color] || 'bg-gray-500')} />
                  <span className="flex-1">{l.name}</span>
                  {active && <Check className="h-3 w-3 text-orange-500" />}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>

        {/* Start date */}
        <SidebarDateBtn
          icon={CalendarDays}
          label="تاريخ البداية"
          value={task.start_date || ''}
          onChange={v => saveField('start_date', v || null)}
          compact={compact}
        />

        {/* Due date */}
        <SidebarDateBtn
          icon={CalendarClock}
          label="تاريخ الاستحقاق"
          value={task.due_date || ''}
          onChange={v => saveField('due_date', v || null)}
          isOverdue={!!isOverdue}
          compact={compact}
        />

        {/* Priority */}
        <Popover>
          <PopoverTrigger asChild>
            <SidebarBtn icon={Flag} label="الأولوية" compact={compact} />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-40 p-1">
            {PRIORITIES.map(p => (
              <button
                key={p.key}
                onClick={() => saveField('priority', p.key)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs text-start hover:bg-muted',
                  task.priority === p.key && 'bg-orange-500/10'
                )}
              >
                <div className={cn('w-2.5 h-2.5 rounded-full', p.color)} />
                {p.label}
                {task.priority === p.key && <Check className="h-3 w-3 ms-auto text-orange-500" />}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Hours */}
        <Popover>
          <PopoverTrigger asChild>
            <SidebarBtn icon={Clock} label="الساعات" badge={task.estimated_hours ? `${task.actual_hours || 0}/${task.estimated_hours}` : undefined} compact={compact} />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-48 p-3 space-y-2">
            <div>
              <label className="text-[10px] text-muted-foreground">المقدرة</label>
              <Input
                type="number"
                min={0}
                step={0.5}
                defaultValue={task.estimated_hours || ''}
                onBlur={e => saveField('estimated_hours', Number(e.target.value) || null)}
                className="h-8 text-xs"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">الفعلية</label>
              <Input
                type="number"
                min={0}
                step={0.5}
                defaultValue={task.actual_hours || ''}
                onBlur={e => saveField('actual_hours', Number(e.target.value) || null)}
                className="h-8 text-xs"
                dir="ltr"
              />
            </div>
          </PopoverContent>
        </Popover>

        {/* Attachment */}
        {compact ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-8 px-2.5 rounded-lg border border-border/50 bg-muted/40 text-xs flex items-center gap-1.5 whitespace-nowrap hover:bg-muted transition-colors shrink-0"
          >
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span>{uploading ? 'جاري الرفع...' : 'إضافة مرفق'}</span>
          </button>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-start hover:bg-muted transition-colors"
          >
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <span>{uploading ? 'جاري الرفع...' : 'إضافة مرفق'}</span>
          </button>
        )}

        {/* Cover image */}
        {attachments.some(a => /\.(jpg|jpeg|png|gif|webp)$/i.test(a.file_name)) && (
          <Popover>
            <PopoverTrigger asChild>
              <SidebarBtn icon={Image} label="صورة غلاف" compact={compact} />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-48 p-2">
              {task.cover_image && (
                <button
                  onClick={() => saveField('cover_image', null)}
                  className="w-full text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded px-2 py-1 mb-1"
                >
                  إزالة الغلاف
                </button>
              )}
              {attachments.filter(a => /\.(jpg|jpeg|png|gif|webp)$/i.test(a.file_name)).map(a => (
                <button
                  key={a.id}
                  onClick={() => saveField('cover_image', a.file_url)}
                  className="w-full rounded overflow-hidden mb-1 hover:ring-2 ring-orange-500 transition-all"
                >
                  <img src={a.file_url} alt="" className="w-full h-16 object-cover" />
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}

        {/* Divider (desktop only — the mobile bar is a single horizontal row) */}
        {!compact && <div className="border-t border-border/30 my-2" />}

        {/* Move */}
        <Popover>
          <PopoverTrigger asChild>
            <SidebarBtn icon={ArrowRightLeft} label="نقل إلى قائمة" compact={compact} />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-44 p-1">
            {columns.map(col => (
              <button
                key={col.id}
                onClick={() => moveToColumn(col.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs text-start hover:bg-muted',
                  col.id === task.column_id && 'bg-orange-500/10'
                )}
              >
                {col.name}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Move to another board */}
        {canEdit && (
          <Popover>
            <PopoverTrigger asChild>
              <SidebarBtn icon={FolderOpen} label="نقل إلى لوحة أخرى" compact={compact} />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-2">
              <p className="text-[10px] text-muted-foreground mb-2">اختر اللوحة والقائمة</p>
              <MoveToBoardPicker
                currentBoardId={board.id}
                taskId={task.id}
                onMoved={() => { onUpdate(); onClose(); toast.success('تم نقل المهمة'); }}
              />
            </PopoverContent>
          </Popover>
        )}

        {/* Copy/Duplicate */}
        {canEdit && (
          compact ? (
            <button
              onClick={async () => {
                try {
                  await mutateAPI(`/api/tasks/${task.id}/duplicate`, 'POST', {});
                  toast.success('تم نسخ المهمة');
                  onUpdate();
                } catch { toast.error('فشل نسخ المهمة'); }
              }}
              className="h-8 px-2.5 rounded-lg border border-border/50 bg-muted/40 text-xs flex items-center gap-1.5 whitespace-nowrap hover:bg-muted transition-colors shrink-0"
            >
              <Copy className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span>نسخ المهمة</span>
            </button>
          ) : (
            <button
              onClick={async () => {
                try {
                  await mutateAPI(`/api/tasks/${task.id}/duplicate`, 'POST', {});
                  toast.success('تم نسخ المهمة');
                  onUpdate();
                } catch { toast.error('فشل نسخ المهمة'); }
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-start hover:bg-muted transition-colors"
            >
              <Copy className="h-4 w-4 text-muted-foreground" />
              <span>نسخ المهمة</span>
            </button>
          )
        )}

        {/* Archive */}
        {compact ? (
          <button
            onClick={archiveTask}
            className="h-8 px-2.5 rounded-lg border border-border/50 bg-muted/40 text-xs flex items-center gap-1.5 whitespace-nowrap hover:bg-muted transition-colors shrink-0"
          >
            <Archive className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span>أرشفة</span>
          </button>
        ) : (
          <button
            onClick={archiveTask}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-start hover:bg-muted transition-colors"
          >
            <Archive className="h-4 w-4 text-muted-foreground" />
            <span>أرشفة</span>
          </button>
        )}

        {/* Delete */}
        {canDelete && (
          confirmDelete ? (
            <div className={cn(
              'p-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 space-y-1.5',
              compact && 'shrink-0'
            )}>
              <p className="text-[10px] text-red-600 dark:text-red-400">حذف نهائي؟</p>
              <div className="flex gap-1">
                <Button size="sm" variant="destructive" className="h-6 text-[10px] flex-1" onClick={deleteTask}>حذف</Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] flex-1" onClick={() => setConfirmDelete(false)}>إلغاء</Button>
              </div>
            </div>
          ) : compact ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="h-8 px-2.5 rounded-lg border border-border/50 bg-muted/40 text-xs flex items-center gap-1.5 whitespace-nowrap text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>حذف</span>
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-start text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              <span>حذف</span>
            </button>
          )
        )}
      </>
    );
  };

  // ── Render ──
  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="left" className="w-full sm:max-w-3xl p-0 overflow-hidden flex flex-col" aria-describedby={undefined}>
        <SheetTitle className="sr-only">تفاصيل المهمة</SheetTitle>
        {/* Single hidden file input — mounted ONCE outside renderActions (which
            renders twice, mobile+desktop); both «إضافة مرفق» buttons click it */}
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
        {/* Cover image */}
        {task.cover_image && (
          <div className="h-32 w-full overflow-hidden shrink-0">
            <img src={task.cover_image} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        {/* ═══ FIXED HEADER (title + journey stay while scrolling) ═══ */}
        <div className="px-6 pt-5 pb-4 border-b border-border/50 shrink-0" dir="rtl">
          {/* Title — inline editable */}
          {editingTitle ? (
            <Input
              autoFocus
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setEditTitle(task.title); setEditingTitle(false); } }}
              className="text-lg sm:text-xl font-bold border-orange-300 focus:ring-orange-500/30 pe-10"
            />
          ) : (
            <h2
              className="text-lg sm:text-xl font-bold leading-snug pe-10 cursor-pointer hover:text-orange-500 transition-colors group"
              onClick={() => canEdit && setEditingTitle(true)}
            >
              {task.title}
              {canEdit && <Pencil className="inline h-3.5 w-3.5 ms-2 opacity-0 group-hover:opacity-50" />}
            </h2>
          )}

          {/* Stage journey stepper — pipeline boards only */}
          {board.is_pipeline && columns.length > 1 && (
            <StageStepper columns={columns} currentColumnId={task.column_id} />
          )}

          {/* Column subtitle + time-in-stage */}
          <div className="flex items-center gap-2 flex-wrap mt-2">
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                في قائمة: <Badge variant="outline" className="text-[10px] cursor-pointer">{currentCol?.name || '—'}</Badge>
                <ChevronDown className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-48 p-1">
              {columns.map(col => (
                <button
                  key={col.id}
                  onClick={() => moveToColumn(col.id)}
                  className={cn(
                    'w-full text-start px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors flex items-center gap-2',
                    col.id === task.column_id && 'bg-orange-500/10 text-orange-600'
                  )}
                >
                  <div className={cn('w-2 h-2 rounded-full', `bg-${col.color}-500`)} />
                  {col.name}
                  {col.id === task.column_id && <Check className="h-3.5 w-3.5 ms-auto" />}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          {task.stage_entered_at && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden />
              في المرحلة دي {timeAgo(task.stage_entered_at)}
            </span>
          )}
          </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col md:flex-row" dir="rtl">
          {/* ═══ MOBILE ACTION BAR (md:hidden) ═══ */}
          <div className="flex md:hidden gap-1.5 overflow-x-auto px-4 py-2.5 border-b border-border/40 shrink-0">
            {renderActions(true)}
          </div>

          {/* ═══ MAIN CONTENT ═══ */}
          <ScrollArea className="flex-1 min-w-0">
            <div className="px-6 py-5 divide-y divide-border/30">
              {/* ── Pipeline Actions (role-aware, link-gated) — first thing the user sees ── */}
              {board.is_pipeline && (nextCol || isLastStage) && (
                <div className="space-y-2 py-5 first:pt-0 last:pb-0">
                  {renderPipelineActions()}
                  {isLastStage && (
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 text-center">
                      <p className="text-xs text-green-700 dark:text-green-300 font-medium">✅ هذه المهمة في المرحلة الأخيرة — مكتملة</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Labels / Assignees / Dates / Priority ── */}
              {(taskLabels.length > 0 || assignees.length > 0 || task.start_date || task.due_date || task.priority) && (
                <div className="space-y-3 py-5 first:pt-0 last:pb-0">
                  {/* Labels bar */}
                  {taskLabels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {taskLabels.map(l => (
                        <Badge key={l.label_id} className={cn('text-[11px] border-0', LABEL_BG_MAP[l.pyra_board_labels.color] || LABEL_BG_MAP.gray)}>
                          {l.pyra_board_labels.name}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Assignee avatars */}
                  {assignees.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      {assignees.map(a => (
                        <TooltipProvider key={a.username}>
                          <Tooltip>
                            <TooltipTrigger>
                              <Avatar className="h-7 w-7 border-2 border-background">
                                <AvatarFallback className={cn('text-[10px] text-white', getAvatarColor(a.username))}>
                                  {a.username.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            </TooltipTrigger>
                            <TooltipContent>{a.username}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ))}
                    </div>
                  )}

                  {/* Dates + Priority row */}
                  <div className="flex flex-wrap gap-3 text-xs">
                    {task.start_date && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" />
                        البداية: {new Date(task.start_date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}
                      </div>
                    )}
                    {task.due_date && (
                      <div className={cn('flex items-center gap-1', isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground')}>
                        <CalendarClock className="h-3.5 w-3.5" />
                        الاستحقاق: {new Date(task.due_date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}
                        {isOverdue && <span className="text-[10px] bg-red-500/10 px-1 rounded">متأخر</span>}
                      </div>
                    )}
                    {(task.priority === 'urgent' || task.priority === 'high') && (
                      <Badge variant="outline" className={cn('text-[10px]', task.priority === 'urgent' ? 'border-red-300 text-red-600 dark:border-red-800/50 dark:text-red-400' : 'border-orange-300 text-orange-600 dark:border-orange-800/50 dark:text-orange-400')}>
                        {PRIORITIES.find(p => p.key === task.priority)?.label}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* ── Description ── */}
              <div className="space-y-1 py-5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  الوصف
                </div>
                {editingDesc ? (
                  <div className="space-y-1">
                    {/* Phase 14.3 P1 fix B — placeholder + hint
                        updated to match the new plain-text rendering.
                        Markdown syntax (**bold**, *italic*, [link](url),
                        - lists) used to be auto-converted via
                        dangerouslySetInnerHTML — that path was XSS-
                        vulnerable and Pyramedia doesn't need markdown
                        in task descriptions. Both the placeholder and
                        the hint line previously advertised features
                        that no longer work; now both reflect plain-
                        text behavior so users aren't confused when
                        their **bold** displays as literal asterisks. */}
                    <Textarea
                      autoFocus
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      onBlur={saveDescription}
                      rows={5}
                      className="text-sm"
                      placeholder="أضف وصف للمهمة..."
                    />
                  </div>
                ) : (
                  <div
                    className={cn(
                      'text-sm min-h-[60px] p-3 rounded-lg border border-dashed border-border/50 cursor-pointer hover:border-orange-300 transition-colors',
                      !task.description && 'text-muted-foreground/40 italic'
                    )}
                    onClick={() => canEdit && setEditingDesc(true)}
                  >
                    {task.description ? (
                      // Phase 14.3 P1 fix B — switched from
                      // dangerouslySetInnerHTML + markdown-via-regex to
                      // plain-text rendering via JSX text node (React
                      // auto-escapes). The previous implementation ran 5
                      // .replace() passes on user-supplied text, then
                      // injected the partial-HTML result into the DOM —
                      // any text outside the regex matches was preserved
                      // verbatim, so payloads like
                      //   `**foo**<img src=x onerror=alert(1)>`
                      // executed in every viewer's browser. Locked
                      // decision: Pyramedia doesn't need markdown in
                      // task descriptions; existing descriptions render
                      // as plain text (any embedded markdown syntax
                      // becomes literal characters — acceptable for v1).
                      // `whitespace-pre-wrap` preserves user line
                      // breaks; `break-words` wraps long URLs that
                      // previously got linkified.
                      <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {task.description}
                      </div>
                    ) : 'اضغط لإضافة وصف...'}
                  </div>
                )}
              </div>

              {/* ── Checklist ── */}
              <div className="space-y-2 py-5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                    <CheckSquare className="h-3.5 w-3.5" />
                    قائمة المراجعة {checkTotal > 0 && <span className="tabular-nums text-muted-foreground/60">({checkDone}/{checkTotal})</span>}
                  </div>
                  {canEdit && (
                    <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setShowCheckInput(true)}>
                      <Plus className="h-3 w-3 me-1" /> إضافة
                    </Button>
                  )}
                </div>
                {checkTotal > 0 && (
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${checkTotal > 0 ? (checkDone / checkTotal) * 100 : 0}%` }}
                    />
                  </div>
                )}
                <div className="space-y-1">
                  {checklist.map(item => (
                    <div key={item.id} className="flex items-center gap-2 group py-0.5">
                      <button onClick={() => toggleCheckItem(item.id, item.is_checked)}>
                        <div className={cn(
                          'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                          item.is_checked ? 'bg-emerald-500 border-emerald-500' : 'border-border hover:border-emerald-400'
                        )}>
                          {item.is_checked && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </button>
                      <span className={cn('text-sm flex-1', item.is_checked && 'line-through text-muted-foreground')}>
                        {item.title}
                      </span>
                      {canEdit && (
                        <button
                          onClick={() => deleteCheckItem(item.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {showCheckInput && (
                  <div className="flex items-center gap-2">
                    <Input
                      autoFocus
                      value={newCheckItem}
                      onChange={e => setNewCheckItem(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addChecklistItem(); if (e.key === 'Escape') { setShowCheckInput(false); setNewCheckItem(''); } }}
                      placeholder="عنصر جديد..."
                      className="h-8 text-sm"
                    />
                    <Button size="sm" className="h-8" onClick={addChecklistItem}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              {/* ── Attachments ── */}
              {attachments.length > 0 && (
                <div className="space-y-2 py-5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" />
                    المرفقات <span className="tabular-nums text-muted-foreground/60">({attachments.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {attachments.map(att => {
                      const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(att.file_name);
                      return (
                        <div key={att.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50 bg-muted/20 group">
                          {isImage ? (
                            <img src={att.file_url} alt={att.file_name} className="w-12 h-12 rounded object-cover shrink-0" />
                          ) : (
                            <div className="w-12 h-12 rounded bg-muted flex items-center justify-center shrink-0">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{att.file_name}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              {/* link-type attachments (frame.io / Drive) have no size — hide the 0 B noise */}
                              {(att.file_size ?? 0) > 0 && (
                                <>
                                  <span>{formatFileSize(att.file_size)}</span>
                                  <span>·</span>
                                </>
                              )}
                              <span>{timeAgo(att.created_at)}</span>
                              {att.review_status === 'approved' && (
                                <Badge className="text-[8px] h-3.5 bg-green-500/10 text-green-600 border-0">موافق</Badge>
                              )}
                              {att.review_status === 'revision_requested' && (
                                <Badge className="text-[8px] h-3.5 bg-red-500/10 text-red-600 border-0">تعديل</Badge>
                              )}
                            </div>
                          </div>
                          <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground shrink-0">
                            <Download className="h-4 w-4" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Comments ── */}
              <div className="space-y-3 py-5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5" />
                  التعليقات <span className="tabular-nums text-muted-foreground/60">({comments.length})</span>
                </div>

                {/* Add comment */}
                {canEdit && (
                  <div className="flex items-start gap-2">
                    <Avatar className="h-7 w-7 shrink-0 mt-1">
                      <AvatarFallback className={cn('text-[10px] text-white', getAvatarColor(session.pyraUser.username))}>
                        {session.pyraUser.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-1.5">
                      <MentionTextarea
                        value={commentText}
                        onChange={setCommentText}
                        taskId={task.id}
                        placeholder="اكتب تعليق... استخدم @ للإشارة"
                        rows={2}
                        className="text-sm"
                      />
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                        disabled={!commentText.trim() || sendingComment}
                        onClick={addComment}
                      >
                        <Send className="h-3 w-3 me-1" />
                        {sendingComment ? 'إرسال...' : 'تعليق'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Comment list */}
                <div className="space-y-3">
                  {comments.map(c => (
                    <div key={c.id} className="flex items-start gap-2 group">
                      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                        <AvatarFallback className={cn('text-[10px] text-white', getAvatarColor(c.author_name))}>
                          {c.author_name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{c.author_name}</span>
                          <span className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</span>
                          {(c.author_username === session.pyraUser.username || canDelete) && (
                            <button
                              onClick={() => deleteComment(c.id)}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all ms-auto"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <div className="text-sm mt-0.5 whitespace-pre-wrap">{renderTextWithMentions(c.content)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Activity ── */}
              {activities.length > 0 && (
                <div className="space-y-2 py-5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                    <History className="h-3.5 w-3.5" />
                    سجل النشاط
                  </div>
                  <div className="space-y-1">
                    {activities.slice(0, 15).map(act => (
                      <div key={act.id} className="flex items-start gap-2 text-[11px] py-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 mt-1.5 shrink-0" />
                        <div className="text-muted-foreground">
                          <span className="font-medium text-foreground">{act.display_name}</span>
                          {' '}{ACTION_LABELS[act.action] || act.action}
                          <span className="ms-1.5 text-muted-foreground/50">&middot; {timeAgo(act.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* ═══ DESKTOP SIDEBAR (actions) ═══ */}
          <div className="hidden md:flex md:flex-col w-[200px] shrink-0 border-s border-border/50 bg-muted/20 p-4 overflow-y-auto">
            <div className="space-y-1">
              {renderActions(false)}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ═══════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════

function SidebarBtn({ icon: Icon, label, badge, onClick, compact }: {
  icon: React.ElementType; label: string; badge?: string; onClick?: () => void; compact?: boolean;
}) {
  if (compact) {
    return (
      <button
        onClick={onClick}
        className="h-8 px-2.5 rounded-lg border border-border/50 bg-muted/40 text-xs flex items-center gap-1.5 whitespace-nowrap hover:bg-muted transition-colors shrink-0"
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span>{label}</span>
        {badge && <span className="text-[10px] text-muted-foreground">{badge}</span>}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-start hover:bg-muted transition-colors"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      {badge && <span className="text-[10px] text-muted-foreground">{badge}</span>}
    </button>
  );
}

function SidebarDateBtn({ icon: Icon, label, value, onChange, isOverdue, compact }: {
  icon: React.ElementType; label: string; value: string; onChange: (v: string) => void; isOverdue?: boolean; compact?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        {compact ? (
          <button className={cn(
            'h-8 px-2.5 rounded-lg border border-border/50 bg-muted/40 text-xs flex items-center gap-1.5 whitespace-nowrap hover:bg-muted transition-colors shrink-0',
            isOverdue && 'text-red-500'
          )}>
            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span>{label}</span>
            {value && <span className="text-[10px]">{new Date(value).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}</span>}
          </button>
        ) : (
          <button className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-start hover:bg-muted transition-colors',
            isOverdue && 'text-red-500'
          )}>
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">{label}</span>
            {value && <span className="text-[10px]">{new Date(value).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}</span>}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <input
          type="date"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="text-sm bg-transparent border border-border rounded px-2 py-1"
        />
        {value && (
          <button onClick={() => onChange('')} className="text-[10px] text-red-500 mt-1 block">
            إزالة التاريخ
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ── Move to Board Picker ── */
function MoveToBoardPicker({ currentBoardId, taskId, onMoved }: {
  currentBoardId: string; taskId: string; onMoved: () => void;
}) {
  const [boards, setBoards] = useState<Array<{ id: string; name: string; pyra_board_columns?: Array<{ id: string; name: string }> }>>([]);
  const [selectedBoard, setSelectedBoard] = useState('');
  const [selectedCol, setSelectedCol] = useState('');
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    fetchAPI<Array<{ id: string; name: string; pyra_board_columns?: Array<{ id: string; name: string }> }>>('/api/boards').then(allBoards => {
      setBoards((allBoards || []).filter(b => b.id !== currentBoardId));
    }).catch(() => {});
  }, [currentBoardId]);

  const selectedBoardCols = boards.find(b => b.id === selectedBoard)?.pyra_board_columns || [];

  const handleMove = async () => {
    if (!selectedBoard || !selectedCol) return;
    setMoving(true);
    try {
      await mutateAPI(`/api/tasks/${taskId}/move`, 'POST', { column_id: selectedCol, target_board_id: selectedBoard, position: 0 });
      onMoved();
    } catch { toast.error('فشل نقل المهمة'); }
    finally { setMoving(false); }
  };

  return (
    <div className="space-y-2">
      <select
        value={selectedBoard}
        onChange={e => { setSelectedBoard(e.target.value); setSelectedCol(''); }}
        className="w-full h-8 text-xs bg-transparent border border-border rounded px-2"
      >
        <option value="">اختر لوحة...</option>
        {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      {selectedBoard && (
        <select
          value={selectedCol}
          onChange={e => setSelectedCol(e.target.value)}
          className="w-full h-8 text-xs bg-transparent border border-border rounded px-2"
        >
          <option value="">اختر قائمة...</option>
          {selectedBoardCols.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      {selectedCol && (
        <Button size="sm" className="w-full h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white" disabled={moving} onClick={handleMove}>
          {moving ? 'جاري النقل...' : 'نقل'}
        </Button>
      )}
    </div>
  );
}
