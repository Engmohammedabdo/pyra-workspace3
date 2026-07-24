'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useBoards, useCreateBoard } from '@/hooks/useBoards';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import {
  formatBoardTaskDeadline,
  getBoardTaskDeadline,
  isBoardTaskDeadlineOverdue,
} from '@/hooks/useBoardTasks';
import {
  resolveTaskDeadlineDisplay,
  useDeadlineClock,
} from '@/hooks/useDeadlineClock';
import {
  Plus,
  ExternalLink,
  Calendar,
  CheckSquare,
  LayoutGrid,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { PRODUCTION_BOARD_ID } from '@/lib/constants/production';

// ── Types ──

interface Task {
  id: string;
  title: string;
  column_id: string;
  position: number;
  priority: string;
  due_date?: string | null;
  due_at?: string | null;
  production_deadline_exempt?: boolean;
  is_archived?: boolean;
  pyra_task_assignees?: { username: string }[];
  pyra_task_labels?: { pyra_board_labels: { name: string; color: string } }[];
  pyra_task_checklist?: { is_checked: boolean }[];
  pyra_task_comments?: { id: string }[];
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
  template: string;
  pyra_board_columns: Column[];
}

// ── Color Maps ──

const COLUMN_COLORS: Record<string, string> = {
  gray: 'bg-gray-100 dark:bg-gray-800/50 border-gray-300 dark:border-gray-700',
  blue: 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-800',
  green: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-800',
  yellow: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-800',
  red: 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-800',
  purple: 'bg-purple-50 dark:bg-purple-900/30 border-purple-300 dark:border-purple-800',
  pink: 'bg-pink-50 dark:bg-pink-900/30 border-pink-300 dark:border-pink-800',
  orange: 'bg-orange-50 dark:bg-orange-900/30 border-orange-300 dark:border-orange-800',
  indigo: 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-800',
};

const PRIORITY_BORDERS: Record<string, string> = {
  urgent: 'border-s-4 border-s-red-500',
  high: 'border-s-4 border-s-orange-500',
  medium: 'border-s-4 border-s-blue-500',
  low: 'border-s-4 border-s-gray-400',
};

const LABEL_COLORS: Record<string, string> = {
  gray: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  pink: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
};

function getAvatarColor(str: string): string {
  const colors = ['bg-orange-500', 'bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-cyan-500'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function effectiveTaskDeadline(task: Task): string | null {
  return getBoardTaskDeadline(task)?.instant ?? null;
}

function taskDeadlineLabel(
  task: Task,
  locale: string,
  unverifiedLabel: string,
): string | null {
  const deadline = getBoardTaskDeadline(task);
  if (!deadline) return null;
  if (deadline.unverified) {
    const formatted = formatBoardTaskDeadline(task, locale);
    return formatted?.date
      ? `${unverifiedLabel} · ${formatted.date}`
      : unverifiedLabel;
  }
  const display = resolveTaskDeadlineDisplay(
    deadline.exact ? deadline.instant : null,
    deadline.date,
    locale,
  );
  if (!display) return null;
  if (display.kind === 'legacy') return display.label;
  const timezoneLabel = locale.startsWith('ar') ? 'بتوقيت الإمارات' : 'UAE time';
  return `${display.date} ${display.time} (${timezoneLabel})`;
}

// ── Main Component ──

export function ProjectBoardEmbed({ projectId }: { projectId: string }) {
  const locale = useLocale();
  const t = useTranslations('boards.view');
  const tDeadline = useTranslations('boards.deadline');
  const queryClient = useQueryClient();
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newDueTime, setNewDueTime] = useState('');

  const { data: boardsData = [], isLoading: loading, refetch: refetchBoards } = useBoards({ project_id: projectId });
  const board = (boardsData[0] as unknown as (Board & { pyra_board_columns: Column[] }) | undefined) ?? null;
  const isProductionBoard = board?.id === PRODUCTION_BOARD_ID;

  const { data: tasksData = [], refetch: refetchTasks } = useQuery<Task[]>({
    queryKey: ['board-tasks', board?.id],
    queryFn: () => fetchAPI<Task[]>(`/api/boards/${board!.id}/tasks`).then(data => data.filter(t => !t.is_archived)),
    enabled: !!board?.id,
  });
  const tasks = tasksData;
  const currentInstant = useDeadlineClock(tasks.map(effectiveTaskDeadline));

  const createBoardMutation = useCreateBoard();

  const handleCreateBoard = async () => {
    try {
      await createBoardMutation.mutateAsync({
        name: 'مهام المشروع',
        project_id: projectId,
        template: 'general',
      } as any);
      toast.success('تم إنشاء لوحة المهام');
      refetchBoards();
    } catch {
      toast.error('فشل في إنشاء اللوحة');
    }
  };
  const creating = createBoardMutation.isPending;

  const handleAddTask = async (columnId: string) => {
    if (!board || !newTitle.trim()) return;
    if (isProductionBoard && (!newDueDate || !newDueTime)) return;
    try {
      const data = await mutateAPI<Task>(`/api/boards/${board.id}/tasks`, 'POST', {
        title: newTitle.trim(),
        column_id: columnId,
        ...(isProductionBoard ? {
          due_date: newDueDate,
          due_time: newDueTime,
        } : {}),
      });
      queryClient.setQueryData(['board-tasks', board.id], (prev: Task[]) => [...(prev || []), data]);
      setNewTitle('');
      setNewDueDate('');
      setNewDueTime('');
      setAddingTo(null);
      toast.success('تم إضافة المهمة');
    } catch {
      toast.error('فشل في إضافة المهمة');
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ── No Board ──
  if (!board) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title="لا توجد لوحة مهام"
        description="أنشئ لوحة عمل لهذا المشروع لتوزيع المهام وتتبع التقدم"
        actions={[{ label: creating ? 'جاري الإنشاء...' : 'إنشاء لوحة مهام', onClick: handleCreateBoard }]}
      />
    );
  }

  // ── Sort columns ──
  const columns = [...(board.pyra_board_columns || [])].sort((a, b) => a.position - b.position);

  // ── Stats ──
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => {
    const col = columns.find(c => c.id === t.column_id);
    return col?.is_done_column;
  }).length;
  const overdueTasks = tasks.filter(t => {
    const col = columns.find(c => c.id === t.column_id);
    return isBoardTaskDeadlineOverdue(t, new Date(currentInstant), col?.is_done_column === true);
  }).length;

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      {totalTasks > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-l from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.round((doneTasks / totalTasks) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
            {Math.round((doneTasks / totalTasks) * 100)}%
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">{doneTasks}/{totalTasks}</span>
            <span>مهمة مكتملة</span>
          </div>
          {overdueTasks > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {overdueTasks} متأخرة
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <Link href={`/dashboard/boards/${board.id}`}>
            <ExternalLink className="h-3.5 w-3.5" />
            فتح اللوحة كاملة
          </Link>
        </Button>
      </div>

      {/* Kanban Columns */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map(col => {
          const colTasks = tasks
            .filter(t => t.column_id === col.id)
            .sort((a, b) => a.position - b.position);

          return (
            <div
              key={col.id}
              className={cn(
                'rounded-xl border p-2.5 min-h-[200px]',
                COLUMN_COLORS[col.color] || COLUMN_COLORS.gray
              )}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between mb-2.5 px-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold">{col.name}</span>
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-mono">
                    {colTasks.length}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="إضافة مهمة"
                  className="h-5 w-5"
                  onClick={() => {
                    setAddingTo(addingTo === col.id ? null : col.id);
                    setNewTitle('');
                    setNewDueDate('');
                    setNewDueTime('');
                  }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              {/* Quick Add */}
              {addingTo === col.id && (
                <div className="mb-2">
                  <Input
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="عنوان المهمة..."
                    className="text-xs h-7 mb-1"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddTask(col.id);
                      if (e.key === 'Escape') setAddingTo(null);
                    }}
                  />
                  {isProductionBoard && (
                    <div className="mb-1 grid grid-cols-2 gap-1">
                      <div className="space-y-1">
                        <label htmlFor={`project-task-due-date-${col.id}`} className="text-[10px] font-medium">
                          {t('addTask.dueDateUaeLabel')}
                        </label>
                        <Input
                          id={`project-task-due-date-${col.id}`}
                          type="date"
                          value={newDueDate}
                          onChange={(event) => setNewDueDate(event.target.value)}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor={`project-task-due-time-${col.id}`} className="text-[10px] font-medium">
                          {t('addTask.dueTimeUaeLabel')}
                        </label>
                        <Input
                          id={`project-task-due-time-${col.id}`}
                          type="time"
                          step={60}
                          value={newDueTime}
                          onChange={(event) => setNewDueTime(event.target.value)}
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      className="h-6 text-[10px] flex-1"
                      disabled={!newTitle.trim() || (isProductionBoard && (!newDueDate || !newDueTime))}
                      onClick={() => handleAddTask(col.id)}
                    >
                      إضافة
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px]"
                      onClick={() => {
                        setAddingTo(null);
                        setNewTitle('');
                        setNewDueDate('');
                        setNewDueTime('');
                      }}
                    >
                      إلغاء
                    </Button>
                  </div>
                </div>
              )}

              {/* Task Cards */}
              <div className="space-y-1.5">
                {colTasks.map(task => {
                  const isOverdue = isBoardTaskDeadlineOverdue(
                    task,
                    new Date(currentInstant),
                    col.is_done_column,
                  );
                  const taskDeadline = getBoardTaskDeadline(task);
                  const deadlineUnverified = taskDeadline?.unverified === true;
                  const deadlineLabel = taskDeadlineLabel(
                    task,
                    locale,
                    tDeadline('unverified'),
                  );
                  const checklist = task.pyra_task_checklist || [];
                  const checkedCount = checklist.filter(c => c.is_checked).length;
                  const labels = task.pyra_task_labels || [];
                  const assignees = task.pyra_task_assignees || [];

                  return (
                    <Link
                      key={task.id}
                      href={`/dashboard/boards/${board.id}`}
                      className="block"
                    >
                      <Card className={cn(
                        'hover:shadow-sm transition-shadow cursor-pointer',
                        PRIORITY_BORDERS[task.priority] || '',
                        isOverdue && 'ring-1 ring-red-400/50'
                      )}>
                        <CardContent className="p-2">
                          {/* Labels */}
                          {labels.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1">
                              {labels.map((l, i) => (
                                <span
                                  key={i}
                                  className={cn('px-1.5 py-0 rounded text-[9px] font-medium', LABEL_COLORS[l.pyra_board_labels?.color] || LABEL_COLORS.gray)}
                                >
                                  {l.pyra_board_labels?.name}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Title */}
                          <p className="text-xs font-medium leading-tight mb-1.5 line-clamp-2">{task.title}</p>

                          {/* Meta row */}
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                              {deadlineLabel && (
                                <span className={cn(
                                  'flex items-center gap-0.5',
                                  isOverdue && 'text-red-500 font-medium',
                                  deadlineUnverified
                                    && 'text-amber-700 font-medium dark:text-amber-300',
                                )}>
                                  {deadlineUnverified ? (
                                    <AlertTriangle className="h-2.5 w-2.5" />
                                  ) : (
                                    <Calendar className="h-2.5 w-2.5" />
                                  )}
                                  {deadlineLabel}
                                </span>
                              )}
                              {checklist.length > 0 && (
                                <span className="flex items-center gap-0.5">
                                  <CheckSquare className="h-2.5 w-2.5" />
                                  {checkedCount}/{checklist.length}
                                </span>
                              )}
                            </div>

                            {/* Assignees */}
                            {assignees.length > 0 && (
                              <div className="flex -space-x-1.5 rtl:space-x-reverse">
                                {assignees.slice(0, 2).map((a, i) => (
                                  <Avatar key={i} className="h-4 w-4 border border-background">
                                    <AvatarFallback className={cn('text-[8px] text-white', getAvatarColor(a.username))}>
                                      {a.username.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                ))}
                                {assignees.length > 2 && (
                                  <Avatar className="h-4 w-4 border border-background">
                                    <AvatarFallback className="text-[8px] bg-muted">+{assignees.length - 2}</AvatarFallback>
                                  </Avatar>
                                )}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}

                {colTasks.length === 0 && addingTo !== col.id && (
                  <p className="text-center text-[10px] text-muted-foreground/50 py-6">فارغ</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
