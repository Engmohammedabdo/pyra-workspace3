'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations, useLocale } from 'next-intl';
import { fetchAPI } from '@/hooks/api-helpers';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { MyProductivityCard } from '@/components/dashboard/MyProductivityCard';
import {
  CheckSquare, Search, Calendar, Briefcase, AlertCircle, Clock,
  ArrowRight, CheckCircle, Circle, GitBranch,
  StickyNote, User, RefreshCcw, AlertTriangle,
} from 'lucide-react';
import type { AuthSession } from '@/lib/auth/guards';
import { dubaiDayKey } from '@/lib/utils/format';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import { legacyDubaiDayEndToIso } from '@/lib/production/deadlines';
import {
  getBoardTaskDeadline,
  isBoardTaskDeadlineOverdue,
  isUnverifiedBoardTaskDeadline,
} from '@/hooks/useBoardTasks';
import {
  resolveTaskDeadlineDisplay,
  useDeadlineClock,
} from '@/hooks/useDeadlineClock';

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'bg-red-500/10 text-red-600 border-red-200 dark:border-red-800',
  high: 'bg-orange-500/10 text-orange-600 border-orange-200 dark:border-orange-800',
  medium: 'bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800',
  low: 'bg-gray-500/10 text-gray-600 border-gray-200 dark:border-gray-800',
};

interface MyTasksClientProps { session: AuthSession; }

export interface DeadlineTask {
  _source?: 'board_task' | 'lead_task';
  due_date?: string | null;
  due_at?: string | null;
  production_deadline_exempt?: boolean;
  pyra_board_columns?: { is_done_column?: boolean | null } | null;
}

export function categorizeMyTasksByDeadline<T extends DeadlineTask>(
  tasks: readonly T[],
  currentInstant: string,
  todayKey: string,
  weekEndKey: string,
) {
  const active = tasks.filter((task) => !task.pyra_board_columns?.is_done_column);
  const unverified = active.filter((task) =>
    task._source !== 'lead_task' && isUnverifiedBoardTaskDeadline(task));
  const isUnverified = (task: T) => unverified.includes(task);
  const overdue = active.filter((task) =>
    !isUnverified(task) && taskIsOverdue(task, currentInstant, todayKey));
  const todayTasks = active.filter((task) => {
    const dueDay = taskDeadlineDay(task);
    return !isUnverified(task)
      && !taskIsOverdue(task, currentInstant, todayKey)
      && dueDay === todayKey;
  });
  const thisWeek = active.filter((task) => {
    const dueDay = taskDeadlineDay(task);
    return !isUnverified(task)
      && !taskIsOverdue(task, currentInstant, todayKey)
      && dueDay !== null
      && dueDay > todayKey
      && dueDay <= weekEndKey;
  });
  const upcoming = active.filter((task) => {
    const dueDay = taskDeadlineDay(task);
    return !isUnverified(task)
      && !taskIsOverdue(task, currentInstant, todayKey)
      && (dueDay === null || dueDay < todayKey || dueDay > weekEndKey);
  });
  const done = tasks.filter((task) => task.pyra_board_columns?.is_done_column);

  return { overdue, todayTasks, thisWeek, upcoming, unverified, done };
}

function taskDeadlineDay(task: DeadlineTask): string | null {
  if (task._source === 'lead_task') return task.due_date ?? null;
  return getBoardTaskDeadline(task)?.date ?? null;
}

function taskEffectiveDeadline(task: DeadlineTask): string | null {
  if (task._source === 'lead_task') {
    return task.due_date ? legacyDubaiDayEndToIso(task.due_date) : null;
  }
  return getBoardTaskDeadline(task)?.instant ?? null;
}

function taskIsOverdue(
  task: DeadlineTask,
  currentInstant: string,
  todayKey: string,
): boolean {
  if (task._source === 'lead_task') {
    if (task.pyra_board_columns?.is_done_column) return false;
    return !!task.due_date && task.due_date < todayKey;
  }
  return isBoardTaskDeadlineOverdue(
    task,
    new Date(currentInstant),
    task.pyra_board_columns?.is_done_column === true,
  );
}

function taskDeadlineDisplay(task: DeadlineTask, locale: string) {
  if (task._source === 'lead_task') {
    return resolveTaskDeadlineDisplay(null, task.due_date ?? null, locale);
  }
  const deadline = getBoardTaskDeadline(task);
  if (!deadline) return null;
  return resolveTaskDeadlineDisplay(
    deadline.exact ? deadline.instant : null,
    deadline.date,
    locale,
  );
}

