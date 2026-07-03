'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { hasPermission } from '@/lib/auth/rbac';
import {
  Plus,
  ArrowRight,
  Calendar,
  MessageSquare,
  CheckSquare,
  GripVertical,
  Trash2,
  UserPlus,
  X,
  Send,
  AlertTriangle,
  Settings,
  GitBranch,
  LayoutGrid,
  Paperclip,
  Upload,
  FileText,
  Download,
  History,
  ChevronUp,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { AuthSession } from '@/lib/auth/guards';
import { MentionTextarea } from '@/components/ui/mention-textarea';
import { renderTextWithMentions } from '@/lib/utils/mentions';
import { TaskSheet } from '@/components/boards/task-sheet';
import { BoardToolbar, applyFilters, EMPTY_FILTERS, type BoardFilters, type ViewMode } from '@/components/boards/board-toolbar';
import { BoardListView } from '@/components/boards/board-list-view';
import { BoardCalendarView } from '@/components/boards/board-calendar-view';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

// ============================================================
// Types
// ============================================================

interface Task {
  id: string;
  title: string;
  description?: string;
  column_id: string;
  position: number;
  priority: string;
  due_date?: string;
  task_number?: number;
  board_id?: string;
  created_at?: string;
  start_date?: string;
  estimated_hours?: number;
  actual_hours?: number;
  pyra_task_assignees?: { id?: string; username: string }[];
  pyra_task_labels?: {
    label_id?: string;
    pyra_board_labels: { name: string; color: string };
  }[];
  pyra_task_checklist?: {
    id: string;
    title: string;
    is_checked: boolean;
    position?: number;
  }[];
  pyra_task_comments?: {
    id: string;
    author_username?: string;
    author_name: string;
    content: string;
    created_at: string;
  }[];
}

interface Column {
  id: string;
  name: string;
  color: string;
  position: number;
  is_done_column: boolean;
  requires_approval?: boolean;
  approval_role?: string | null;
  default_assignee?: string | null;
  column_type?: string;
}

interface Board {
  id: string;
  name: string;
  description: string | null;
  view_mode?: string;
  is_pipeline?: boolean;
  auto_advance?: boolean;
  default_task_type?: string | null;
  pyra_board_columns?: Column[];
  pyra_board_labels?: { id: string; name: string; color: string }[];
}

// ============================================================
// Constants
// ============================================================

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'border-s-red-500',
  high: 'border-s-orange-500',
  medium: 'border-s-blue-500',
  low: 'border-s-gray-400',
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'عاجل',
  high: 'مرتفع',
  medium: 'متوسط',
  low: 'منخفض',
};

const COLUMN_COLORS: Record<string, string> = {
  gray: 'bg-gray-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
  orange: 'bg-orange-500',
  indigo: 'bg-indigo-500',
};

const LABEL_BG_COLORS: Record<string, string> = {
  gray: 'bg-gray-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
  orange: 'bg-orange-500',
  indigo: 'bg-indigo-500',
};

