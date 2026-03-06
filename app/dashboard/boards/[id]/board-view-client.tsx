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
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { AuthSession } from '@/lib/auth/guards';
import { MentionTextarea } from '@/components/ui/mention-textarea';
import { renderTextWithMentions } from '@/lib/utils/mentions';

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
}

interface Board {
  id: string;
  name: string;
  description: string | null;
  pyra_board_columns?: Column[];
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
  const isOverdue = task.due_date && new Date(task.due_date) < new Date();

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
            <p className="text-sm font-medium flex-1 line-clamp-2">
              {task.title}
            </p>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
            {task.due_date && (
              <span
                className={`flex items-center gap-0.5 ${
                  isOverdue ? 'text-red-500 font-medium' : ''
                }`}
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
}: {
  column: Column;
  tasks: Task[];
  onAddTask: (columnId: string) => void;
  onTaskClick: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-[300px] rounded-xl p-3 flex flex-col max-h-[calc(100vh-200px)] transition-colors ${
        isOver
          ? 'bg-orange-500/10 ring-2 ring-orange-500/30'
          : 'bg-muted/50'
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
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
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onAddTask(column.id)}
        >
          <Plus className="h-4 w-4" />
        </Button>
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
            {tasks.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                اسحب مهمة هنا
              </div>
            )}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}

// ============================================================
// TaskDetailDialog — complete task management dialog
// ============================================================

function TaskDetailDialog({
  task,
  onClose,
  onUpdate,
  session,
}: {
  task: Task;
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

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
      const res = await fetch(`/api/tasks/${task.id}`);
      const { data } = await res.json();
      if (data) {
        setDetail(data);
        setTitle(data.title);
        setDescription(data.description || '');
        setPriority(data.priority || 'medium');
        setDueDate(data.due_date || '');
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

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;
    if (active.id === over.id) return;

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

  const columns: Column[] = (board.pyra_board_columns || []).sort(
    (a, b) => a.position - b.position
  );

  return (
    <div className="p-6 space-y-4">
      {/* Board Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/dashboard/boards')}
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{board.name}</h1>
            {board.description && (
              <p className="text-sm text-muted-foreground">
                {board.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{tasks.length} مهمة</span>
          <span>·</span>
          <span>{columns.length} أعمدة</span>
        </div>
      </div>

      {/* Kanban Board — uses LTR direction for horizontal column layout */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4" dir="ltr">
          {columns.map((col) => (
            <DroppableColumn
              key={col.id}
              column={col}
              tasks={tasks
                .filter((t) => t.column_id === col.id)
                .sort((a, b) => a.position - b.position)}
              onAddTask={canCreate ? openAddTask : () => {}}
              onTaskClick={(task) => setSelectedTask(task)}
            />
          ))}
        </div>

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

      {/* Task Detail Dialog */}
      {selectedTask && (
        <TaskDetailDialog
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={fetchBoard}
          session={session}
        />
      )}
    </div>
  );
}
