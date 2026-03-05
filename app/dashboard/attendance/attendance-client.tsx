'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { hasPermission } from '@/lib/auth/rbac';
import { motion } from 'framer-motion';
import {
  Clock,
  LogIn,
  LogOut,
  CheckCircle,
  AlertTriangle,
  XCircle,
  CalendarDays,
  Timer,
  TrendingUp,
  ChevronRight,
  ChevronLeft,
  Fingerprint,
} from 'lucide-react';
import type { AuthSession } from '@/lib/auth/guards';

// ============================================================
// Types
// ============================================================

interface AttendanceRecord {
  id: string;
  username: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  total_hours: number;
  status: 'present' | 'absent' | 'late' | 'early_leave' | 'holiday' | 'weekend';
  notes: string | null;
  ip_address: string | null;
  created_at: string;
}

interface AttendanceSummary {
  present_days: number;
  late_days: number;
  absent_days: number;
  total_hours: number;
  avg_hours_per_day: number;
  expected_work_days: number;
}

// ============================================================
// Constants
// ============================================================

const STATUS_STYLES: Record<string, string> = {
  present: 'bg-green-500/10 text-green-600 dark:text-green-400',
  late: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  absent: 'bg-red-500/10 text-red-600 dark:text-red-400',
  early_leave: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  holiday: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  weekend: 'bg-gray-500/10 text-gray-500 dark:text-gray-400',
};

const STATUS_LABELS: Record<string, string> = {
  present: 'حاضر',
  late: 'متأخر',
  absent: 'غائب',
  early_leave: 'انصراف مبكر',
  holiday: 'إجازة رسمية',
  weekend: 'عطلة',
};

const MONTH_NAMES_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const DAY_NAMES_AR = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

// ============================================================
// Helpers
// ============================================================

function formatTime(isoString: string | null): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  // Show in UAE timezone (UTC+4)
  return d.toLocaleTimeString('ar-AE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Dubai',
  });
}

