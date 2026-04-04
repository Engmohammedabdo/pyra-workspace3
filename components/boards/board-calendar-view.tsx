'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { ChevronRight, ChevronLeft, CalendarDays } from 'lucide-react';

// ═══════════════════════════════════════════════════════════

interface Task {
  id: string;
  title: string;
  column_id: string;
  position: number;
  priority: string;
  due_date?: string;
  task_number?: number;
}

interface BoardCalendarViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onQuickAdd: (columnId: string, dueDate: string) => void;
  defaultColumnId: string;
}

const DAYS_AR = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

const PRIORITY_DOTS: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-blue-500',
  low: 'bg-gray-400',
};

// ═══════════════════════════════════════════════════════════

export function BoardCalendarView({ tasks, onTaskClick, onQuickAdd, defaultColumnId }: BoardCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const { days, startDay } = useMemo(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
    const d: number[] = [];
    for (let i = 1; i <= daysInMonth; i++) d.push(i);
    return { days: d, startDay: firstDayOfWeek };
  }, [year, month]);

  // Group tasks by due_date
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach(t => {
      if (t.due_date) {
        const key = t.due_date;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(t);
      }
    });
    return map;
  }, [tasks]);

  const noDateTasks = tasks.filter(t => !t.due_date);
  const todayStr = new Date().toISOString().split('T')[0];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const monthName = currentDate.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth} aria-label="الشهر التالي">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h3 className="text-sm font-bold min-w-[120px] text-center">{monthName}</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth} aria-label="الشهر السابق">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={goToday}>
          اليوم
        </Button>
      </div>

      <div className="flex gap-4">
        {/* Calendar Grid */}
        <div className="flex-1">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-px mb-1">
            {DAYS_AR.map(d => (
              <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
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
                  className={cn(
                    'bg-card/50 min-h-[80px] p-1 hover:bg-muted/30 transition-colors cursor-pointer',
                    isToday && 'ring-1 ring-inset ring-orange-500/50 bg-orange-500/5'
                  )}
                  onClick={() => onQuickAdd(defaultColumnId, dateStr)}
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
                    {dayTasks.slice(0, 3).map(t => (
                      <button
                        key={t.id}
                        onClick={e => { e.stopPropagation(); onTaskClick(t); }}
                        className="w-full text-start px-1 py-0.5 rounded text-[9px] truncate hover:bg-orange-500/10 transition-colors flex items-center gap-1"
                      >
                        <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', PRIORITY_DOTS[t.priority] || PRIORITY_DOTS.medium)} />
                        <span className="truncate">{t.task_number ? `#${t.task_number} ` : ''}{t.title}</span>
                      </button>
                    ))}
                    {dayTasks.length > 3 && (
                      <p className="text-[8px] text-muted-foreground/50 text-center">+{dayTasks.length - 3}</p>
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
              <span className="text-[10px] font-medium text-muted-foreground">بدون تاريخ ({noDateTasks.length})</span>
            </div>
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {noDateTasks.map(t => (
                <button
                  key={t.id}
                  onClick={() => onTaskClick(t)}
                  className="w-full text-start p-2 rounded-lg border border-border/50 bg-card/50 hover:border-orange-300 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', PRIORITY_DOTS[t.priority])} />
                    <span className="text-[10px] font-medium truncate">{t.title}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
