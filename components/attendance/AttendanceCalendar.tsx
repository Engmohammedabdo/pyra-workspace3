'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { CalendarDays, Clock, ChevronRight, ChevronLeft } from 'lucide-react';
import {
  ATTENDANCE_STATUS_STYLES,
  ATTENDANCE_STATUS_LABELS,
} from '@/lib/constants/statuses';
import { MONTH_NAMES_AR } from '@/lib/constants/dates';
import { formatTime, formatHours } from '@/lib/utils/format';
import type { AttendanceRecord } from '@/hooks/useAttendance';

const DAY_NAMES_AR = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

export type CalendarDay = { day: number; date: string; status?: string } | null;

interface AttendanceCalendarProps {
  records: AttendanceRecord[];
  calendarDays: CalendarDay[];
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  loading: boolean;
  today: string;
}

function getCalendarDotColor(status?: string): string {
  switch (status) {
    case 'present': return 'bg-green-500';
    case 'late': return 'bg-yellow-500';
    case 'absent': return 'bg-red-500';
    case 'holiday': return 'bg-blue-500';
    case 'weekend': return 'bg-gray-300 dark:bg-gray-600';
    case 'early_leave': return 'bg-orange-500';
    default: return '';
  }
}

export default function AttendanceCalendar({
  records,
  calendarDays,
  year,
  month,
  onPrev,
  onNext,
  loading,
  today,
}: AttendanceCalendarProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Month Navigation */}
      <div className="lg:col-span-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          {MONTH_NAMES_AR[month - 1]} {year}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={onNext} className="h-8 w-8" aria-label="الشهر التالي">
            <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" onClick={onPrev} className="h-8 w-8" aria-label="الشهر السابق">
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card className="border-0 shadow-sm lg:col-span-1">
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-orange-500" aria-hidden="true" />
            تقويم الحضور
          </h3>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAY_NAMES_AR.map(day => (
              <div key={day} className="text-center text-[10px] text-muted-foreground font-medium">
                {day}
              </div>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((cell, idx) => {
                if (!cell) {
                  return <div key={`empty-${idx}`} className="h-9" />;
                }

                const isToday = cell.date === today;

                const statusLabel = cell.status
                  ? ATTENDANCE_STATUS_LABELS[cell.status as keyof typeof ATTENDANCE_STATUS_LABELS]
                  : undefined;
                const ariaLabel = statusLabel
                  ? `${cell.date} — ${statusLabel}`
                  : undefined;

                return (
                  <div
                    key={cell.date}
                    role={cell.status ? 'gridcell' : undefined}
                    aria-label={ariaLabel}
                    tabIndex={cell.status ? 0 : undefined}
                    className={`
                      h-9 flex flex-col items-center justify-center rounded text-xs relative
                      ${isToday ? 'ring-2 ring-orange-500 ring-offset-1 ring-offset-background' : ''}
                      ${cell.status === 'weekend' ? 'bg-muted/40' : 'bg-background'}
                      ${cell.status ? 'focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:outline-none' : ''}
                    `}
                  >
                    <span className={`text-[11px] ${isToday ? 'font-bold text-orange-600 dark:text-orange-400' : 'text-foreground'}`}>
                      {cell.day}
                    </span>
                    {cell.status && (
                      <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${getCalendarDotColor(cell.status)}`} aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-border" role="list" aria-label="مفتاح ألوان الحضور">
            {[
              { color: 'bg-green-500', status: 'present' },
              { color: 'bg-yellow-500', status: 'late' },
              { color: 'bg-red-500', status: 'absent' },
              { color: 'bg-orange-500', status: 'early_leave' },
              { color: 'bg-blue-500', status: 'holiday' },
              { color: 'bg-gray-300 dark:bg-gray-600', status: 'weekend' },
            ].map(item => (
              <div key={item.status} className="flex items-center gap-1.5" role="listitem">
                <div className={`w-2 h-2 rounded-full ${item.color}`} aria-hidden="true" />
                <span className="text-[10px] text-muted-foreground">
                  {ATTENDANCE_STATUS_LABELS[item.status as keyof typeof ATTENDANCE_STATUS_LABELS]}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card className="border-0 shadow-sm lg:col-span-2">
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-500" aria-hidden="true" />
            سجل الحضور
          </h3>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="لا توجد سجلات"
              description="لم يتم تسجيل أي حضور في هذا الشهر"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-start pb-3 pe-4 font-medium">التاريخ</th>
                    <th className="text-start pb-3 pe-4 font-medium">الدخول</th>
                    <th className="text-start pb-3 pe-4 font-medium">الانصراف</th>
                    <th className="text-start pb-3 pe-4 font-medium">الساعات</th>
                    <th className="text-start pb-3 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => {
                    const recDate = new Date(record.date + 'T00:00:00');
                    const dayName = DAY_NAMES_AR[recDate.getDay()];

                    return (
                      <tr
                        key={record.id}
                        className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-3 pe-4">
                          <div className="flex flex-col">
                            <span className="text-foreground font-medium">
                              {recDate.toLocaleDateString('ar-AE', { day: 'numeric', month: 'short' })}
                            </span>
                            <span className="text-[11px] text-muted-foreground">{dayName}</span>
                          </div>
                        </td>
                        <td className="py-3 pe-4 font-mono text-foreground">
                          {formatTime(record.clock_in)}
                        </td>
                        <td className="py-3 pe-4 font-mono text-foreground">
                          {formatTime(record.clock_out)}
                        </td>
                        <td className="py-3 pe-4 font-mono text-foreground">
                          {record.total_hours > 0 ? formatHours(record.total_hours) : '—'}
                        </td>
                        <td className="py-3">
                          <Badge
                            variant="outline"
                            className={`text-[11px] border-0 ${ATTENDANCE_STATUS_STYLES[record.status]}`}
                          >
                            {ATTENDANCE_STATUS_LABELS[record.status] || record.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
