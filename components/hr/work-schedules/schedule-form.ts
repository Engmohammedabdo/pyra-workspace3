import { DEFAULT_WORK_DAYS } from '@/lib/constants/auth';

// Day keys indexed by 0=Sunday .. 6=Saturday (matches pyra_work_schedules.work_days).
// Resolve the label at render sites via t('workSchedules.dayNamesFull.' + DAY_KEY_BY_INDEX[i])
// — this is a pure helper (no hooks), so labels can't be resolved here.
export const DAY_KEY_BY_INDEX = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export interface ScheduleForm {
  name: string;
  name_ar: string;
  work_days: number[];
  start_time: string;
  end_time: string;
  break_minutes: number;
  daily_hours: number;
  overtime_multiplier: number;
  weekend_multiplier: number;
  is_default: boolean;
}

/** Blank form for a NEW schedule — defaults to Mon–Sat (weekend = Sunday only). */
export const EMPTY_FORM: ScheduleForm = {
  name: '',
  name_ar: '',
  work_days: [...DEFAULT_WORK_DAYS],
  start_time: '09:00',
  end_time: '18:00',
  break_minutes: 60,
  daily_hours: 8,
  overtime_multiplier: 1.5,
  weekend_multiplier: 2.0,
  is_default: false,
};
