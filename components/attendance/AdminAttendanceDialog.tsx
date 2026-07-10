'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useLocale, useTranslations } from 'next-intl';
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
import { useUsersLite } from '@/hooks/useUsers';
import type { AttendanceStatus } from '@/lib/constants/statuses';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import { dubaiDayKey } from '@/lib/utils/format';
import { dirFor, type Locale } from '@/lib/i18n/config';

interface AdminAttendanceDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
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

const ATTENDANCE_STATUS_KEYS: AttendanceStatus[] = [
  'present', 'absent', 'late', 'excused', 'early_leave', 'holiday', 'weekend',
];

export default function AdminAttendanceDialog({
  open,
  onOpenChange,
}: AdminAttendanceDialogProps) {
  const t = useTranslations('hr.attendance.adminDialog');
  const statusLabelFor = useStatusLabels('attendance');
  const locale = useLocale() as Locale;
  const today = dubaiDayKey();

  const [username, setUsername] = useState('');
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [notes, setNotes] = useState('');

  // Lite endpoint (no users.view needed) → an HR manager with only
  // attendance.manage still gets a populated picker. Returns username /
  // display_name / status / role.
  const { data: usersRaw = [] } = useUsersLite();
  // Only internal, non-inactive employees; normalise to a clean typed shape.
  const employees = usersRaw
    .filter((u) => u.username && u.role !== 'client' && u.status !== 'inactive')
    .map((u) => ({
      username: String(u.username),
      display_name: (u.display_name as string) ?? String(u.username),
    }));

  const upsert = useUpsertAttendance();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!username) {
      toast.error(t('toasts.selectEmployee'));
      return;
    }
    if (!date) {
      toast.error(t('toasts.selectDate'));
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
          toast.success(t('toasts.saveSuccess'));
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
          toast.error(e instanceof Error ? e.message : t('toasts.saveFailed'));
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir={dirFor(locale)}>
        <DialogHeader>
          <DialogTitle className="text-start">{t('title')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Employee */}
          <div className="space-y-1.5">
            <Label htmlFor="admin-att-employee">{t('employeeLabel')}</Label>
            <Select value={username} onValueChange={setUsername}>
              <SelectTrigger id="admin-att-employee" className="h-11">
                <SelectValue placeholder={t('employeePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {employees.map((u) => (
                  <SelectItem key={u.username} value={u.username}>
                    {u.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label htmlFor="admin-att-date">{t('dateLabel')}</Label>
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
            <Label htmlFor="admin-att-status">{t('statusLabel')}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AttendanceStatus)}>
              <SelectTrigger id="admin-att-status" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ATTENDANCE_STATUS_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {statusLabelFor(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Clock-in / Clock-out (optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="admin-att-clockin">{t('clockInLabel')}</Label>
              <Input
                id="admin-att-clockin"
                type="time"
                value={clockIn}
                onChange={(e) => setClockIn(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-att-clockout">{t('clockOutLabel')}</Label>
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
            <Label htmlFor="admin-att-notes">{t('notesLabel')}</Label>
            <Textarea
              id="admin-att-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notesPlaceholder')}
              rows={3}
              className="resize-none min-h-[44px]"
            />
          </div>

          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start pt-2">
            <Button
              type="submit"
              disabled={upsert.isPending}
              className="h-11 bg-orange-500 hover:bg-orange-600 text-white"
            >
              {upsert.isPending ? t('saving') : t('save')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
