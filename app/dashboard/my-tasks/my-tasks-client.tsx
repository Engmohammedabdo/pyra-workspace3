'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  CheckSquare, Search, Calendar, Briefcase, AlertCircle, Clock,
  ArrowRight, CheckCircle, Circle, GitBranch, ChevronLeft, Loader2,
  StickyNote, User,
} from 'lucide-react';
import type { AuthSession } from '@/lib/auth/guards';

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'bg-red-500/10 text-red-600 border-red-200 dark:border-red-800',
  high: 'bg-orange-500/10 text-orange-600 border-orange-200 dark:border-orange-800',
  medium: 'bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800',
  low: 'bg-gray-500/10 text-gray-600 border-gray-200 dark:border-gray-800',
};
const PRIORITY_LABELS: Record<string, string> = { urgent: 'عاجل', high: 'مرتفع', medium: 'متوسط', low: 'منخفض' };

interface MyTasksClientProps { session: AuthSession; }

export default function MyTasksClient({ session }: MyTasksClientProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'overdue' | 'today' | 'week'>('all');
  const [groupBy, setGroupBy] = useState<'date' | 'board' | 'priority' | 'project'>('date');

  const { data: tasks = [], isLoading: loading } = useQuery<any[]>({
    queryKey: ['my-tasks'],
    queryFn: () => fetchAPI('/api/my-tasks'),
    staleTime: 30_000,
  });

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const categorized = useMemo(() => {
    let filtered = tasks;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(t => t.title.toLowerCase().includes(q));
    }

    const overdue = filtered.filter(t => t.due_date && t.due_date < today && !t.pyra_board_columns?.is_done_column);
    const todayTasks = filtered.filter(t => t.due_date === today && !t.pyra_board_columns?.is_done_column);
    const thisWeek = filtered.filter(t => t.due_date && t.due_date > today && t.due_date <= weekEnd && !t.pyra_board_columns?.is_done_column);
    const upcoming = filtered.filter(t => !t.due_date || (t.due_date > weekEnd && !t.pyra_board_columns?.is_done_column));
    const done = filtered.filter(t => t.pyra_board_columns?.is_done_column);

    if (filter === 'overdue') return { overdue, todayTasks: [], thisWeek: [], upcoming: [], done: [] };
    if (filter === 'today') return { overdue: [], todayTasks, thisWeek: [], upcoming: [], done: [] };
    if (filter === 'week') return { overdue: [], todayTasks: [], thisWeek, upcoming: [], done: [] };
    return { overdue, todayTasks, thisWeek, upcoming, done };
  }, [tasks, search, filter, today, weekEnd]);

  const overdueCount = tasks.filter(t => t.due_date && t.due_date < today && !t.pyra_board_columns?.is_done_column).length;
  const activeCount = tasks.filter(t => !t.pyra_board_columns?.is_done_column).length;

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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">مهامي</h1>
          <p className="text-sm text-muted-foreground">
            {activeCount} مهمة نشطة
            {overdueCount > 0 && <span className="text-red-500 ms-2">· {overdueCount} متأخرة</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-48">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في المهام..." className="ps-10 h-9" />
          </div>
          {/* Group by toggle */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            {([
              { key: 'date', label: 'تاريخ' },
              { key: 'board', label: 'لوحة' },
              { key: 'priority', label: 'أولوية' },
              { key: 'project', label: 'مشروع' },
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

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <button onClick={() => setFilter('all')} className={`text-start ${filter === 'all' ? '' : 'opacity-60'}`}>
          <Card className={filter === 'all' ? 'border-orange-500' : ''}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center"><CheckSquare className="h-5 w-5 text-orange-500" /></div>
              <div><p className="text-2xl font-bold">{tasks.length}</p><p className="text-xs text-muted-foreground">إجمالي المهام</p></div>
            </CardContent>
          </Card>
        </button>
        <button onClick={() => setFilter('overdue')} className={`text-start ${filter === 'overdue' ? '' : 'opacity-60'}`}>
          <Card className={filter === 'overdue' ? 'border-red-500' : ''}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center"><AlertCircle className="h-5 w-5 text-red-500" /></div>
              <div><p className="text-2xl font-bold">{overdueCount}</p><p className="text-xs text-muted-foreground">متأخرة</p></div>
            </CardContent>
          </Card>
        </button>
        <button onClick={() => setFilter('today')} className={`text-start ${filter === 'today' ? '' : 'opacity-60'}`}>
          <Card className={filter === 'today' ? 'border-blue-500' : ''}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center"><Calendar className="h-5 w-5 text-blue-500" /></div>
              <div><p className="text-2xl font-bold">{categorized.todayTasks.length}</p><p className="text-xs text-muted-foreground">اليوم</p></div>
            </CardContent>
          </Card>
        </button>
        <button onClick={() => setFilter('week')} className={`text-start ${filter === 'week' ? '' : 'opacity-60'}`}>
          <Card className={filter === 'week' ? 'border-green-500' : ''}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center"><Clock className="h-5 w-5 text-green-500" /></div>
              <div><p className="text-2xl font-bold">{categorized.thisWeek.length}</p><p className="text-xs text-muted-foreground">هذا الأسبوع</p></div>
            </CardContent>
          </Card>
        </button>
      </div>

      {/* Pipeline Progress (for pipeline boards) */}
      {(() => {
        const pipelineTasks = tasks.filter(t => t.pyra_boards?.is_pipeline);
        if (pipelineTasks.length === 0) return null;
        // Group by board
        const boardMap = new Map<string, { name: string; projectName: string | null; tasks: typeof pipelineTasks }>();
        pipelineTasks.forEach(t => {
          const bId = t.board_id;
          if (!boardMap.has(bId)) {
            boardMap.set(bId, { name: t.pyra_boards?.name || '', projectName: t.pyra_boards?.pyra_projects?.name || null, tasks: [] });
          }
          boardMap.get(bId)!.tasks.push(t);
        });
        return (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              تقدم الـ Pipeline
            </h2>
            {Array.from(boardMap.entries()).map(([bId, info]) => {
              const completed = info.tasks.filter(t => t.completion_percentage >= 100 || t.pyra_board_columns?.is_done_column).length;
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
                      <p className="text-[10px] text-muted-foreground mt-1">{completed} من {info.tasks.length} مهام مكتملة</p>
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
        <EmptyState icon={CheckSquare} title="لا توجد مهام" description="لم يتم تعيين أي مهام لك بعد" />
      ) : groupBy === 'date' ? (
        <div className="space-y-6">
          <TaskSection title="متأخرة" icon={AlertCircle} color="text-red-500" tasks={categorized.overdue} />
          <TaskSection title="اليوم" icon={Calendar} color="text-blue-500" tasks={categorized.todayTasks} />
          <TaskSection title="هذا الأسبوع" icon={Clock} color="text-green-500" tasks={categorized.thisWeek} />
          <TaskSection title="قادمة" icon={ArrowRight} color="text-gray-500" tasks={categorized.upcoming} />
          <TaskSection title="مكتملة" icon={CheckCircle} color="text-green-600 dark:text-green-400" tasks={categorized.done} collapsed />
        </div>
      ) : (
        <div className="space-y-6">
          {(() => {
            let filtered = tasks;
            if (search.trim()) {
              const q = search.toLowerCase();
              filtered = filtered.filter((t: { title: string }) => t.title.toLowerCase().includes(q));
            }
            // Group tasks
            const groups = new Map<string, { title: string; tasks: typeof filtered }>();
            filtered.forEach(t => {
              let key = '';
              let title = '';
              if (groupBy === 'board') {
                key = t.board_id || 'unknown';
                title = t.pyra_boards?.name || 'بدون لوحة';
              } else if (groupBy === 'priority') {
                key = t.priority || 'medium';
                const labels: Record<string, string> = { urgent: 'عاجل', high: 'مرتفع', medium: 'متوسط', low: 'منخفض' };
                title = labels[key] || key;
              } else if (groupBy === 'project') {
                key = t.pyra_boards?.pyra_projects?.name || 'no-project';
                title = t.pyra_boards?.pyra_projects?.name || 'بدون مشروع';
              }
              if (!groups.has(key)) groups.set(key, { title, tasks: [] });
              groups.get(key)!.tasks.push(t);
            });
            return Array.from(groups.entries()).map(([key, group]) => (
              <TaskSection key={key} title={group.title} icon={CheckSquare} color="text-orange-500" tasks={group.tasks} />
            ));
          })()}
        </div>
      )}
    </div>
  );
}

function TaskSection({ title, icon: Icon, color, tasks, collapsed = false }: {
  title: string; icon: any; color: string; tasks: any[]; collapsed?: boolean;
}) {
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
            const boardName = task.pyra_boards?.name;
            const projectName = task.pyra_boards?.pyra_projects?.name;
            const columnName = task.pyra_board_columns?.name;
            const isOverdue = task.due_date && task.due_date < new Date().toISOString().split('T')[0] && !task.pyra_board_columns?.is_done_column;
            // Phase 15.1 Commit 3 — source-aware rendering. Lead tasks get
            // a sticky-note icon + "Lead: {assigned/lead context}" sub-label;
            // board tasks keep the existing briefcase + project/board path.
            // `target_path` (added by /api/my-tasks union) wins over the
            // legacy `/dashboard/boards/{board_id}` Link target.
            const isLeadTask = task._source === 'lead_task';
            const SourceIcon = isLeadTask ? StickyNote : Circle;
            const href: string = task.target_path
              || (task.board_id ? `/dashboard/boards/${task.board_id}` : '#');

            return (
              <Link key={task.id} href={href}>
                <Card className={`hover:border-orange-300 dark:hover:border-orange-700 transition-colors cursor-pointer ${isOverdue ? 'border-s-4 border-s-red-500' : ''}`}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <SourceIcon className={`h-4 w-4 shrink-0 ${task.pyra_board_columns?.is_done_column ? 'text-green-500 fill-green-500' : (isLeadTask ? 'text-orange-500' : 'text-muted-foreground')}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                          {isLeadTask ? (
                            <span className="flex items-center gap-0.5 text-orange-600 dark:text-orange-400">
                              <User className="h-3 w-3" aria-hidden />
                              عميل محتمل
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
                      <Badge variant="outline" className={`text-[10px] ${PRIORITY_STYLES[task.priority]}`}>
                        {PRIORITY_LABELS[task.priority]}
                      </Badge>
                      {task.due_date && (
                        <span className={`text-[10px] ${isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                          {new Date(task.due_date).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}
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