function formatHours(hours: number): string {
  if (!hours) return '0:00';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getTodayUAE(): string {
  const now = new Date();
  const uaeOffset = 4 * 60 * 60 * 1000;
  const uaeNow = new Date(now.getTime() + uaeOffset);
  return uaeNow.toISOString().slice(0, 10);
}

// ============================================================
// Component
// ============================================================

interface AttendanceClientProps {
  session: AuthSession;
}

export default function AttendanceClient({ session }: AttendanceClientProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [clockingIn, setClockingIn] = useState(false);
  const [clockingOut, setClockingOut] = useState(false);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [workSchedule, setWorkSchedule] = useState<any>(null);

  // Month navigation
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const canManage = hasPermission(session.pyraUser.rolePermissions, 'attendance.manage');

  // Live clock update
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch work schedule for dynamic weekend detection
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/dashboard/work-schedules');
        if (res.ok) {
          const { data } = await res.json();
          // Use the default schedule, or fall back to the first one
          const schedule = (data || []).find((s: { is_default: boolean }) => s.is_default) || (data || [])[0] || null;
          setWorkSchedule(schedule);
        }
      } catch {
        // Fall back to default work days if fetch fails
      }
    })();
  }, []);

  // Fetch attendance data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const monthKey = getMonthKey(selectedYear, selectedMonth);
      const [recordsRes, summaryRes] = await Promise.all([
        fetch(`/api/dashboard/attendance?month=${monthKey}`),
        fetch(`/api/dashboard/attendance/summary?month=${monthKey}`),
      ]);

      if (recordsRes.ok) {
        const { data } = await recordsRes.json();
        setRecords(data || []);
        // Find today's record
        const today = getTodayUAE();
        const todayRec = (data || []).find((r: AttendanceRecord) => r.date === today);
        setTodayRecord(todayRec || null);
      }

      if (summaryRes.ok) {
        const { data } = await summaryRes.json();
        setSummary(data || null);
      }
    } catch {
      toast.error('حدث خطأ أثناء تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Clock in handler
  const handleClockIn = async () => {
    try {
      setClockingIn(true);
      const res = await fetch('/api/dashboard/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'فشل في تسجيل الدخول');
        return;
      }
      toast.success('تم تسجيل الدخول بنجاح');
      fetchData();
    } catch {
      toast.error('حدث خطأ أثناء تسجيل الدخول');
    } finally {
      setClockingIn(false);
    }
  };

  // Clock out handler
  const handleClockOut = async () => {
    try {
      setClockingOut(true);
      const res = await fetch('/api/dashboard/attendance/clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'فشل في تسجيل الانصراف');
        return;
      }
      toast.success('تم تسجيل الانصراف بنجاح');
      fetchData();
    } catch {
      toast.error('حدث خطأ أثناء تسجيل الانصراف');
    } finally {
      setClockingOut(false);
    }
  };

  // Month navigation
  const goToPreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  // Calculate time worked so far today (live)
  const getElapsedTime = (): string => {
    if (!todayRecord?.clock_in || todayRecord.clock_out) return '';
    const clockIn = new Date(todayRecord.clock_in);
    const diff = currentTime.getTime() - clockIn.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // Determine clock-in/out state
  const isClockedIn = todayRecord?.clock_in && !todayRecord?.clock_out;
  const isClockedOut = todayRecord?.clock_in && todayRecord?.clock_out;

  // Calendar data
  const buildCalendarDays = () => {
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const startDayOfWeek = firstDay.getDay(); // 0=Sunday

    const days: Array<{ day: number; date: string; status?: string } | null> = [];

    // Empty cells before the 1st
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }

    // Build record map for quick lookup
    const recordMap = new Map<string, string>();
    records.forEach(r => {
      recordMap.set(r.date, r.status);
    });

    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayDate = new Date(selectedYear, selectedMonth - 1, d);
      const dayOfWeek = dayDate.getDay();
      // Use work schedule for dynamic weekend detection; default to Sun-Thu (0-4) if no schedule
      const scheduledWorkDays: number[] = workSchedule?.work_days ?? [0, 1, 2, 3, 4];
      const isWeekend = !scheduledWorkDays.includes(dayOfWeek);

      let status: string | undefined = recordMap.get(dateStr);
      if (!status && isWeekend) {
        status = 'weekend';
      }

      days.push({ day: d, date: dateStr, status });
    }

    return days;
  };

  const calendarDays = buildCalendarDays();

  const getCalendarDotColor = (status?: string): string => {
    switch (status) {
      case 'present': return 'bg-green-500';
      case 'late': return 'bg-yellow-500';
      case 'absent': return 'bg-red-500';
      case 'holiday': return 'bg-blue-500';
      case 'weekend': return 'bg-gray-300 dark:bg-gray-600';
      case 'early_leave': return 'bg-orange-500';
      default: return '';
    }
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Clock-In/Out Section */}
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: Current Time + Status */}
            <div className="flex flex-col items-center sm:items-start gap-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Clock className="h-4 w-4" />
                <span>
                  {currentTime.toLocaleTimeString('ar-AE', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    timeZone: 'Asia/Dubai',
                  })}
                </span>
                <span className="text-xs">
                  ({currentTime.toLocaleDateString('ar-AE', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    timeZone: 'Asia/Dubai',
                  })})
                </span>
              </div>

              {/* Status message */}
              {loading ? (
                <Skeleton className="h-5 w-48" />
              ) : isClockedOut ? (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    تم تسجيل الانصراف — {formatHours(todayRecord!.total_hours)} ساعة
                  </span>
                </div>
              ) : isClockedIn ? (
                <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                  <Timer className="h-4 w-4 animate-pulse" />
                  <span className="text-sm font-medium">
                    مسجل الدخول منذ {formatTime(todayRecord!.clock_in)}
                  </span>
                  <Badge variant="outline" className="font-mono text-xs">
                    {getElapsedTime()}
                  </Badge>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Fingerprint className="h-4 w-4" />
                  <span className="text-sm">لم تسجل الدخول اليوم</span>
                </div>
              )}
            </div>

            {/* Right: Clock In/Out Button */}
            <div>
              {loading ? (
                <Skeleton className="h-12 w-40 rounded-lg" />
              ) : isClockedOut ? (
                <Button
                  disabled
                  size="lg"
                  className="gap-2 bg-gray-400 cursor-not-allowed"
                >
                  <CheckCircle className="h-5 w-5" />
                  اكتمل اليوم
                </Button>
              ) : isClockedIn ? (
                <Button
                  onClick={handleClockOut}
                  disabled={clockingOut}
                  size="lg"
                  className="gap-2 bg-red-600 hover:bg-red-700 text-white"
                >
                  <LogOut className="h-5 w-5" />
                  {clockingOut ? 'جاري التسجيل...' : 'تسجيل انصراف'}
                </Button>
              ) : (
                <Button
                  onClick={handleClockIn}
                  disabled={clockingIn}
                  size="lg"
                  className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                >
                  <LogIn className="h-5 w-5" />
                  {clockingIn ? 'جاري التسجيل...' : 'تسجيل دخول'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          {MONTH_NAMES_AR[selectedMonth - 1]} {selectedYear}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={goToNextMonth} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={goToPreviousMonth} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="border-0 shadow-sm">
              <CardContent className="pt-4 pb-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <CheckCircle className="h-4 w-4 text-green-500" />
                أيام الحضور
              </div>
              <p className="text-2xl font-bold text-foreground">{summary.present_days}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                أيام التأخر
              </div>
              <p className="text-2xl font-bold text-foreground">{summary.late_days}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <XCircle className="h-4 w-4 text-red-500" />
                أيام الغياب
              </div>
              <p className="text-2xl font-bold text-foreground">{summary.absent_days}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <TrendingUp className="h-4 w-4 text-orange-500" />
                إجمالي الساعات
              </div>
              <p className="text-2xl font-bold text-foreground">{formatHours(summary.total_hours)}</p>
              {summary.avg_hours_per_day > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  المعدل: {formatHours(summary.avg_hours_per_day)} / يوم
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Calendar + Records */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar View */}
        <Card className="border-0 shadow-sm lg:col-span-1">
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-orange-500" />
              تقويم الحضور
            </h3>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAY_NAMES_AR.map(day => (
                <div key={day} className="text-center text-[10px] text-muted-foreground font-medium">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
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

                  const todayStr = getTodayUAE();
                  const isToday = cell.date === todayStr;

                  return (
                    <div
                      key={cell.date}
                      className={`
                        h-9 flex flex-col items-center justify-center rounded text-xs relative
                        ${isToday ? 'ring-2 ring-orange-500 ring-offset-1 ring-offset-background' : ''}
                        ${cell.status === 'weekend' ? 'bg-muted/40' : 'bg-background'}
                      `}
                    >
                      <span className={`text-[11px] ${isToday ? 'font-bold text-orange-600 dark:text-orange-400' : 'text-foreground'}`}>
                        {cell.day}
                      </span>
                      {cell.status && (
                        <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${getCalendarDotColor(cell.status)}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-border">
              {[
                { color: 'bg-green-500', label: 'حاضر' },
                { color: 'bg-yellow-500', label: 'متأخر' },
                { color: 'bg-red-500', label: 'غائب' },
                { color: 'bg-gray-300 dark:bg-gray-600', label: 'عطلة' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${item.color}`} />
                  <span className="text-[10px] text-muted-foreground">{item.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Records Table */}
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-500" />
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
                              className={`text-[11px] border-0 ${STATUS_STYLES[record.status] || ''}`}
                            >
                              {STATUS_LABELS[record.status] || record.status}
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

      {/* Admin notice */}
      {canManage && (
        <Card className="border-0 shadow-sm bg-orange-50/50 dark:bg-orange-950/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>لديك صلاحية إدارة الحضور — يمكنك عرض سجلات جميع الموظفين عبر واجهة التقارير.</span>
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
