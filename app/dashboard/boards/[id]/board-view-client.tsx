'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { hasPermission } from '@/lib/auth/rbac';
import {
  Plus, ArrowRight, Calendar, MessageSquare,
  CheckSquare, GripVertical,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { AuthSession } from '@/lib/auth/guards';

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
  pyra_task_assignees?: { username: string }[];
  pyra_task_labels?: { pyra_board_labels: { name: string; color: string } }[];
  pyra_task_checklist?: { id: string; title: string; is_checked: boolean }[];
  pyra_task_comments?: { id: string; author_name: string; content: string; created_at: string }[];
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
  urgent: '\u0639\u0627\u062C\u0644',
  high: '\u0645\u0631\u062A\u0641\u0639',
  medium: '\u0645\u062A\u0648\u0633\u0637',
  low: '\u0645\u0646\u062E\u0641\u0636',
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
                    LABEL_BG_COLORS[l.pyra_board_labels?.color || 'gray'] || LABEL_BG_COLORS.gray
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
            <p className="text-sm font-medium flex-1 line-clamp-2">{task.title}</p>
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
// KanbanColumn Component
// ============================================================

function KanbanColumn({
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
  return (
    <div className="flex-shrink-0 w-[300px] bg-muted/50 rounded-xl p-3 flex flex-col max-h-[calc(100vh-200px)]">
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
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}

// ============================================================
// TaskDetailDialog Component
// ============================================================

function TaskDetailDialog({
  task,
  onClose,
  onUpdate,
}: {
  task: Task;
  onClose: () => void;
  onUpdate: () => void;
  session: AuthSession;
}) {
  const [detail, setDetail] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');

  useEffect(() => {
    fetch(`/api/tasks/${task.id}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setDetail(data);
        setTitle(data.title);
        setDescription(data.description || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [task.id]);

  const saveChanges = async () => {
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });
      toast.success('\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u062A\u063A\u064A\u064A\u0631\u0627\u062A');
      setEditing(false);
      onUpdate();
    } catch {
      toast.error('\u0641\u0634\u0644 \u0627\u0644\u062D\u0641\u0638');
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-start">
            {editing ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-lg font-bold"
              />
            ) : (
              <span
                onClick={() => setEditing(true)}
                className="cursor-pointer hover:text-orange-500 transition-colors"
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
          </div>
        ) : detail ? (
          <div className="space-y-4">
            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                {'\u0627\u0644\u0648\u0635\u0641'}
              </label>
              {editing ? (
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder={'\u0623\u0636\u0641 \u0648\u0635\u0641\u0627\u064B \u0644\u0644\u0645\u0647\u0645\u0629...'}
                />
              ) : (
                <p
                  className="text-sm text-muted-foreground whitespace-pre-wrap cursor-pointer hover:bg-muted/50 p-2 rounded"
                  onClick={() => setEditing(true)}
                >
                  {description || '\u0627\u0646\u0642\u0631 \u0644\u0625\u0636\u0627\u0641\u0629 \u0648\u0635\u0641...'}
                </p>
              )}
            </div>

            {/* Priority & Due Date */}
            <div className="flex gap-4 flex-wrap">
              <Badge
                variant="outline"
                className={`border-s-4 ${
                  PRIORITY_COLORS[detail.priority] || PRIORITY_COLORS.medium
                }`}
              >
                {PRIORITY_LABELS[detail.priority] || PRIORITY_LABELS.medium}
              </Badge>
              {detail.due_date && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(detail.due_date).toLocaleDateString('ar-EG')}
                </span>
              )}
            </div>

            {/* Checklist */}
            {detail.pyra_task_checklist && detail.pyra_task_checklist.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">
                  {'\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0647\u0627\u0645 \u0627\u0644\u0641\u0631\u0639\u064A\u0629'}
                </h4>
                {detail.pyra_task_checklist.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={item.is_checked}
                      readOnly
                      className="rounded"
                    />
                    <span
                      className={
                        item.is_checked
                          ? 'line-through text-muted-foreground'
                          : ''
                      }
                    >
                      {item.title}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {/* Comments */}
            {detail.pyra_task_comments && detail.pyra_task_comments.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-1">
                  <MessageSquare className="h-4 w-4" />
                  {'\u0627\u0644\u062A\u0639\u0644\u064A\u0642\u0627\u062A'} ({detail.pyra_task_comments.length})
                </h4>
                {detail.pyra_task_comments.map((c) => (
                  <div key={c.id} className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">{c.author_name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString('ar-EG')}
                      </span>
                    </div>
                    <p className="text-sm">{c.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            {editing && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(false)}>
                  {'\u0625\u0644\u063A\u0627\u0621'}
                </Button>
                <Button
                  onClick={saveChanges}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {'\u062D\u0641\u0638'}
                </Button>
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
  const [showAddTask, setShowAddTask] = useState(false);
  const [addToColumn, setAddToColumn] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const canCreate = hasPermission(session.pyraUser.rolePermissions, 'tasks.create');

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
      }
      if (tasksRes.ok) {
        const { data } = await tasksRes.json();
        setTasks(data || []);
      }
    } catch {
      // silent
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
    if (!over || active.id === over.id) {
      setActiveTask(null);
      return;
    }

    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Determine target column: if we dropped over another task, use its column_id
    let targetColumnId = over.id as string;
    const overTask = tasks.find((t) => t.id === over.id);
    if (overTask) {
      targetColumnId = overTask.column_id;
    }

    // Check if target is actually a valid column
    const columns: Column[] = (board?.pyra_board_columns || []);
    const isColumn = columns.some((c) => c.id === targetColumnId);
    if (!isColumn) {
      setActiveTask(null);
      return;
    }

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, column_id: targetColumnId } : t
      )
    );
    setActiveTask(null);

    // API call
    try {
      await fetch(`/api/tasks/${taskId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column_id: targetColumnId, position: 0 }),
      });
    } catch {
      fetchBoard(); // Revert on error
    }
  };

  const addTask = async () => {
    if (!newTaskTitle.trim()) return;
    try {
      const res = await fetch(`/api/boards/${boardId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTaskTitle, column_id: addToColumn }),
      });
      if (res.ok) {
        toast.success('\u062A\u0645 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u0647\u0645\u0629');
        setNewTaskTitle('');
        setShowAddTask(false);
        fetchBoard();
      }
    } catch {
      toast.error('\u0641\u0634\u0644 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u0647\u0645\u0629');
    }
  };

  const openAddTask = (columnId: string) => {
    setAddToColumn(columnId);
    setShowAddTask(true);
    setNewTaskTitle('');
  };

  // Loading state
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
        <h2 className="text-lg font-semibold">
          {'\u0627\u0644\u0644\u0648\u062D\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629'}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {'\u0642\u062F \u064A\u0643\u0648\u0646 \u062A\u0645 \u062D\u0630\u0641\u0647\u0627 \u0623\u0648 \u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0648\u0635\u0648\u0644'}
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push('/dashboard/boards')}
        >
          <ArrowRight className="h-4 w-4 me-2" />
          {'\u0627\u0644\u0631\u062C\u0648\u0639 \u0644\u0644\u0648\u062D\u0627\u062A'}
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
              <p className="text-sm text-muted-foreground">{board.description}</p>
            )}
          </div>
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
            <KanbanColumn
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
                PRIORITY_COLORS[activeTask.priority] || PRIORITY_COLORS.medium
              } shadow-lg`}
            >
              <CardContent className="p-3">
                <p className="text-sm font-medium">{activeTask.title}</p>
              </CardContent>
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Add Task Dialog */}
      <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{'\u0625\u0636\u0627\u0641\u0629 \u0645\u0647\u0645\u0629 \u062C\u062F\u064A\u062F\u0629'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <Input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder={'\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u0647\u0645\u0629...'}
              onKeyDown={(e) => e.key === 'Enter' && addTask()}
              autoFocus
            />
            <Button
              onClick={addTask}
              disabled={!newTaskTitle.trim()}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white"
            >
              {'\u0625\u0636\u0627\u0641\u0629'}
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
