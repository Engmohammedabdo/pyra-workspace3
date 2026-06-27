'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Clock,
  LogIn,
  LogOut,
  CheckCircle,
  Timer,
  Fingerprint,
} from 'lucide-react';
import type { AttendanceRecord } from '@/hooks/useAttendance';

interface TodayClockCardProps {
  todayRecord: AttendanceRecord | null;
  elapsed: string;
  onClockIn: () => void;
  onClockOut: () => void;
  clockingIn: boolean;
  clockingOut: boolean;
  loading: boolean;
  currentTime: Date;
}

function formatTime(isoString: string | null): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
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

export default function TodayClockCard({
  todayRecord,
  elapsed,
  onClockIn,
  onClockOut,
  clockingIn,
  clockingOut,
  loading,
  currentTime,
}: TodayClockCardProps) {
  const isClockedIn = todayRecord?.clock_in && !todayRecord?.clock_out;
  const isClockedOut = todayRecord?.clock_in && todayRecord?.clock_out;

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
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

            <div aria-live="polite" aria-atomic="false">
              {loading ? (
                <Skeleton className="h-5 w-48" />
              ) : isClockedOut ? (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-4 w-4" aria-hidden="true" />
                  <span className="text-sm font-medium">
                    تم تسجيل الانصراف — {formatHours(todayRecord!.total_hours)} ساعة
                  </span>
                </div>
              ) : isClockedIn ? (
                <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                  <Timer className="h-4 w-4 animate-pulse" aria-hidden="true" />
                  <span className="text-sm font-medium">
                    مسجل الدخول منذ {formatTime(todayRecord!.clock_in)}
                  </span>
                  <Badge variant="outline" className="font-mono text-xs">
                    {elapsed}
                  </Badge>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Fingerprint className="h-4 w-4" aria-hidden="true" />
                  <span className="text-sm">لم تسجل الدخول اليوم</span>
                </div>
              )}
            </div>
          </div>

          <div>
            {loading ? (
              <Skeleton className="h-12 w-40 rounded-lg" />
            ) : isClockedOut ? (
              <Button disabled size="lg" className="gap-2 bg-gray-400 cursor-not-allowed">
                <CheckCircle className="h-5 w-5" />
                اكتمل اليوم
              </Button>
            ) : isClockedIn ? (
              <Button
                onClick={onClockOut}
                disabled={clockingOut}
                size="lg"
                className="gap-2 bg-red-600 hover:bg-red-700 text-white"
              >
                <LogOut className="h-5 w-5" />
                {clockingOut ? 'جاري التسجيل...' : 'تسجيل انصراف'}
              </Button>
            ) : (
              <Button
                onClick={onClockIn}
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
  );
}
