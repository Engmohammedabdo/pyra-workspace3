'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAttendanceRecords, useClockIn, useClockOut } from '@/hooks/useAttendance';
import TodayClockCard from '@/components/attendance/TodayClockCard';
import { MyProductivityCard } from '@/components/dashboard/MyProductivityCard';
import { dubaiDayKey } from '@/lib/utils/format';

/**
 * Employee-home quick panel: today's clock-in/out status + this month's
 * production numbers, at a glance on /dashboard. Wiring mirrors
 * app/dashboard/attendance/attendance-client.tsx (today-record lookup,
 * ticking elapsed timer, clock-in/out mutations + toasts) — trimmed to only
 * what TodayClockCard needs (no month picker, no calendar, no admin dialog).
 */
export function EmployeeQuickPanel() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const today = dubaiDayKey();
  const monthKey = today.slice(0, 7);

  const { data: recordsData, isLoading } = useAttendanceRecords({ month: monthKey });
  const records = recordsData ?? [];
  const todayRecord = records.find((r) => r.date === today) ?? null;

  const clockIn = useClockIn();
  const clockOut = useClockOut();

  const getElapsedTime = (): string => {
    if (!todayRecord?.clock_in || todayRecord.clock_out) return '';
    const clockInTime = new Date(todayRecord.clock_in);
    const diff = currentTime.getTime() - clockInTime.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
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
        loading={isLoading}
        currentTime={currentTime}
      />
      <MyProductivityCard />
    </div>
  );
}
