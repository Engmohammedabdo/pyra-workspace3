import { format, formatDistanceToNow, differenceInCalendarDays } from 'date-fns';
import { ar } from 'date-fns/locale';

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  // LTR mark (\u200E) ensures correct display order in RTL contexts
  return `\u200E${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(date: string | Date | null | undefined, pattern: string = 'dd-MM-yyyy'): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return format(d, pattern, { locale: ar });
}

export function formatRelativeDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return formatDistanceToNow(d, { addSuffix: true, locale: ar });
}

export function formatCurrency(amount: number, currency: string = 'AED'): string {
  if (!Number.isFinite(amount)) amount = 0;
  const formatted = new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  // LTR mark ensures correct display order in RTL contexts
  return `\u200E${formatted}`;
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-AE').format(num);
}

/**
 * Compute the YYYY-MM-DD calendar-day key in Asia/Dubai (UTC+4, no DST).
 *
 * Phase 15.1 Commit 5 Reviewer HIGH fix — `new Date().toISOString().slice(0,10)`
 * returns the UTC day, which differs from the Dubai day for the last 4 hours
 * of every Dubai day (Dubai 20:00 = UTC 16:00 same day; Dubai 23:30 = UTC
 * 19:30 same day; Dubai 02:00 = UTC 22:00 PREVIOUS day). Use this helper
 * for any "today in Dubai" comparison against API-emitted Dubai-offset
 * ISO strings (which slice cleanly to Dubai-day via `.slice(0, 10)`).
 *
 * Optionally accepts a Date argument for testing; defaults to `now`.
 */
export function dubaiDayKey(d: Date = new Date()): string {
  const utcMs = d.getTime();
  const dubaiMs = utcMs + 4 * 60 * 60 * 1000;
  const dubai = new Date(dubaiMs);
  const yyyy = dubai.getUTCFullYear();
  const mm = String(dubai.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dubai.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Phase 15.1 Commit 3 — friendly due-date label + badge tone for lead tasks.
 *
 * Returns `{ label, tone }` where `tone` is a CSS-class-fragment chosen so
 * the consumer can drop it straight into a <Badge> or <span> className.
 *
 * Buckets (calendar-day comparison via differenceInCalendarDays, NOT
 * elapsed-hours — "tomorrow" should always read "غداً" regardless of the
 * time-of-day component):
 *
 *   null / undefined  → "بدون موعد"     (gray)
 *   diff <  0         → "متأخر منذ N يوم" (red, bold)
 *   diff == 0         → "اليوم"           (orange)
 *   diff == 1         → "غداً"             (amber)
 *   diff <= 7         → "بعد N أيام"      (yellow)
 *   diff >  7         → absolute "DD MMM" (default/gray)
 */
export interface TaskDueDateFormatted {
  label: string;
  /** Tailwind class string suitable for a badge background+text combo. */
  tone: string;
  /** True for overdue dates — caller can also apply `font-bold` etc. */
  isOverdue: boolean;
}

export function formatTaskDueDate(
  due: string | Date | null | undefined,
  today: Date = new Date(),
): TaskDueDateFormatted {
  if (!due) {
    return {
      label: 'بدون موعد',
      tone: 'bg-muted text-muted-foreground',
      isOverdue: false,
    };
  }
  const d = typeof due === 'string' ? new Date(due) : due;
  if (isNaN(d.getTime())) {
    return {
      label: 'بدون موعد',
      tone: 'bg-muted text-muted-foreground',
      isOverdue: false,
    };
  }
  const diff = differenceInCalendarDays(d, today);
  if (diff < 0) {
    const abs = Math.abs(diff);
    return {
      label: `متأخر منذ ${abs} يوم`,
      tone: 'bg-red-500/10 text-red-700 dark:text-red-400 font-bold',
      isOverdue: true,
    };
  }
  if (diff === 0) {
    return {
      label: 'اليوم',
      tone: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
      isOverdue: false,
    };
  }
  if (diff === 1) {
    return {
      label: 'غداً',
      tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
      isOverdue: false,
    };
  }
  if (diff <= 7) {
    return {
      label: `بعد ${diff} أيام`,
      tone: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
      isOverdue: false,
    };
  }
  return {
    label: format(d, 'dd MMM', { locale: ar }),
    tone: 'bg-muted text-muted-foreground',
    isOverdue: false,
  };
}