export default function MyTasksClient({ session }: MyTasksClientProps) {
  const t = useTranslations('mywork.tasks');
  const priorityLabel = useStatusLabels('taskPriority');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'overdue' | 'today' | 'week'>('all');
  const [groupBy, setGroupBy] = useState<'date' | 'board' | 'priority' | 'project'>('date');

  const {
    data: tasks = [],
    isLoading: loading,
    isError,
    refetch,
  } = useQuery<any[]>({
    queryKey: ['my-tasks'],
    queryFn: () => fetchAPI('/api/my-tasks'),
    staleTime: 30_000,
  });

  // dubaiDayKey() — Dubai-day comparison, NOT the UTC day (Phase 15.1 lock).
  const currentInstant = useDeadlineClock(
    tasks
      .filter((task) => !task.pyra_board_columns?.is_done_column)
      .map((task) => taskEffectiveDeadline(task)),
  );
  const now = new Date(currentInstant);
  const today = dubaiDayKey(now);
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
  const todayWeekday = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay)).getUTCDay();
  const daysUntilSaturday = (6 - todayWeekday + 7) % 7;
  const weekEnd = dubaiDayKey(new Date(now.getTime() + daysUntilSaturday * 86_400_000));

  const categorized = useMemo(() => {
    let filtered = tasks;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(task => task.title.toLowerCase().includes(q));
    }

    const categorizedTasks = categorizeMyTasksByDeadline(
      filtered,
      currentInstant,
      today,
      weekEnd,
    );
    const { overdue, todayTasks, thisWeek, upcoming, unverified, done } = categorizedTasks;

    if (filter === 'overdue') return { overdue, todayTasks: [], thisWeek: [], upcoming: [], unverified: [], done: [] };
    if (filter === 'today') return { overdue: [], todayTasks, thisWeek: [], upcoming: [], unverified: [], done: [] };
    if (filter === 'week') return { overdue: [], todayTasks: [], thisWeek, upcoming: [], unverified: [], done: [] };
    return { overdue, todayTasks, thisWeek, upcoming, unverified, done };
  }, [tasks, search, filter, currentInstant, today, weekEnd]);

  const overdueCount = tasks.filter(task => taskIsOverdue(task, currentInstant, today)).length;
  const activeCount = tasks.filter(task => !task.pyra_board_columns?.is_done_column).length;

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <EmptyState
          icon={AlertCircle}
          title={t('error.title')}
          description={t('error.description')}
          actions={[{
            label: t('error.retry'),
            onClick: () => void refetch(),
            icon: RefreshCcw,
          }]}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('activeCount', { count: activeCount })}
            {overdueCount > 0 && <span className="text-red-500 ms-2">{t('overdueCount', { count: overdueCount })}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-48">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('searchPlaceholder')} className="ps-10 h-9" />
          </div>
          {/* Group by toggle */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            {([
              { key: 'date', label: t('groupBy.date') },
              { key: 'board', label: t('groupBy.board') },
              { key: 'priority', label: t('groupBy.priority') },
              { key: 'project', label: t('groupBy.project') },
            ] as const).map(g => (
              <button
                key={g.key}
                onClick={() => setGroupBy(g.key)}
                className={`px-2.5 py-1.5 text-[11px] transition-colors ${
                  groupBy === g.key ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' : 'hover:bg-muted text-muted-foreground'
                } ${g.key !== 'date' ? 'border-s border-border' : ''}`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <MyProductivityCard />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <button onClick={() => setFilter('all')} className={`text-start ${filter === 'all' ? '' : 'opacity-60'}`}>
          <Card className={filter === 'all' ? 'border-orange-500' : ''}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center"><CheckSquare className="h-5 w-5 text-orange-500" /></div>
              <div><p className="text-2xl font-bold">{tasks.length}</p><p className="text-xs text-muted-foreground">{t('stats.total')}</p></div>
            </CardContent>
          </Card>
        </button>
        <button onClick={() => setFilter('overdue')} className={`text-start ${filter === 'overdue' ? '' : 'opacity-60'}`}>
          <Card className={filter === 'overdue' ? 'border-red-500' : ''}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center"><AlertCircle className="h-5 w-5 text-red-500" /></div>
              <div><p className="text-2xl font-bold">{overdueCount}</p><p className="text-xs text-muted-foreground">{t('stats.overdue')}</p></div>
            </CardContent>
          </Card>
        </button>
        <button onClick={() => setFilter('today')} className={`text-start ${filter === 'today' ? '' : 'opacity-60'}`}>
          <Card className={filter === 'today' ? 'border-blue-500' : ''}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center"><Calendar className="h-5 w-5 text-blue-500" /></div>
              <div><p className="text-2xl font-bold">{categorized.todayTasks.length}</p><p className="text-xs text-muted-foreground">{t('stats.today')}</p></div>
            </CardContent>
          </Card>
        </button>
        <button onClick={() => setFilter('week')} className={`text-start ${filter === 'week' ? '' : 'opacity-60'}`}>
          <Card className={filter === 'week' ? 'border-green-500' : ''}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center"><Clock className="h-5 w-5 text-green-500" /></div>
              <div><p className="text-2xl font-bold">{categorized.thisWeek.length}</p><p className="text-xs text-muted-foreground">{t('stats.week')}</p></div>
            </CardContent>
          </Card>
        </button>
      </div>

      {/* Pipeline Progress (for pipeline boards) */}
      {(() => {
        const pipelineTasks = tasks.filter(pt => pt.pyra_boards?.is_pipeline);
        if (pipelineTasks.length === 0) return null;
        // Group by board
        const boardMap = new Map<string, { name: string; projectName: string | null; tasks: typeof pipelineTasks }>();
        pipelineTasks.forEach(pt => {
          const bId = pt.board_id;
          if (!boardMap.has(bId)) {
            boardMap.set(bId, { name: pt.pyra_boards?.name || '', projectName: pt.pyra_boards?.pyra_projects?.name || null, tasks: [] });
          }
          boardMap.get(bId)!.tasks.push(pt);
        });
        return (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              {t('pipelineProgress')}
            </h2>
            {Array.from(boardMap.entries()).map(([bId, info]) => {
              const completed = info.tasks.filter(pt => pt.completion_percentage >= 100 || pt.pyra_board_columns?.is_done_column).length;
              const pct = info.tasks.length > 0 ? Math.round((completed / info.tasks.length) * 100) : 0;
              return (
                <Link key={bId} href={`/dashboard/boards/${bId}`}>
                  <Card className="hover:border-emerald-400/60 transition-colors cursor-pointer">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">{info.name}</span>
                          {info.projectName && <Badge variant="secondary" className="text-[10px]">{info.projectName}</Badge>}
                        </div>
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{pct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">{t('pipelineCompleted', { completed, total: info.tasks.length })}</p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        );
      })()}

      {/* Task Sections */}
      {tasks.length === 0 ? (
        <EmptyState icon={CheckSquare} title={t('empty.title')} description={t('empty.description')} />
      ) : groupBy === 'date' ? (
        <div className="space-y-6">
          <TaskSection title={t('sections.overdue')} icon={AlertCircle} color="text-red-500" tasks={categorized.overdue} currentInstant={currentInstant} />
          <TaskSection title={t('sections.today')} icon={Calendar} color="text-blue-500" tasks={categorized.todayTasks} currentInstant={currentInstant} />
          <TaskSection title={t('sections.week')} icon={Clock} color="text-green-500" tasks={categorized.thisWeek} currentInstant={currentInstant} />
          <TaskSection title={t('sections.unverified')} icon={AlertTriangle} color="text-amber-600 dark:text-amber-400" tasks={categorized.unverified} currentInstant={currentInstant} />
          <TaskSection title={t('sections.upcoming')} icon={ArrowRight} color="text-gray-500" tasks={categorized.upcoming} currentInstant={currentInstant} />
          <TaskSection title={t('sections.done')} icon={CheckCircle} color="text-green-600 dark:text-green-400" tasks={categorized.done} currentInstant={currentInstant} collapsed />
        </div>
      ) : (
        <div className="space-y-6">
          {(() => {
            let filtered = tasks;
            if (search.trim()) {
              const q = search.toLowerCase();
              filtered = filtered.filter((task: { title: string }) => task.title.toLowerCase().includes(q));
            }
            // Group tasks
            const groups = new Map<string, { title: string; tasks: typeof filtered }>();
            filtered.forEach(task => {
              let key = '';
              let title = '';
              if (groupBy === 'board') {
                key = task.board_id || 'unknown';
                title = task.pyra_boards?.name || t('noBoard');
              } else if (groupBy === 'priority') {
                key = task.priority || 'medium';
                title = priorityLabel(key);
              } else if (groupBy === 'project') {
                key = task.pyra_boards?.pyra_projects?.name || 'no-project';
                title = task.pyra_boards?.pyra_projects?.name || t('noProject');
              }
              if (!groups.has(key)) groups.set(key, { title, tasks: [] });
              groups.get(key)!.tasks.push(task);
            });
            return Array.from(groups.entries()).map(([key, group]) => (
              <TaskSection key={key} title={group.title} icon={CheckSquare} color="text-orange-500" tasks={group.tasks} currentInstant={currentInstant} />
            ));
          })()}
        </div>
      )}
    </div>
  );
}

function TaskSection({ title, icon: Icon, color, tasks, currentInstant, collapsed = false }: {
  title: string; icon: any; color: string; tasks: any[]; currentInstant: string; collapsed?: boolean;
}) {
  const t = useTranslations('mywork.tasks');
  const locale = useLocale();
  const priorityLabel = useStatusLabels('taskPriority');
  const [open, setOpen] = useState(!collapsed);
  if (tasks.length === 0) return null;

  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 mb-2 hover:opacity-80 transition-opacity">
        <Icon className={`h-4 w-4 ${color}`} />
        <h2 className="text-sm font-semibold">{title}</h2>
        <Badge variant="secondary" className="text-[10px]">{tasks.length}</Badge>
      </button>
      {open && (
        <div className="space-y-2">
          {tasks.map((task) => {
            // Phase 15.1 Commit 3 — source-aware rendering. Lead tasks get
            // a sticky-note icon + "Lead: {assigned/lead context}" sub-label;
            // board tasks keep the existing briefcase + project/board path.
            // `target_path` (added by /api/my-tasks union) wins over the
            // legacy `/dashboard/boards/{board_id}` Link target.
            const isLeadTask = task._source === 'lead_task';
            // The API's pyra_boards.name stub is a legacy hardcoded literal
            // kept only for backward shape-compatibility — the client
            // derives the display label from the `_source` discriminator
            // instead of trusting the API's synthetic name.
            const boardName = isLeadTask ? t('leadBoard') : task.pyra_boards?.name;
            const projectName = task.pyra_boards?.pyra_projects?.name;
            const columnName = task.pyra_board_columns?.name;
            // dubaiDayKey() — Dubai-day comparison, NOT the UTC day (Phase 15.1 lock).
            const isOverdue = taskIsOverdue(
              task,
              currentInstant,
              dubaiDayKey(new Date(currentInstant)),
            );
            const deadlineDisplay = taskDeadlineDisplay(task, locale);
            const isUnverifiedDeadline = !isLeadTask
              && isUnverifiedBoardTaskDeadline(task);
            const SourceIcon = isLeadTask ? StickyNote : Circle;
            const href: string = task.target_path
              || (task.board_id ? `/dashboard/boards/${task.board_id}` : '#');

            return (
              <Link key={task.id} href={href}>
                <Card className={`hover:border-orange-300 dark:hover:border-orange-700 transition-colors cursor-pointer ${isOverdue ? 'border-s-4 border-s-red-500' : ''} ${isUnverifiedDeadline ? 'border-s-4 border-s-amber-500 bg-amber-50/40 dark:bg-amber-950/20' : ''}`}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <SourceIcon className={`h-4 w-4 shrink-0 ${task.pyra_board_columns?.is_done_column ? 'text-green-500 fill-green-500' : (isLeadTask ? 'text-orange-500' : 'text-muted-foreground')}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                          {isLeadTask ? (
                            <span className="flex items-center gap-0.5 text-orange-600 dark:text-orange-400">
                              <User className="h-3 w-3" aria-hidden />
                              {t('leadTaskBadge')}
                            </span>
                          ) : (
                            <>
                              {projectName && (
                                <span className="flex items-center gap-0.5">
                                  <Briefcase className="h-3 w-3" />
                                  {projectName}
                                </span>
                              )}
                              {boardName && <span>· {boardName}</span>}
                              {columnName && (
                                <Badge variant="outline" className="text-[9px] h-4 px-1">
                                  {columnName}
                                </Badge>
                              )}
                            </>
                          )}
                          {task.pyra_boards?.is_pipeline && task.completion_percentage > 0 && (
                            <Badge className="text-[9px] h-4 px-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
                              {task.completion_percentage}%
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isUnverifiedDeadline && (
                        <Badge className="border-0 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                          {t('unverifiedDeadline')}
                        </Badge>
                      )}
                      <Badge variant="outline" className={`text-[10px] ${PRIORITY_STYLES[task.priority]}`}>
                        {priorityLabel(task.priority)}
                      </Badge>
                      {deadlineDisplay && (
                        <span className={`text-[10px] ${isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                          {deadlineDisplay.kind === 'exact'
                            ? t('exactDeadline', deadlineDisplay)
                            : deadlineDisplay.label}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
