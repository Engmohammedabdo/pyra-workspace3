'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CheckSquare, Search, Calendar, Briefcase, AlertCircle, Clock,
  ArrowRight, CheckCircle, Circle
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
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'overdue' | 'today' | 'week'>('all');

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/my-tasks');
      if (res.ok) {
        const { data } = await res.json();
        setTasks(data || []);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

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
        <div className="grid grid-cols-3 gap-4">
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
        <div className="relative w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في المهام..." className="ps-10" />
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

      {/* Task Sections */}
      {tasks.length === 0 ? (
        <EmptyState icon={CheckSquare} title="لا توجد مهام" description="لم يتم تعيين أي مهام لك بعد" />
      ) : (
        <div className="space-y-6">
          <TaskSection title="متأخرة" icon={AlertCircle} color="text-red-500" tasks={categorized.overdue} />
          <TaskSection title="اليوم" icon={Calendar} color="text-blue-500" tasks={categorized.todayTasks} />
          <TaskSection title="هذا الأسبوع" icon={Clock} color="text-green-500" tasks={categorized.thisWeek} />
          <TaskSection title="قادمة" icon={ArrowRight} color="text-gray-500" tasks={categorized.upcoming} />
          <TaskSection title="مكتملة" icon={CheckCircle} color="text-green-600" tasks={categorized.done} collapsed />
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

            return (
              <Link key={task.id} href={`/dashboard/boards/${task.board_id}`}>
                <Card className={`hover:border-orange-300 dark:hover:border-orange-700 transition-colors cursor-pointer ${isOverdue ? 'border-s-4 border-s-red-500' : ''}`}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <Circle className={`h-4 w-4 shrink-0 ${task.pyra_board_columns?.is_done_column ? 'text-green-500 fill-green-500' : 'text-muted-foreground'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
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
