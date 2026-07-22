'use client';

import { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { dubaiDayKey } from '@/lib/utils/format';
import type { Locale } from '@/lib/i18n/config';
import {
  formatBoardTaskDeadline,
  getBoardTaskDeadline,
  isBoardTaskDeadlineOverdue,
} from '@/hooks/useBoardTasks';
import { AlertTriangle, ChevronRight, ChevronLeft, CalendarDays } from 'lucide-react';

// ═══════════════════════════════════════════════════════════

interface Task {
  id: string;
  title: string;
  column_id: string;
  position: number;
  priority: string;
  due_date?: string | null;
  due_at?: string | null;
  production_deadline_exempt?: boolean;
  task_number?: number;
}

interface BoardCalendarViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onQuickAdd: (columnId: string, dueDate: string) => void;
  defaultColumnId: string;
  currentInstant: string;
  doneColumnIds: string[];
  canCreate: boolean;
}

// Sunday-first order — matches the reuse of the `calendar.dayNames` keyed
// object established in Task 4 (components/calendar/calendar-month-view.tsx).
// Keys are a plain tuple rather than reading a JSON array: a top-level
// `string[]` value poisons next-intl's global `NestedKeyOf<Messages>` type
// inference for the WHOLE `calendar` namespace — verified in Task 4.
const DAY_NAME_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const PRIORITY_DOTS: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-blue-500',
  low: 'bg-gray-400',
};

// ═══════════════════════════════════════════════════════════