// ============================================================
// TaskCard Component
// ============================================================

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const checklist = task.pyra_task_checklist || [];
  const checked = checklist.filter((c) => c.is_checked).length;
  const labels = task.pyra_task_labels || [];
  const assignees = task.pyra_task_assignees || [];
  const comments = task.pyra_task_comments || [];
  const today = new Date().toISOString().split('T')[0];
  const isOverdue = task.due_date && task.due_date < today;
  const dueBadgeColor = (() => {
    if (!task.due_date) return '';
    const diff = Math.ceil((new Date(task.due_date).getTime() - Date.now()) / 86400000);
    if (diff < 0) return 'bg-red-500/15 text-red-600 dark:text-red-400';
    if (diff === 0) return 'bg-orange-500/15 text-orange-600 dark:text-orange-400';
    if (diff <= 3) return 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400';
    return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  })();

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="group">
      <Card
        className={`cursor-pointer hover:shadow-md transition-shadow border-s-4 ${
          PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium
        }`}
        onClick={onClick}
      >
        <CardContent className="p-3 space-y-2">
          {/* Labels */}
          {labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {labels.map((l, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-8 rounded-full inline-block ${
                    LABEL_BG_COLORS[l.pyra_board_labels?.color || 'gray'] ||
                    LABEL_BG_COLORS.gray
                  }`}
                />
              ))}
            </div>
          )}

          {/* Title + Drag Handle */}
          <div className="flex items-start gap-1">
            <button
              {...listeners}
              className="mt-1 cursor-grab opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <div className="flex-1 min-w-0">
              {task.task_number && (
                <span className="text-[10px] text-muted-foreground/50 font-mono">#{task.task_number}</span>
              )}
              <p className="text-sm font-medium line-clamp-2">{task.title}</p>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
            {task.due_date && (
              <span
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md ${dueBadgeColor}`}
              >
                <Calendar className="h-3 w-3" />
                {new Date(task.due_date).toLocaleDateString('ar-EG', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            )}
            {checklist.length > 0 && (
              <span className="flex items-center gap-0.5">
                <CheckSquare className="h-3 w-3" />
                {checked}/{checklist.length}
              </span>
            )}
            {comments.length > 0 && (
              <span className="flex items-center gap-0.5">
                <MessageSquare className="h-3 w-3" />
                {comments.length}
              </span>
            )}
          </div>

          {/* Assignees */}
          {assignees.length > 0 && (
            <div className="flex items-center gap-1 justify-end">
              {assignees.slice(0, 3).map((a, i) => (
                <Avatar key={i} className="h-5 w-5 border">
                  <AvatarFallback className="text-[8px] bg-orange-500/10 text-orange-600">
                    {a.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
              {assignees.length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{assignees.length - 3}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// DroppableColumn — wraps column with useDroppable for empty drops
// ============================================================

function DroppableColumn({
  column,
  tasks,
  onAddTask,
  onTaskClick,
  quickAddCol,
  quickAddTitle,
  onQuickAddStart,
  onQuickAddChange,
  onQuickAddSubmit,
  onQuickAddCancel,
  canCreate,
}: {
  column: Column;
  tasks: Task[];
  onAddTask: (columnId: string) => void;
  onTaskClick: (task: Task) => void;
  quickAddCol?: string | null;
  quickAddTitle?: string;
  onQuickAddStart?: (colId: string) => void;
  onQuickAddChange?: (title: string) => void;
  onQuickAddSubmit?: (colId: string) => void;
  onQuickAddCancel?: () => void;
  canCreate?: boolean;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: column.id });
  const { attributes, listeners, setNodeRef: setSortRef, transform, transition } = useSortable({ id: `col-${column.id}` });
  const style = { transform: CSS.Translate.toString(transform), transition };

  const setNodeRef = (el: HTMLDivElement | null) => {
    setDropRef(el);
    setSortRef(el);
  };
  const isQuickAdding = quickAddCol === column.id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex-shrink-0 w-[300px] snap-start rounded-xl p-3 flex flex-col max-h-[calc(100vh-260px)] transition-colors ${
        isOver
          ? 'bg-orange-500/10 ring-2 ring-orange-500/30'
          : 'bg-muted/50'
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground">
            <GripVertical className="h-4 w-4" />
          </button>
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              COLUMN_COLORS[column.color] || COLUMN_COLORS.gray
            }`}
          />
          <h3 className="text-sm font-semibold">{column.name}</h3>
          <Badge
            variant="secondary"
            className="text-[10px] h-5 min-w-5 flex items-center justify-center rounded-full"
          >
            {tasks.length}
          </Badge>
          {column.is_done_column && (
            <CheckSquare className="h-3.5 w-3.5 text-green-500" />
          )}
        </div>
        {canCreate && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onQuickAddStart?.(column.id)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Tasks */}
      <ScrollArea className="flex-1">
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2 min-h-[50px]">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={() => onTaskClick(task)}
              />
            ))}
            {tasks.length === 0 && !isQuickAdding && (
              <div className="text-center text-xs text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                اسحب مهمة هنا
              </div>
            )}
          </div>
        </SortableContext>
      </ScrollArea>

      {/* Quick-add inline input */}
      {isQuickAdding ? (
        <div className="mt-2 space-y-1.5">
          <Input
            autoFocus
            value={quickAddTitle || ''}
            onChange={e => onQuickAddChange?.(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onQuickAddSubmit?.(column.id);
              if (e.key === 'Escape') onQuickAddCancel?.();
            }}
            placeholder="عنوان المهمة..."
            className="h-8 text-sm"
          />
          <div className="flex gap-1">
            <Button size="sm" className="h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white flex-1" onClick={() => onQuickAddSubmit?.(column.id)}>
              إضافة
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onQuickAddCancel}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ) : canCreate ? (
        <button
          onClick={() => onQuickAddStart?.(column.id)}
          className="mt-2 w-full text-xs text-muted-foreground/50 hover:text-muted-foreground py-1.5 border border-dashed border-border/30 rounded-lg hover:border-orange-300 transition-colors flex items-center justify-center gap-1"
        >
          <Plus className="h-3 w-3" /> إضافة مهمة
        </button>
      ) : null}
    </div>
  );
}

// ============================================================
// TaskDetailDialog — complete task management dialog
// ============================================================

function TaskDetailDialog({
  task,
  board,
  onClose,
  onUpdate,
  session,
}: {
  task: Task;
  board: Board | null;
  onClose: () => void;
  onUpdate: () => void;
  session: AuthSession;
}) {
  const [detail, setDetail] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [priority, setPriority] = useState(task.priority || 'medium');
  const [dueDate, setDueDate] = useState(task.due_date || '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);

  // Assignee management
  const [newAssignee, setNewAssignee] = useState('');
  const [addingAssignee, setAddingAssignee] = useState(false);

  // Comment creation
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  // Checklist
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [showChecklistInput, setShowChecklistInput] = useState(false);

  // Activity log
  const [activities, setActivities] = useState<Array<{
    id: string; action: string; display_name: string; details: string; created_at: string;
  }>>([]);
  const [showActivity, setShowActivity] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<Array<{
    id: string; file_name: string; file_url: string; file_size: number;
    uploaded_by: string; review_status: string; created_at: string;
  }>>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Pipeline actions
  const [advancing, setAdvancing] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [linkDialog, setLinkDialog] = useState<null | 'review' | 'delivery'>(null);
  const [actionLink, setActionLink] = useState('');
  const [actionNote, setActionNote] = useState('');
  const canApprove = hasPermission(session.pyraUser.rolePermissions, 'boards.manage');

  const canManage = hasPermission(
    session.pyraUser.rolePermissions,
    'tasks.create'
  );
  const canDelete = hasPermission(
    session.pyraUser.rolePermissions,
    'tasks.manage'
  );

  const fetchDetail = useCallback(async () => {
    try {
      const [taskRes, attRes] = await Promise.all([
        fetch(`/api/tasks/${task.id}`),
        board ? fetch(`/api/boards/${board.id}/tasks/${task.id}/attachments`) : Promise.resolve(null),
      ]);
      const { data } = await taskRes.json();
      if (data) {
        setDetail(data);
        setTitle(data.title);
        setDescription(data.description || '');
        setPriority(data.priority || 'medium');
        setDueDate(data.due_date || '');
      }
      if (data?.pyra_task_activity) {
        setActivities(data.pyra_task_activity);
      }
      if (data?.pyra_task_attachments) {
        setAttachments(data.pyra_task_attachments);
      }
      if (attRes) {
        const attJson = await attRes.json();
        if (attJson.data?.length) setAttachments(attJson.data);
      }
    } catch {
      toast.error('فشل في تحميل تفاصيل المهمة');
    } finally {
      setLoading(false);
    }
  }, [task.id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // ── Pipeline: Advance/Approve/Reject ──
  const pipelineCols = board?.is_pipeline
    ? (board.pyra_board_columns || []).sort((a, b) => a.position - b.position)
    : [];
  const currentColIdx = pipelineCols.findIndex(c => c.id === (detail?.column_id || task.column_id));
  const nextCol = currentColIdx >= 0 && currentColIdx < pipelineCols.length - 1
    ? pipelineCols[currentColIdx + 1]
    : null;
  const isLastStage = currentColIdx === pipelineCols.length - 1;
  const needsApproval = nextCol?.requires_approval || false;

  const handleAdvance = async () => {
    if (!board) return;
    setAdvancing(true);
    try {
      const endpoint = needsApproval
        ? `/api/boards/${board.id}/tasks/${task.id}/approve`
        : `/api/boards/${board.id}/tasks/${task.id}/advance`;
      const body = needsApproval ? { action: 'approve' } : {};
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'فشل في نقل المهمة');
        return;
      }
      toast.success(needsApproval ? 'تمت الموافقة ونقل المهمة' : 'تم نقل المهمة للمرحلة التالية');
      onUpdate();
      onClose();
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setAdvancing(false);
    }
  };

  const handleReject = async () => {
    if (!board) return;
    setAdvancing(true);
    try {
      const res = await fetch(`/api/boards/${board.id}/tasks/${task.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', note: rejectNote }),
      });
      if (!res.ok) { toast.error('فشل في الرفض'); return; }
      toast.success('تم رفض المهمة وإرجاعها');
      onUpdate();
      onClose();
    } catch { toast.error('حدث خطأ'); }
    finally { setAdvancing(false); }
  };

  const handleAdvanceWithLink = async (kind: 'review' | 'delivery') => {
    if (!board) return;
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
      if (!res.ok) {
        toast.error(json.error || 'فشل في نقل المهمة');
        return;
      }
      toast.success(kind === 'review' ? 'تم رفع النسخة للمراجعة ✓' : 'تم تسجيل التسليم النهائي ✓');
      setLinkDialog(null);
      setActionLink('');
      setActionNote('');
      onUpdate();
      onClose();
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setAdvancing(false);
    }
  };

  // ── Save title/description ──
  const saveBasicFields = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم حفظ التغييرات');
      setEditingTitle(false);
      setEditingDesc(false);
      onUpdate();
    } catch {
      toast.error('فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  // ── Save priority ──
  const savePriority = async (newPriority: string) => {
    setPriority(newPriority);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: newPriority }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم تحديث الأولوية');
      onUpdate();
    } catch {
      toast.error('فشل تحديث الأولوية');
    }
  };

  // ── Save due date ──
  const saveDueDate = async (newDate: string) => {
    setDueDate(newDate);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ due_date: newDate || null }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم تحديث الموعد');
      onUpdate();
    } catch {
      toast.error('فشل تحديث الموعد');
    }
  };

  // ── Add assignee ──
  const addAssignee = async () => {
    if (!newAssignee.trim()) return;
    setAddingAssignee(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/assignees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [newAssignee.trim()] }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'فشل');
      }
      toast.success('تم تعيين المستخدم');
      setNewAssignee('');
      fetchDetail();
      onUpdate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'فشل إضافة المستخدم'
      );
    } finally {
      setAddingAssignee(false);
    }
  };

  // ── Remove assignee ──
  const removeAssignee = async (username: string) => {
    try {
      const res = await fetch(
        `/api/tasks/${task.id}/assignees?username=${encodeURIComponent(username)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error();
      toast.success('تم إزالة المستخدم');
      fetchDetail();
      onUpdate();
    } catch {
      toast.error('فشل إزالة المستخدم');
    }
  };

  // ── Toggle checklist item ──
  const toggleChecklistItem = async (
    itemId: string,
    currentState: boolean
  ) => {
    // Optimistic update
    setDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pyra_task_checklist: prev.pyra_task_checklist?.map((item) =>
          item.id === itemId
            ? { ...item, is_checked: !currentState }
            : item
        ),
      };
    });

    try {
      const res = await fetch(
        `/api/tasks/${task.id}/checklist?itemId=${itemId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_checked: !currentState }),
        }
      );
      if (!res.ok) throw new Error();
      onUpdate();
    } catch {
      toast.error('فشل تحديث العنصر');
      fetchDetail(); // Revert on error
    }
  };

  // ── Add checklist item ──
  const addChecklistItem = async () => {
    if (!newChecklistItem.trim()) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newChecklistItem.trim() }),
      });
      if (!res.ok) throw new Error();
      setNewChecklistItem('');
      setShowChecklistInput(false);
      fetchDetail();
      onUpdate();
    } catch {
      toast.error('فشل إضافة العنصر');
    }
  };

  // ── Delete checklist item ──
  const deleteChecklistItem = async (itemId: string) => {
    try {
      const res = await fetch(
        `/api/tasks/${task.id}/checklist?itemId=${itemId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error();
      fetchDetail();
      onUpdate();
    } catch {
      toast.error('فشل حذف العنصر');
    }
  };

  // ── Fetch activity log ──
  const fetchActivity = async () => {
    try {
      const res = await fetch(`/api/tasks/${task.id}`);
      const { data } = await res.json();
      if (data?.pyra_task_activity) {
        setActivities(data.pyra_task_activity);
      }
    } catch { /* silent */ }
  };

  // ── Upload attachment ──
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !board) return;
    setUploadingFile(true);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const bucket = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';
      const storagePath = `tasks/${task.id}/${Date.now()}_${file.name}`;

      // Upload to Supabase Storage
      const formData = new FormData();
      formData.append('', file);
      const uploadRes = await fetch(
        `${supabaseUrl}/storage/v1/object/${bucket}/${storagePath}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${document.cookie.split('sb-access-token=')[1]?.split(';')[0] || ''}` },
          body: formData,
        }
      );

      // Get public URL
      const fileUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}`;

      // Record in DB
      await fetch(`/api/boards/${board.id}/tasks/${task.id}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: file.name,
          file_url: fileUrl,
          file_size: file.size,
          storage_path: storagePath,
        }),
      });

      toast.success('تم رفع الملف');
      fetchDetail();
    } catch {
      toast.error('فشل رفع الملف');
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  // ── Add comment ──
  const addComment = async () => {
    if (!newComment.trim()) return;
    setSendingComment(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم إضافة التعليق');
      setNewComment('');
      fetchDetail();
    } catch {
      toast.error('فشل إضافة التعليق');
    } finally {
      setSendingComment(false);
    }
  };

  // ── Delete task ──
  const deleteTask = async () => {
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      toast.success('تم حذف المهمة');
      onClose();
      onUpdate();
    } catch {
      toast.error('فشل حذف المهمة');
    }
  };

  const checklist = detail?.pyra_task_checklist || [];
  const checkedCount = checklist.filter((c) => c.is_checked).length;
  const comments = detail?.pyra_task_comments || [];
  const assignees = detail?.pyra_task_assignees || [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-start">
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-lg font-bold"
                  onKeyDown={(e) => e.key === 'Enter' && saveBasicFields()}
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={saveBasicFields}
                  disabled={saving}
                  className="bg-orange-500 hover:bg-orange-600 text-white shrink-0"
                >
                  حفظ
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingTitle(false);
                    setTitle(detail?.title || task.title);
                  }}
                >
                  إلغاء
                </Button>
              </div>
            ) : (
              <span
                onClick={() => canManage && setEditingTitle(true)}
                className={
                  canManage
                    ? 'cursor-pointer hover:text-orange-500 transition-colors'
                    : ''
                }
              >
                {title}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : detail ? (
          <div className="space-y-5">
            {/* ── Properties Row ── */}
            <div className="flex gap-3 flex-wrap items-center">
              {/* Priority */}
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground">
                  الأولوية
                </label>
                <Select
                  value={priority}
                  onValueChange={savePriority}
                  disabled={!canManage}
                >
                  <SelectTrigger className="w-[120px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">عاجل</SelectItem>
                    <SelectItem value="high">مرتفع</SelectItem>
                    <SelectItem value="medium">متوسط</SelectItem>
                    <SelectItem value="low">منخفض</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Due Date */}
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground">
                  تاريخ التسليم
                </label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => saveDueDate(e.target.value)}
                  disabled={!canManage}
                  className="w-[150px] h-8 text-xs"
                />
              </div>

              {/* Priority badge visual */}
              <Badge
                variant="outline"
                className={`border-s-4 mt-4 ${
                  PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium
                }`}
              >
                {PRIORITY_LABELS[priority] || PRIORITY_LABELS.medium}
              </Badge>
            </div>

            {/* ── Description ── */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                الوصف
              </label>
              {editingDesc ? (
                <div className="space-y-2">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="أضف وصفاً للمهمة..."
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingDesc(false);
                        setDescription(detail.description || '');
                      }}
                    >
                      إلغاء
                    </Button>
                    <Button
                      size="sm"
                      onClick={saveBasicFields}
                      disabled={saving}
                      className="bg-orange-500 hover:bg-orange-600 text-white"
                    >
                      حفظ
                    </Button>
                  </div>
                </div>
              ) : (
                <p
                  className={`text-sm whitespace-pre-wrap p-2 rounded border border-transparent ${
                    canManage
                      ? 'cursor-pointer hover:bg-muted/50 hover:border-border'
                      : ''
                  } ${description ? 'text-foreground' : 'text-muted-foreground italic'}`}
                  onClick={() => canManage && setEditingDesc(true)}
                >
                  {description || 'انقر لإضافة وصف...'}
                </p>
              )}
            </div>

            {/* ── Assignees ── */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <UserPlus className="h-3.5 w-3.5" />
                المعيّنون ({assignees.length})
              </label>
              <div className="flex flex-wrap gap-2">
                {assignees.map((a) => (
                  <Badge
                    key={a.username}
                    variant="secondary"
                    className="flex items-center gap-1 pe-1"
                  >
                    <Avatar className="h-4 w-4">
                      <AvatarFallback className="text-[7px] bg-orange-500/10 text-orange-600">
                        {a.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs">{a.username}</span>
                    {canManage && (
                      <button
                        onClick={() => removeAssignee(a.username)}
                        className="hover:text-red-500 transition-colors ms-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                ))}
                {assignees.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">
                    لا يوجد معيّنون
                  </span>
                )}
              </div>
              {canManage && (
                <div className="flex items-center gap-2">
                  <Input
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    placeholder="اسم المستخدم..."
                    className="h-8 text-xs flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && addAssignee()}
                  />
                  <Button
                    size="sm"
                    onClick={addAssignee}
                    disabled={!newAssignee.trim() || addingAssignee}
                    className="h-8 bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {/* ── Checklist ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <CheckSquare className="h-3.5 w-3.5" />
                  قائمة المهام الفرعية
                  {checklist.length > 0 && (
                    <span className="text-[10px]">
                      ({checkedCount}/{checklist.length})
                    </span>
                  )}
                </label>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setShowChecklistInput(true)}
                  >
                    <Plus className="h-3 w-3 me-1" />
                    إضافة
                  </Button>
                )}
              </div>

              {/* Progress bar */}
              {checklist.length > 0 && (
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{
                      width: `${
                        checklist.length > 0
                          ? (checkedCount / checklist.length) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              )}

              <div className="space-y-1">
                {checklist
                  .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 group/item py-1"
                    >
                      <input
                        type="checkbox"
                        checked={item.is_checked}
                        onChange={() =>
                          toggleChecklistItem(item.id, item.is_checked)
                        }
                        className="rounded accent-orange-500 cursor-pointer"
                      />
                      <span
                        className={`text-sm flex-1 ${
                          item.is_checked
                            ? 'line-through text-muted-foreground'
                            : ''
                        }`}
                      >
                        {item.title}
                      </span>
                      {canManage && (
                        <button
                          onClick={() => deleteChecklistItem(item.id)}
                          className="opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-red-500 transition-all"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
              </div>

              {showChecklistInput && (
                <div className="flex items-center gap-2">
                  <Input
                    value={newChecklistItem}
                    onChange={(e) => setNewChecklistItem(e.target.value)}
                    placeholder="عنصر جديد..."
                    className="h-8 text-xs flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addChecklistItem();
                      if (e.key === 'Escape') setShowChecklistInput(false);
                    }}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="h-8 bg-orange-500 hover:bg-orange-600 text-white"
                    onClick={addChecklistItem}
                    disabled={!newChecklistItem.trim()}
                  >
                    إضافة
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => {
                      setShowChecklistInput(false);
                      setNewChecklistItem('');
                    }}
                  >
                    إلغاء
                  </Button>
                </div>
              )}
            </div>

            {/* ── Attachments ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Paperclip className="h-3.5 w-3.5" />
                  المرفقات ({attachments.length})
                </label>
                {canManage && (
                  <label className="cursor-pointer">
                    <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploadingFile} />
                    <span className="inline-flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 transition-colors">
                      <Upload className="h-3 w-3" />
                      {uploadingFile ? 'جاري الرفع...' : 'رفع ملف'}
                    </span>
                  </label>
                )}
              </div>
              {attachments.length > 0 && (
                <div className="space-y-1.5">
                  {attachments.map(att => (
                    <div key={att.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-muted/20 text-xs">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <a
                        href={att.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 truncate hover:text-orange-500 transition-colors"
                      >
                        {att.file_name}
                      </a>
                      {att.review_status === 'approved' && (
                        <Badge className="text-[9px] h-4 bg-green-500/10 text-green-600 border-0">موافق</Badge>
                      )}
                      {att.review_status === 'revision_requested' && (
                        <Badge className="text-[9px] h-4 bg-red-500/10 text-red-600 border-0">تعديل</Badge>
                      )}
                      <a href={att.file_url} download className="text-muted-foreground hover:text-foreground">
                        <Download className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Comments ── */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                التعليقات ({comments.length})
              </label>

              {/* Comment list */}
              {comments.length > 0 && (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {comments.map((c) => (
                    <div
                      key={c.id}
                      className="bg-muted/50 rounded-lg p-3"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[7px] bg-orange-500/10 text-orange-600">
                            {(c.author_name || '??')
                              .slice(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium">
                          {c.author_name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(c.created_at).toLocaleDateString(
                            'ar-EG',
                            {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }
                          )}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">
                        {renderTextWithMentions(c.content, 'dashboard')}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* New comment input */}
              <div className="flex items-start gap-2">
                <MentionTextarea
                  value={newComment}
                  onChange={setNewComment}
                  taskId={task.id}
                  variant="dashboard"
                  placeholder="اكتب تعليقاً... (استخدم @ للإشارة)"
                  rows={2}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      addComment();
                    }
                  }}
                />
                <Button
                  size="sm"
                  onClick={addComment}
                  disabled={!newComment.trim() || sendingComment}
                  className="h-8 bg-orange-500 hover:bg-orange-600 text-white"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* ── Activity Log ── */}
            <div className="space-y-2">
              <button
                onClick={() => { setShowActivity(!showActivity); if (!showActivity && activities.length === 0) fetchActivity(); }}
                className="text-xs font-medium text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <History className="h-3.5 w-3.5" />
                سجل النشاط ({activities.length})
                <span className="text-[10px]">{showActivity ? '▲' : '▼'}</span>
              </button>
              {showActivity && activities.length > 0 && (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {activities
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .slice(0, 20)
                    .map(act => {
                      const ACTION_LABELS: Record<string, string> = {
                        created: 'أنشأ المهمة',
                        moved: 'نقل المهمة',
                        assignee_added: 'أضاف معين',
                        assignee_removed: 'أزال معين',
                        comment_added: 'أضاف تعليق',
                        checklist_added: 'أضاف عنصر قائمة',
                        stage_advanced: 'نقل للمرحلة التالية',
                        stage_approved: 'وافق على النقل',
                        stage_rejected: 'رفض النقل',
                        file_uploaded: 'رفع ملف',
                        file_approved: 'وافق على ملف',
                        file_revision_requested: 'طلب تعديل ملف',
                      };
                      const timeAgo = (() => {
                        const diff = Date.now() - new Date(act.created_at).getTime();
                        const mins = Math.floor(diff / 60000);
                        if (mins < 60) return `منذ ${mins} دقيقة`;
                        const hrs = Math.floor(mins / 60);
                        if (hrs < 24) return `منذ ${hrs} ساعة`;
                        return `منذ ${Math.floor(hrs / 24)} يوم`;
                      })();
                      return (
                        <div key={act.id} className="flex items-start gap-2 text-[11px] py-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 mt-1.5 shrink-0" />
                          <div>
                            <span className="font-medium">{act.display_name}</span>
                            {' '}
                            <span className="text-muted-foreground">{ACTION_LABELS[act.action] || act.action}</span>
                            <span className="text-muted-foreground/50 ms-1.5">{timeAgo}</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* ── Pipeline Actions (role-aware, link-gated) ── */}
            {board?.is_pipeline && nextCol && !isLastStage && (
              <div className="pt-3 border-t space-y-2">
                {/* Submit for review — needs a review link */}
                {nextCol.column_type === 'review' && canManage && (
                  linkDialog === 'review' ? (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 space-y-2">
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-300">رابط النسخة (frame.io أو Google Drive)</p>
                      <Input value={actionLink} onChange={e => setActionLink(e.target.value)} placeholder="https://f.io/..." className="h-8 text-xs" dir="ltr" />
                      <Input value={actionNote} onChange={e => setActionNote(e.target.value)} placeholder="ملاحظة اختيارية..." className="h-8 text-xs" />
                      <div className="flex gap-1.5">
                        <Button size="sm" className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-white" disabled={advancing || !actionLink.trim()} onClick={() => handleAdvanceWithLink('review')}>
                          {advancing ? 'جاري...' : 'رفع للمراجعة 👀'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setLinkDialog(null)}>إلغاء</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" className="h-9 text-xs w-full bg-amber-500 hover:bg-amber-600 text-white" onClick={() => setLinkDialog('review')}>
                      👀 رفع للمراجعة
                    </Button>
                  )
                )}

                {/* Approval gate — admin approves/rejects; employee sees waiting state */}
                {nextCol.requires_approval && (
                  canApprove ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                      <GitBranch className="h-4 w-4 text-emerald-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-emerald-700 dark:text-emerald-300">قرار المراجعة — راجع الرابط في المرفقات أولاً</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {showReject ? (
                          <div className="flex items-center gap-1.5">
                            <Input value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="ملخص التعديلات المطلوبة (إجباري)..." className="h-8 text-xs w-44" />
                            <Button size="sm" variant="destructive" className="h-8 text-xs" disabled={advancing || !rejectNote.trim()} onClick={handleReject}>طلب تعديل ✗</Button>
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowReject(false)}>إلغاء</Button>
                          </div>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" className="h-8 text-xs text-red-500" onClick={() => setShowReject(true)}>طلب تعديل</Button>
                            <Button size="sm" className="h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white" disabled={advancing} onClick={handleAdvance}>
                              {advancing ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري...</> : 'اعتماد ✓'}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-center">
                      <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">⏳ في انتظار مراجعة الأدمن</p>
                    </div>
                  )
                )}

                {/* Final delivery — needs the final Drive link */}
                {nextCol.column_type === 'delivery' && canManage && (
                  linkDialog === 'delivery' ? (
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 space-y-2">
                      <p className="text-xs font-medium text-green-800 dark:text-green-300">رابط الفاينل على Google Drive (فولدر التسليمات)</p>
                      <Input value={actionLink} onChange={e => setActionLink(e.target.value)} placeholder="https://drive.google.com/..." className="h-8 text-xs" dir="ltr" />
                      <div className="flex gap-1.5">
                        <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white" disabled={advancing || !actionLink.trim()} onClick={() => handleAdvanceWithLink('delivery')}>
                          {advancing ? 'جاري...' : 'تسليم نهائي 📦'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setLinkDialog(null)}>إلغاء</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" className="h-9 text-xs w-full bg-green-600 hover:bg-green-700 text-white" onClick={() => setLinkDialog('delivery')}>
                      📦 تسليم نهائي
                    </Button>
                  )
                )}

                {/* Generic advance for untyped, non-gated columns */}
                {!nextCol.requires_approval && nextCol.column_type !== 'review' && nextCol.column_type !== 'delivery' && canManage && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                    <GitBranch className="h-4 w-4 text-emerald-500 shrink-0" />
                    <p className="flex-1 text-xs text-emerald-700 dark:text-emerald-300">المرحلة التالية: <strong>{nextCol.name}</strong></p>
                    <Button size="sm" className="h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white" disabled={advancing} onClick={handleAdvance}>
                      {advancing ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري...</> : 'نقل للتالي'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ── Pipeline Complete Indicator ── */}
            {board?.is_pipeline && isLastStage && (
              <div className="pt-3 border-t">
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 text-center">
                  <p className="text-xs text-green-700 dark:text-green-300 font-medium">✅ هذه المهمة في المرحلة الأخيرة — مكتملة</p>
                </div>
              </div>
            )}

            {/* ── Delete Section ── */}
            {canDelete && (
              <div className="pt-3 border-t">
                {showDeleteConfirm ? (
                  <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
                    <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-800 dark:text-red-300">
                        هل أنت متأكد من حذف هذه المهمة؟
                      </p>
                      <p className="text-xs text-red-600/70 dark:text-red-400/70">
                        لا يمكن التراجع عن هذا الإجراء
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowDeleteConfirm(false)}
                      >
                        إلغاء
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={deleteTask}
                      >
                        حذف
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="h-4 w-4 me-2" />
                    حذف المهمة
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Main Board View Component
// ============================================================

export default function BoardViewClient({
  boardId,
  session,
}: {
  boardId: string;
  session: AuthSession;
}) {
  const router = useRouter();
  const [board, setBoard] = useState<Board | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Settings dialog state
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Toolbar state
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS);
  const [currentViewMode, setCurrentViewMode] = useState<ViewMode>('kanban');

  // Quick-add inline state (per-column)
  const [quickAddCol, setQuickAddCol] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');

  // Add task dialog state
  const [showAddTask, setShowAddTask] = useState(false);
  const [addToColumn, setAddToColumn] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskAssignees, setNewTaskAssignees] = useState('');

  const canCreate = hasPermission(
    session.pyraUser.rolePermissions,
    'tasks.create'
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchBoard = useCallback(async () => {
    try {
      const [boardRes, tasksRes] = await Promise.all([
        fetch(`/api/boards/${boardId}`),
        fetch(`/api/boards/${boardId}/tasks`),
      ]);
      if (boardRes.ok) {
        const { data } = await boardRes.json();
        setBoard(data);
      } else {
        toast.error('فشل تحميل اللوحة');
      }
      if (tasksRes.ok) {
        const { data } = await tasksRes.json();
        setTasks(data || []);
      } else {
        toast.error('فشل تحميل المهام');
      }
    } catch {
      toast.error('حدث خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // Set view mode from board config
  useEffect(() => {
    if (board?.view_mode === 'pipeline') setCurrentViewMode('pipeline');
  }, [board?.view_mode]);

  // ── Realtime subscription ──
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`board-${boardId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pyra_tasks', filter: `board_id=eq.${boardId}` }, () => {
        fetchBoard();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pyra_task_comments' }, () => {
        // Refresh when comments change (no board_id filter available)
        fetchBoard();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [boardId, fetchBoard]);

  // ── Quick add task ──
  const quickAddTask = async (columnId: string) => {
    if (!quickAddTitle.trim()) { setQuickAddCol(null); return; }
    try {
      const res = await fetch(`/api/boards/${boardId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: quickAddTitle.trim(), column_id: columnId }),
      });
      if (res.ok) {
        toast.success('تم إضافة المهمة');
        setQuickAddTitle('');
        setQuickAddCol(null);
        fetchBoard();
      }
    } catch { toast.error('فشل إضافة المهمة'); }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;
    if (active.id === over.id) return;

    // ── Column reorder ──
    const activeStr = active.id as string;
    const overStr = over.id as string;
    if (activeStr.startsWith('col-') && overStr.startsWith('col-')) {
      const fromId = activeStr.replace('col-', '');
      const toId = overStr.replace('col-', '');
      const oldCols = (board?.pyra_board_columns || []).sort((a, b) => a.position - b.position);
      const fromIdx = oldCols.findIndex(c => c.id === fromId);
      const toIdx = oldCols.findIndex(c => c.id === toId);
      if (fromIdx === -1 || toIdx === -1) return;
      const newCols = [...oldCols];
      const [moved] = newCols.splice(fromIdx, 1);
      newCols.splice(toIdx, 0, moved);
      // Optimistic update
      if (board) {
        setBoard({ ...board, pyra_board_columns: newCols.map((c, i) => ({ ...c, position: i })) });
      }
      // Save to API
      const payload = newCols.map((c, i) => ({ id: c.id, position: i, name: c.name, color: c.color }));
      try {
        await fetch(`/api/boards/${boardId}/columns`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ columns: payload }),
        });
        toast.success('تم إعادة ترتيب الأعمدة');
      } catch {
        toast.error('فشل حفظ الترتيب');
        fetchBoard();
      }
      return;
    }

    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const columns: Column[] = board?.pyra_board_columns || [];

    // Determine target column and position
    let targetColumnId: string;
    let targetPosition: number;

    // Check if dropped directly on a column (empty column or column header)
    const droppedOnColumn = columns.find((c) => c.id === over.id);
    if (droppedOnColumn) {
      targetColumnId = droppedOnColumn.id;
      // Place at end of column
      const columnTasks = tasks.filter(
        (t) => t.column_id === targetColumnId && t.id !== taskId
      );
      targetPosition = columnTasks.length;
    } else {
      // Dropped on another task — find its column
      const overTask = tasks.find((t) => t.id === over.id);
      if (!overTask) return;
      targetColumnId = overTask.column_id;
      targetPosition = overTask.position;
    }

    // Validate target column exists
    const isValidColumn = columns.some((c) => c.id === targetColumnId);
    if (!isValidColumn) return;

    // Skip if same position in same column
    if (
      task.column_id === targetColumnId &&
      task.position === targetPosition
    ) {
      return;
    }

    // Pipeline gated columns must go through the task action buttons —
    // the server rejects raw moves into them (see /api/tasks/[id]/move guard)
    if (board?.is_pipeline && task.column_id !== targetColumnId) {
      const targetCol = columns.find((c) => c.id === targetColumnId);
      if (
        targetCol &&
        (targetCol.column_type === 'review' ||
          targetCol.column_type === 'delivery' ||
          targetCol.requires_approval)
      ) {
        toast.info('هذا العمود له إجراء مخصوص — افتح المهمة واستخدم الزر (رفع للمراجعة / اعتماد / تسليم نهائي)');
        return;
      }
    }

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, column_id: targetColumnId, position: targetPosition }
          : t
      )
    );

    // API call
    try {
      const res = await fetch(`/api/tasks/${taskId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          column_id: targetColumnId,
          position: targetPosition,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم نقل المهمة');
    } catch {
      toast.error('فشل نقل المهمة');
      fetchBoard(); // Revert on error
    }
  };

  const addTask = async () => {
    if (!newTaskTitle.trim()) return;
    try {
      const body: Record<string, unknown> = {
        title: newTaskTitle,
        column_id: addToColumn,
        priority: newTaskPriority,
      };
      if (newTaskDueDate) body.due_date = newTaskDueDate;
      if (newTaskAssignees.trim()) {
        body.assignees = newTaskAssignees
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }

      const res = await fetch(`/api/boards/${boardId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success('تم إضافة المهمة');
        setNewTaskTitle('');
        setNewTaskPriority('medium');
        setNewTaskDueDate('');
        setNewTaskAssignees('');
        setShowAddTask(false);
        fetchBoard();
      } else {
        const err = await res.json();
        toast.error(err.error || 'فشل إضافة المهمة');
      }
    } catch {
      toast.error('فشل إضافة المهمة');
    }
  };

  const openAddTask = (columnId: string) => {
    setAddToColumn(columnId);
    setNewTaskTitle('');
    setNewTaskPriority('medium');
    setNewTaskDueDate('');
    setNewTaskAssignees('');
    setShowAddTask(true);
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-[300px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="p-6 flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-lg font-semibold">اللوحة غير موجودة</h2>
        <p className="text-muted-foreground text-sm mt-1">
          قد يكون تم حذفها أو لا تملك صلاحية الوصول
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push('/dashboard/boards')}
        >
          <ArrowRight className="h-4 w-4 me-2" />
          الرجوع للوحات
        </Button>
      </div>
    );
  }

  const handleSaveSettings = async (updates: Record<string, unknown>) => {
    setSavingSettings(true);
    try {
      const res = await fetch(`/api/boards/${boardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error();
      toast.success('تم حفظ الإعدادات');
      fetchBoard();
      setShowSettings(false);
    } catch {
      toast.error('فشل حفظ الإعدادات');
    } finally {
      setSavingSettings(false);
    }
  };

  const columns: Column[] = (board.pyra_board_columns || []).sort(
    (a, b) => a.position - b.position
  );

  // Collect unique assignees for filter dropdown
  const assigneeList = Array.from(new Set(tasks.flatMap(t => (t.pyra_task_assignees || []).map(a => a.username))));
  const labelList = (board.pyra_board_labels as Array<{ id: string; name: string; color: string }>) || [];

  // Apply filters
  const filteredTasks = applyFilters(tasks, filters);

  return (
    <div className="p-6 space-y-4">
      {/* Board Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/boards')} aria-label="رجوع">
          <ArrowRight className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{board.name}</h1>
          {board.description && <p className="text-xs text-muted-foreground truncate">{board.description}</p>}
        </div>
      </div>

      {/* Toolbar */}
      <BoardToolbar
        taskCount={filteredTasks.length}
        columnCount={columns.length}
        isPipeline={board.is_pipeline || false}
        viewMode={currentViewMode}
        onViewModeChange={setCurrentViewMode}
        filters={filters}
        onFiltersChange={setFilters}
        assigneeList={assigneeList}
        labelList={labelList}
        onSettingsClick={() => setShowSettings(true)}
        canManage={hasPermission(session.pyraUser.rolePermissions, 'boards.manage')}
      />

      {/* ── Views ── */}
      {currentViewMode === 'pipeline' ? (
        <PipelineView
          columns={columns}
          tasks={filteredTasks}
          onAddTask={canCreate ? openAddTask : () => {}}
          onTaskClick={(task) => setSelectedTask(task)}
        />
      ) : currentViewMode === 'list' ? (
        <BoardListView
          tasks={filteredTasks}
          columns={columns}
          boardId={boardId}
          onTaskClick={(task) => setSelectedTask(task)}
          onUpdate={fetchBoard}
          canEdit={canCreate}
        />
      ) : currentViewMode === 'calendar' ? (
        <BoardCalendarView
          tasks={filteredTasks}
          onTaskClick={(task) => setSelectedTask(task)}
          onQuickAdd={(colId, dueDate) => {
            setAddToColumn(colId);
            setNewTaskDueDate(dueDate);
            setNewTaskTitle('');
            setShowAddTask(true);
          }}
          defaultColumnId={columns[0]?.id || ''}
        />
      ) : (
        /* ── Kanban Board ── */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={columns.map(c => `col-${c.id}`)} strategy={verticalListSortingStrategy}>
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory" dir="ltr">
            {columns.map((col) => {
              const colTasks = filteredTasks
                .filter((t) => t.column_id === col.id)
                .sort((a, b) => a.position - b.position);
              return (
                <DroppableColumn
                  key={col.id}
                  column={col}
                  tasks={colTasks}
                  onAddTask={canCreate ? openAddTask : () => {}}
                  onTaskClick={(task) => setSelectedTask(task)}
                  quickAddCol={quickAddCol}
                  quickAddTitle={quickAddTitle}
                  onQuickAddStart={(colId) => { setQuickAddCol(colId); setQuickAddTitle(''); }}
                  onQuickAddChange={setQuickAddTitle}
                  onQuickAddSubmit={quickAddTask}
                  onQuickAddCancel={() => { setQuickAddCol(null); setQuickAddTitle(''); }}
                  canCreate={canCreate}
                />
              );
            })}
          </div>
          </SortableContext>

          <DragOverlay>
            {activeTask ? (
              <Card
                className={`w-[280px] border-s-4 ${
                  PRIORITY_COLORS[activeTask.priority] ||
                  PRIORITY_COLORS.medium
                } shadow-xl rotate-2`}
              >
                <CardContent className="p-3 space-y-1">
                  <p className="text-sm font-medium">{activeTask.title}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Badge variant="outline" className="text-[9px] h-4">
                      {PRIORITY_LABELS[activeTask.priority] ||
                        PRIORITY_LABELS.medium}
                    </Badge>
                    {activeTask.due_date && (
                      <span className="flex items-center gap-0.5">
                        <Calendar className="h-3 w-3" />
                        {new Date(activeTask.due_date).toLocaleDateString(
                          'ar-EG',
                          { month: 'short', day: 'numeric' }
                        )}
                      </span>
                    )}
                  </div>
                  {(activeTask.pyra_task_assignees?.length ?? 0) > 0 && (
                    <div className="flex items-center gap-1">
                      {activeTask.pyra_task_assignees?.slice(0, 3).map((a, i) => (
                        <Avatar key={i} className="h-4 w-4 border">
                          <AvatarFallback className="text-[6px] bg-orange-500/10 text-orange-600">
                            {a.username.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Enhanced Add Task Dialog */}
      <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة مهمة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">عنوان المهمة</label>
              <Input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="عنوان المهمة..."
                onKeyDown={(e) => e.key === 'Enter' && addTask()}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">الأولوية</label>
                <Select
                  value={newTaskPriority}
                  onValueChange={setNewTaskPriority}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">عاجل</SelectItem>
                    <SelectItem value="high">مرتفع</SelectItem>
                    <SelectItem value="medium">متوسط</SelectItem>
                    <SelectItem value="low">منخفض</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">تاريخ التسليم</label>
                <Input
                  type="date"
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                المعيّنون (أسماء مستخدمين مفصولة بفاصلة)
              </label>
              <Input
                value={newTaskAssignees}
                onChange={(e) => setNewTaskAssignees(e.target.value)}
                placeholder="مثال: ahmed, sara, ali"
              />
            </div>

            <Button
              onClick={addTask}
              disabled={!newTaskTitle.trim()}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white"
            >
              إضافة
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task Sheet (Trello-style) */}
      {selectedTask && (
        <TaskSheet
          taskId={selectedTask.id}
          board={board}
          onClose={() => setSelectedTask(null)}
          onUpdate={fetchBoard}
          session={session}
        />
      )}

      {/* Board Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إعدادات اللوحة</DialogTitle>
          </DialogHeader>
          <BoardSettingsForm
            board={board}
            boardId={boardId}
            saving={savingSettings}
            onSave={handleSaveSettings}
            onUpdate={fetchBoard}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Pipeline View Component ── */
const STAGE_COLORS: Record<string, string> = {
  gray: 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600',
  blue: 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700',
  purple: 'bg-purple-50 dark:bg-purple-950/30 border-purple-300 dark:border-purple-700',
  pink: 'bg-pink-50 dark:bg-pink-950/30 border-pink-300 dark:border-pink-700',
  yellow: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-300 dark:border-yellow-700',
  orange: 'bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700',
  green: 'bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-700',
  red: 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700',
  indigo: 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700',
};

const STAGE_DOT_COLORS: Record<string, string> = {
  gray: 'bg-gray-400', blue: 'bg-blue-500', purple: 'bg-purple-500',
  pink: 'bg-pink-500', yellow: 'bg-yellow-500', orange: 'bg-orange-500',
  green: 'bg-green-500', red: 'bg-red-500', indigo: 'bg-indigo-500',
};

function PipelineView({
  columns,
  tasks,
  onAddTask,
  onTaskClick,
}: {
  columns: Column[];
  tasks: Task[];
  onAddTask: (columnId: string) => void;
  onTaskClick: (task: Task) => void;
}) {
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => {
    const col = columns.find(c => c.id === t.column_id);
    return col?.is_done_column;
  }).length;
  const progressPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Overall Progress Bar */}
      <div className="bg-card/50 border border-border/60 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">التقدم الكلي</span>
          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{progressPercent}%</span>
        </div>
        <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-l from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
          <span>{doneTasks} مكتمل من {totalTasks}</span>
          <span>{columns.length} مراحل</span>
        </div>
      </div>

      {/* Stage Pipeline - Horizontal */}
      <div className="flex gap-1 overflow-x-auto pb-2" dir="ltr">
        {columns.map((col, idx) => {
          const stageTasks = tasks
            .filter(t => t.column_id === col.id)
            .sort((a, b) => a.position - b.position);
          const isLast = idx === columns.length - 1;

          return (
            <div key={col.id} className="flex items-start min-w-0">
              {/* Stage */}
              <div className="min-w-[220px] max-w-[280px] flex-shrink-0">
                {/* Stage Header */}
                <div className={`rounded-t-xl border-2 p-3 ${STAGE_COLORS[col.color] || STAGE_COLORS.gray}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${STAGE_DOT_COLORS[col.color] || STAGE_DOT_COLORS.gray}`} />
                      <span className="text-sm font-semibold" dir="rtl">{col.name}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {stageTasks.length}
                    </Badge>
                  </div>
                  {col.requires_approval && (
                    <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      يتطلب موافقة
                    </div>
                  )}
                </div>

                {/* Tasks in stage */}
                <div className="border-x-2 border-b-2 border-border/40 rounded-b-xl bg-card/30 min-h-[80px] p-2 space-y-2">
                  {stageTasks.map(task => (
                    <button
                      key={task.id}
                      onClick={() => onTaskClick(task)}
                      className={`w-full text-start p-2.5 rounded-lg border border-border/50 bg-card hover:border-emerald-400/60 transition-colors cursor-pointer border-s-4 ${
                        PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium
                      }`}
                      dir="rtl"
                    >
                      <p className="text-sm font-medium line-clamp-2">{task.title}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                        {task.due_date && (
                          <span className="flex items-center gap-0.5">
                            <Calendar className="h-3 w-3" />
                            {new Date(task.due_date).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        {(task.pyra_task_assignees?.length ?? 0) > 0 && (
                          <div className="flex items-center -space-x-1">
                            {task.pyra_task_assignees?.slice(0, 2).map((a, i) => (
                              <Avatar key={i} className="h-4 w-4 border border-card">
                                <AvatarFallback className="text-[6px] bg-emerald-500/10 text-emerald-600">
                                  {a.username.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                  {/* Add task button */}
                  <button
                    onClick={() => onAddTask(col.id)}
                    className="w-full p-2 rounded-lg border border-dashed border-border/50 text-muted-foreground/50 hover:border-emerald-400/60 hover:text-emerald-500 transition-colors text-xs flex items-center justify-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span dir="rtl">إضافة مهمة</span>
                  </button>
                </div>
              </div>

              {/* Arrow between stages */}
              {!isLast && (
                <div className="flex items-center px-1 pt-8 flex-shrink-0">
                  <div className="w-5 h-0.5 bg-border" />
                  <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-s-[6px] border-s-border" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Board Settings Form ── */
function BoardSettingsForm({
  board,
  boardId,
  saving,
  onSave,
  onUpdate,
}: {
  board: Board;
  boardId: string;
  saving: boolean;
  onSave: (updates: Record<string, unknown>) => void;
  onUpdate: () => void;
}) {
  // General
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description || '');
  const [viewMode, setViewMode] = useState(board.view_mode || 'kanban');
  const [isPipeline, setIsPipeline] = useState(board.is_pipeline || false);
  const [autoAdvance, setAutoAdvance] = useState(board.auto_advance || false);

  // Columns
  const [cols, setCols] = useState(
    (board.pyra_board_columns || []).sort((a, b) => a.position - b.position).map(c => ({ ...c }))
  );
  const [newColName, setNewColName] = useState('');
  const [newColColor, setNewColColor] = useState('gray');

  // Labels
  const [lbls, setLbls] = useState(board.pyra_board_labels || []);
  const [newLblName, setNewLblName] = useState('');
  const [newLblColor, setNewLblColor] = useState('blue');

  const COL_COLORS = ['gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink', 'indigo'];
  const COLOR_DOT: Record<string, string> = {
    gray: 'bg-gray-500', blue: 'bg-blue-500', green: 'bg-green-500', yellow: 'bg-yellow-500',
    orange: 'bg-orange-500', red: 'bg-red-500', purple: 'bg-purple-500', pink: 'bg-pink-500', indigo: 'bg-indigo-500',
  };

  const handleSaveGeneral = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), description: description.trim() || null, view_mode: viewMode, is_pipeline: isPipeline, auto_advance: autoAdvance });
  };

  // Column CRUD
  const addColumn = async () => {
    if (!newColName.trim()) return;
    const res = await fetch(`/api/boards/${boardId}/columns`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newColName.trim(), color: newColColor, position: cols.length }),
    });
    if (res.ok) { toast.success('تم إضافة العمود'); setNewColName(''); onUpdate(); const { data } = await res.json(); setCols(prev => [...prev, data]); }
    else toast.error('فشل إضافة العمود');
  };

  const saveColumns = async () => {
    const payload = cols.map((c, i) => ({ id: c.id, position: i, name: c.name, color: c.color }));
    const res = await fetch(`/api/boards/${boardId}/columns`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columns: payload }),
    });
    if (res.ok) { toast.success('تم حفظ الأعمدة'); onUpdate(); }
    else toast.error('فشل حفظ الأعمدة');
  };

  const deleteColumn = async (colId: string) => {
    const res = await fetch(`/api/boards/${boardId}/columns?columnId=${colId}`, { method: 'DELETE' });
    const json = await res.json();
    if (res.ok) { toast.success('تم حذف العمود'); setCols(prev => prev.filter(c => c.id !== colId)); onUpdate(); }
    else toast.error(json.error || 'فشل حذف العمود');
  };

  const moveCol = (idx: number, dir: -1 | 1) => {
    const next = [...cols];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setCols(next);
  };

  // Label CRUD
  const addLabel = async () => {
    if (!newLblName.trim()) return;
    const res = await fetch(`/api/boards/${boardId}/labels`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newLblName.trim(), color: newLblColor }),
    });
    if (res.ok) { toast.success('تم إضافة التصنيف'); setNewLblName(''); const { data } = await res.json(); setLbls(prev => [...prev, data]); onUpdate(); }
    else toast.error('فشل إضافة التصنيف');
  };

  const deleteLabel = async (labelId: string) => {
    const res = await fetch(`/api/boards/${boardId}/labels?labelId=${labelId}`, { method: 'DELETE' });
    if (res.ok) { toast.success('تم حذف التصنيف'); setLbls(prev => prev.filter(l => l.id !== labelId)); onUpdate(); }
    else toast.error('فشل حذف التصنيف');
  };

  return (
    <Tabs defaultValue="general" className="mt-2">
      <TabsList className="w-full">
        <TabsTrigger value="general" className="flex-1 text-xs">عام</TabsTrigger>
        <TabsTrigger value="columns" className="flex-1 text-xs">الأعمدة ({cols.length})</TabsTrigger>
        <TabsTrigger value="labels" className="flex-1 text-xs">التصنيفات ({lbls.length})</TabsTrigger>
      </TabsList>

      {/* ── General ── */}
      <TabsContent value="general" className="space-y-4 mt-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">اسم اللوحة</label>
          <Input value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">الوصف</label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="وصف مختصر..." />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">نوع العرض</label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setViewMode('kanban'); setIsPipeline(false); }} className={`p-2.5 rounded-lg border text-start transition-colors flex items-center gap-2 ${viewMode === 'kanban' ? 'border-orange-500 bg-orange-500/10' : 'border-border hover:border-orange-300'}`}>
              <LayoutGrid className="h-4 w-4 text-orange-500" /><div><p className="text-sm font-medium">كانبان</p></div>
            </button>
            <button onClick={() => { setViewMode('pipeline'); setIsPipeline(true); }} className={`p-2.5 rounded-lg border text-start transition-colors flex items-center gap-2 ${viewMode === 'pipeline' ? 'border-emerald-500 bg-emerald-500/10' : 'border-border hover:border-emerald-300'}`}>
              <GitBranch className="h-4 w-4 text-emerald-500" /><div><p className="text-sm font-medium">Pipeline</p></div>
            </button>
          </div>
        </div>
        {isPipeline && (
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
            <div><p className="text-sm font-medium">انتقال تلقائي</p><p className="text-[10px] text-muted-foreground">المهمة تنتقل تلقائياً بعد الإكمال</p></div>
            <button onClick={() => setAutoAdvance(!autoAdvance)} className={`w-10 h-5 rounded-full transition-colors relative ${autoAdvance ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <div className={`w-4 h-4 rounded-full bg-white dark:bg-gray-200 absolute top-0.5 transition-all ${autoAdvance ? 'start-5' : 'start-0.5'}`} />
            </button>
          </div>
        )}
        <Button onClick={handleSaveGeneral} disabled={saving || !name.trim()} className="w-full bg-orange-500 hover:bg-orange-600 text-white">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري الحفظ...</> : 'حفظ'}
        </Button>
      </TabsContent>

      {/* ── Columns ── */}
      <TabsContent value="columns" className="space-y-3 mt-3">
        <div className="space-y-1.5">
          {cols.map((col, idx) => (
            <div key={col.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-muted/20">
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveCol(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20"><ChevronUp className="h-3 w-3" /></button>
                <button onClick={() => moveCol(idx, 1)} disabled={idx === cols.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20"><ChevronDown className="h-3 w-3" /></button>
              </div>
              <div className={`w-3 h-3 rounded-full shrink-0 ${COLOR_DOT[col.color] || 'bg-gray-500'}`} />
              <Input value={col.name} onChange={e => setCols(prev => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))} className="h-7 text-xs flex-1" />
              <select value={col.color} onChange={e => setCols(prev => prev.map((c, i) => i === idx ? { ...c, color: e.target.value } : c))} className="h-7 text-[10px] bg-transparent border border-border rounded px-1">
                {COL_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={() => deleteColumn(col.id)} className="text-red-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        {/* Add column */}
        <div className="flex items-center gap-2">
          <Input value={newColName} onChange={e => setNewColName(e.target.value)} placeholder="عمود جديد..." className="h-8 text-xs flex-1"
            onKeyDown={e => { if (e.key === 'Enter') addColumn(); }} />
          <select value={newColColor} onChange={e => setNewColColor(e.target.value)} className="h-8 text-[10px] bg-transparent border border-border rounded px-1">
            {COL_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <Button size="sm" className="h-8 text-xs" onClick={addColumn}><Plus className="h-3 w-3 me-1" /> إضافة</Button>
        </div>
        <Button onClick={saveColumns} className="w-full bg-orange-500 hover:bg-orange-600 text-white text-xs">حفظ ترتيب الأعمدة</Button>
      </TabsContent>

      {/* ── Labels ── */}
      <TabsContent value="labels" className="space-y-3 mt-3">
        <div className="space-y-1.5">
          {lbls.map(l => (
            <div key={l.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-muted/20">
              <div className={`w-4 h-4 rounded-sm shrink-0 ${COLOR_DOT[l.color] || 'bg-gray-500'}`} />
              <span className="text-sm flex-1">{l.name}</span>
              <button onClick={() => deleteLabel(l.id)} className="text-red-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input value={newLblName} onChange={e => setNewLblName(e.target.value)} placeholder="تصنيف جديد..." className="h-8 text-xs flex-1"
            onKeyDown={e => { if (e.key === 'Enter') addLabel(); }} />
          <select value={newLblColor} onChange={e => setNewLblColor(e.target.value)} className="h-8 text-[10px] bg-transparent border border-border rounded px-1">
            {COL_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <Button size="sm" className="h-8 text-xs" onClick={addLabel}><Plus className="h-3 w-3 me-1" /> إضافة</Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}
