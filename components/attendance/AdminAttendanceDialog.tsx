'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpsertAttendance } from '@/hooks/useAttendance';
import { useUsers } from '@/hooks/useUsers';
import { ATTENDANCE_STATUS_LABELS } from '@/lib/constants/statuses';
import type { AttendanceStatus } from '@/lib/constants/statuses';

interface AdminAttendanceDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

function getTodayUAE(): string {
  const now = new Date();
  const uaeOffset = 4 * 60 * 60 * 1000;
  const uaeNow = new Date(now.getTime() + uaeOffset);
  return uaeNow.toISOString().slice(0, 10);
}

/**
 * Converts a date string (YYYY-MM-DD) + time string (HH:MM) into a UTC ISO string.
 * Treats the time as Dubai-local (UTC+4) and converts to UTC.
 * Returns null if time is blank.
 */
function toUTCIso(date: string, time: string): string | null {
  if (!time.trim()) return null;
  // Build Dubai local datetime string, then subtract 4h to get UTC
  const dubaiMs = new Date(`${date}T${time}:00+04:00`).getTime();
  return new Date(dubaiMs).toISOString();
}

export default function AdminAttendanceDialog({
  open,
  onOpenChange,
}: AdminAttendanceDialogProps) {
  const today = getTodayUAE();

  const [username, setUsername] = useState('');
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [notes, setNotes] = useState('');

  const { data: usersRaw = [] } = useUsers();
  // Filter out clients; only internal employees
  const employees = usersRaw.filter(
    (u) => u.role !== 'client' && u.status !== 'inactive'
  );

  const upsert = useUpsertAttendance();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!username) {
      toast.error('يرجى اختيار موظف');
      return;
    }
    if (!date) {
      toast.error('يرجى تحديد التاريخ');
      return;
    }

    upsert.mutate(
      {
        username,
        date,
        status,
        clock_in: toUTCIso(date, clockIn),
        clock_out: toUTCIso(date, clockOut),
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success('تم حفظ سجل الحضور');
          onOpenChange(false);
          // Reset form
          setUsername('');
          setDate(today);
          setStatus('present');
          setClockIn('');
          setClockOut('');
          setNotes('');
        },
        onError: (e) => {
          toast.error(e instanceof Error ? e.message : 'فشل الحفظ');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-start">تعديل / إضافة سجل حضور</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Employee */}
          <div className="space-y-1.5">
            <Label htmlFor="admin-att-employee">الموظف</Label>
            <Select value={username} onValueChange={setUsername}>
              <SelectTrigger id="admin-att-employee" className="h-11">
                <SelectValue placeholder="اختر موظفاً..." />
              </SelectTrigger>
              <SelectContent>
                {employees.map((u) => (
                  <SelectItem key={String(u.id)} value={String(u['username'] ?? u.id)}>
                    {String(u['display_name'] ?? u.name ?? u['username'] ?? u.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label htmlFor="admin-att-date">التاريخ</Label>
            <Input
              id="admin-att-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11"
              required
            />
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label htmlFor="admin-att-status">الحالة</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AttendanceStatus)}>
              <SelectTrigger id="admin-att-status" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(ATTENDANCE_STATUS_LABELS) as [AttendanceStatus, string][]).map(
                  ([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Clock-in / Clock-out (optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="admin-att-clockin">وقت الدخول (اختياري)</Label>
              <Input
                id="admin-att-clockin"
                type="time"
                value={clockIn}
                onChange={(e) => setClockIn(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-att-clockout">وقت الانصراف (اختياري)</Label>
              <Input
                id="admin-att-clockout"
                type="time"
                value={clockOut}
                onChange={(e) => setClockOut(e.target.value)}
                className="h-11"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="admin-att-notes">ملاحظات (اختياري)</Label>
            <Textarea
              id="admin-att-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات إضافية..."
              rows={3}
              className="resize-none"
            />
          </div>

          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start pt-2">
            <Button
              type="submit"
              disabled={upsert.isPending}
              className="h-11 bg-orange-500 hover:bg-orange-600 text-white"
            >
              {upsert.isPending ? 'جاري الحفظ...' : 'حفظ السجل'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => onOpenChange(false)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