export function BoardCalendarView({
  tasks,
  onTaskClick,
  onQuickAdd,
  defaultColumnId,
  currentInstant,
  doneColumnIds,
  canCreate,
}: BoardCalendarViewProps) {
  const t = useTranslations('boards.calView');
  const tDeadline = useTranslations('boards.deadline');
  const tCalendar = useTranslations('calendar');
  const locale = useLocale() as Locale;
  const dayNames = DAY_NAME_KEYS.map((key) => tCalendar(`dayNames.${key}`));
  const [currentDate, setCurrentDate] = useState(() => {
    const [year, month] = dubaiDayKey(new Date(currentInstant)).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, 1));
  });
  const now = useMemo(() => new Date(currentInstant), [currentInstant]);
  const doneColumnIdSet = useMemo(() => new Set(doneColumnIds), [doneColumnIds]);

  const year = currentDate.getUTCFullYear();
  const month = currentDate.getUTCMonth();

  const { days, startDay } = useMemo(() => {
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const firstDayOfWeek = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0=Sun
    const d: number[] = [];
    for (let i = 1; i <= daysInMonth; i++) d.push(i);
    return { days: d, startDay: firstDayOfWeek };
  }, [year, month]);

  // Exact production instants are grouped by their Dubai calendar date.
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach(t => {
      const deadline = getBoardTaskDeadline(t);
      if (deadline?.date) {
        const key = deadline.date;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(t);
      }
    });
    return map;
  }, [tasks]);

  const noDateTasks = tasks.filter(t => !getBoardTaskDeadline(t)?.date);
  const todayStr = dubaiDayKey(now);

  const prevMonth = () => setCurrentDate(new Date(Date.UTC(year, month - 1, 1)));
  const nextMonth = () => setCurrentDate(new Date(Date.UTC(year, month + 1, 1)));
  const goToday = () => {
    const [todayYear, todayMonth] = todayStr.split('-').map(Number);
    setCurrentDate(new Date(Date.UTC(todayYear, todayMonth - 1, 1)));
  };

  const monthName = currentDate.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth} aria-label={t('nextMonth')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h3 className="text-sm font-bold min-w-[120px] text-center">{monthName}</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth} aria-label={t('prevMonth')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={goToday}>
          {t('today')}
        </Button>
      </div>

      <div className="flex gap-4">
        {/* Calendar Grid */}
        <div className="flex-1">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-px mb-1">
            {dayNames.map((d, i) => (
              <div key={DAY_NAME_KEYS[i]} className="text-center text-[10px] font-medium text-muted-foreground py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Date cells */}
          <div className="grid grid-cols-7 gap-px bg-border/30 rounded-lg overflow-hidden">
            {/* Empty cells before first day */}
            {Array.from({ length: startDay }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-card/30 min-h-[80px] p-1" />
            ))}

            {/* Date cells */}
            {days.map(day => {
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayTasks = tasksByDate.get(dateStr) || [];
              const isToday = dateStr === todayStr;
              const isPast = dateStr < todayStr;

              return (
                <div
                  key={day}
                  data-date={dateStr}
                  className={cn(
                    'bg-card/50 min-h-[80px] p-1 transition-colors',
                    canCreate && 'hover:bg-muted/30 cursor-pointer',
                    isToday && 'ring-1 ring-inset ring-orange-500/50 bg-orange-500/5'
                  )}
                  onClick={canCreate ? () => onQuickAdd(defaultColumnId, dateStr) : undefined}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={cn(
                      'text-[11px] font-medium w-5 h-5 flex items-center justify-center rounded-full',
                      isToday && 'bg-orange-500 text-white',
                      isPast && !isToday && 'text-muted-foreground/50'
                    )}>
                      {day}
                    </span>
                    {dayTasks.length > 0 && (
                      <Badge variant="secondary" className="text-[8px] h-3.5 px-1">{dayTasks.length}</Badge>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 3).map(task => {
                      const deadline = formatBoardTaskDeadline(task, locale);
                      const overdue = isBoardTaskDeadlineOverdue(
                        task,
                        now,
                        doneColumnIdSet.has(task.column_id),
                      );
                      return (
                        <button
                          key={task.id}
                          onClick={e => { e.stopPropagation(); onTaskClick(task); }}
                          className={cn(
                            'w-full text-start px-1 py-0.5 rounded text-[9px] truncate hover:bg-orange-500/10 transition-colors flex items-center gap-1',
                            overdue && 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300',
                            deadline?.unverified
                              && 'bg-amber-50 text-amber-900 hover:bg-amber-100/70 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-950/40',
                          )}
                        >
                          {deadline?.unverified ? (
                            <AlertTriangle className="h-3 w-3 shrink-0 text-amber-700 dark:text-amber-300" />
                          ) : (
                            <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', PRIORITY_DOTS[task.priority] || PRIORITY_DOTS.medium)} />
                          )}
                          <span className="truncate">{task.task_number ? `#${task.task_number} ` : ''}{task.title}</span>
                          {deadline?.unverified && (
                            <span className="shrink-0 text-[8px] font-medium text-amber-700 dark:text-amber-300">
                              {tDeadline('unverified')}
                            </span>
                          )}
                          {deadline?.time && (
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {t('uaeTime', { time: deadline.time })}
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {dayTasks.length > 3 && (
                      <p className="text-[8px] text-muted-foreground/50 text-center">{t('overflow', { count: dayTasks.length - 3 })}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* No-date sidebar */}
        {noDateTasks.length > 0 && (
          <div className="w-44 shrink-0">
            <div className="flex items-center gap-1.5 mb-2">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground">{t('noDate', { count: noDateTasks.length })}</span>
            </div>
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {noDateTasks.map((task) => {
                const unverified = getBoardTaskDeadline(task)?.unverified === true;
                return (
                  <button
                    key={task.id}
                    onClick={() => onTaskClick(task)}
                    className={cn(
                      'w-full text-start p-2 rounded-lg border border-border/50 bg-card/50 hover:border-orange-300 transition-colors',
                      unverified
                        && 'border-amber-300 bg-amber-50/70 hover:border-amber-400 dark:border-amber-800 dark:bg-amber-950/20 dark:hover:border-amber-700',
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {unverified ? (
                        <AlertTriangle className="h-3 w-3 shrink-0 text-amber-700 dark:text-amber-300" />
                      ) : (
                        <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', PRIORITY_DOTS[task.priority])} />
                      )}
                      <span className="text-[10px] font-medium truncate">{task.title}</span>
                    </div>
                    {unverified && (
                      <span className="mt-1 block text-[8px] font-medium text-amber-700 dark:text-amber-300">
                        {tDeadline('unverified')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
