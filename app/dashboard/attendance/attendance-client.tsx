'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';
import {
  useAttendanceRecords,
  useAttendanceSummary,
  useClockIn,
  useClockOut,
} from '@/hooks/useAttendance';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { hasPermission } from '@/lib/auth/rbac';
import { motion } from 'framer-motion';
import { UserCog } from 'lucide-react';
import AdminAttendanceDialog from '@/components/attendance/AdminAttendanceDialog';
import TodayClockCard from '@/components/attendance/TodayClockCard';
import AttendanceSummaryCards from '@/components/attendance/AttendanceSummaryCards';
import AttendanceCalendar from '@/components/attendance/AttendanceCalendar';
import type { CalendarDay } from '@/components/attendance/AttendanceCalendar';
import { dubaiDayKey } from '@/lib/utils/format';
import type { AuthSession } from '@/lib/auth/guards';
import type { PyraWorkSchedule } from '@/types/database';

function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

interface AttendanceClientProps {
  session: AuthSession;
}

export default function AttendanceClient({ session }: AttendanceClientProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const canManage = hasPermission(session.pyraUser.rolePermissions, 'attendance.manage');

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: schedules } = useQuery<PyraWorkSchedule[]>({
    queryKey: ['work-schedules'],
    queryFn: () => fetchAPI<PyraWorkSchedule[]>('/api/dashboard/work-schedules'),
    staleTime: 10 * 60_000,
  });
  const workSchedule = (schedules ?? []).find(s => s.is_default) ?? schedules?.[0] ?? null;

  const monthKey = getMonthKey(selectedYear, selectedMonth);

  const { data: recordsData, isLoading: recordsLoading } = useAttendanceRecords({ month: monthKey });
  const { data: summaryData, isLoading: summaryLoading } = useAttendanceSummary({ month: monthKey });

  const loading = recordsLoading || summaryLoading;
  const records = recordsData ?? [];
  const summary = summaryData ?? null;

  const today = dubaiDayKey();
  const todayRecord = records.find((r) => r.date === today) ?? null;

  const clockIn = useClockIn();
  const clockOut = useClockOut();

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

  const getElapsedTime = (): string => {
    if (!todayRecord?.clock_in || todayRecord.clock_out) return '';
    const clockInTime = new Date(todayRecord.clock_in);
    const diff = currentTime.getTime() - clockInTime.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const buildCalendarDays = (): CalendarDay[] => {
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const startDayOfWeek = firstDay.getDay();

    const days: CalendarDay[] = [];

    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }

    const recordMap = new Map<string, string>();
    records.forEach(r => {
      recordMap.set(r.date, r.status);
    });

    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayDate = new Date(selectedYear, selectedMonth - 1, d);
      const dayOfWeek = dayDate.getDay();
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <TodayClockCard
        todayRecord={todayRecord}
        elapsed={getElapsedTime()}
        onClockIn={() => clockIn.mutate(undefined, {
          onSuccess: () => toast.success('تم تسجيل الدخول بنجاح'),
          onError: () => toast.error('حدث خطأ أثناء تسجيل الدخول'),
        })}
        onClockOut={() => clockOut.mutate(undefined, {
          onSuccess: () => toast.success('تم تسجيل الانصراف بنجاح'),
          onError: () => toast.error('حدث خطأ أثناء تسجيل الانصراف'),
        })}
        clockingIn={clockIn.isPending}
        clockingOut={clockOut.isPending}
        loading={loading}
        currentTime={currentTime}
      />

      <AttendanceSummaryCards summary={summary} loading={loading} />

      <AttendanceCalendar
        records={records}
        calendarDays={calendarDays}
        year={selectedYear}
        month={selectedMonth}
        onPrev={goToPreviousMonth}
        onNext={goToNextMonth}
        loading={loading}
        today={today}
      />

      {canManage && (
        <>
          <div className="flex justify-end">
            <Button
              onClick={() => setAdminDialogOpen(true)}
              className="h-11 gap-2 bg-orange-500 hover:bg-orange-600 text-white"
            >
              <UserCog className="h-4 w-4" />
              تعديل حضور موظف
            </Button>
          </div>
          <AdminAttendanceDialog
            open={adminDialogOpen}
            onOpenChange={setAdminDialogOpen}
          />
        </>
      )}
    </motion.div>
  );
}
