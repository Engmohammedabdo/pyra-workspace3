import { format, formatDistanceToNow, differenceInCalendarDays } from 'date-fns';
import { getDateFnsLocale } from '@/lib/i18n/date-locale';
import type { Locale } from '@/lib/i18n/config';

// ─── Attendance time / duration helpers ───────────────────────────────────────
// Phase 6B — extracted from three identical local copies in
// components/attendance/{AttendanceCalendar,TodayClockCard,AttendanceSummaryCards}.

/**
 * Format an ISO timestamp as a Dubai-timezone HH:MM string.
 * Returns '—' for null/undefined input.
 */
export function formatTime(isoString: string | null | undefined, locale: Locale = 'ar'): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleTimeString(locale === 'ar' ? 'ar-AE' : 'en-AE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Dubai',
  });
}

/**
 * Format a decimal hours value as "H:MM".
 * Returns '0:00' for falsy values.
 */
export function formatHours(hours: number): string {
  if (!hours) return '0:00';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  // LTR mark (\u200E) ensures correct display order in RTL contexts
  return `\u200E${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(
  date: string | Date | null | undefined,
  pattern: string = 'dd-MM-yyyy',
  locale: Locale = 'ar',
): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return format(d, pattern, { locale: getDateFnsLocale(locale) });
}

export function formatRelativeDate(date: string | Date | null | undefined, locale: Locale = 'ar'): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return formatDistanceToNow(d, { addSuffix: true, locale: getDateFnsLocale(locale) });
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
 * Format a per-currency amount map into a human string — one figure per
 * currency joined by " + " (e.g. "10,000.00 AED + 5,000.00 USD"). Used on
 * multi-currency money surfaces (LTV / MRR / pipeline) where summing across
 * currencies is wrong. Zero-value currencies are dropped; an empty/undefined
 * map renders a single formatted 0 in `fallbackCurrency`.
 */
export function formatCurrencyMap(
  map: Record<string, number> | undefined | null,
  fallbackCurrency: string = 'AED',
): string {
  const entries = Object.entries(map ?? {}).filter(([, v]) => Number.isFinite(v) && v !== 0);
  if (entries.length === 0) return formatCurrency(0, fallbackCurrency);
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([cur, v]) => formatCurrency(v, cur))
    .join(' + ');
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
  /**
   * Structural bucket the label was derived from — lets callers branch on
   * behavior (e.g. relative-vs-absolute grouping) without sniffing the
   * rendered Arabic/English label text. Added Phase 2 Task 1; label/tone/
   * isOverdue semantics are unchanged.
   */
  kind: 'none' | 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'date';
}

/**
 * Bilingual label table for `formatTaskDueDate`.
 *
 * Documented catalog exception: this is a pure formatting util (no React
 * context available), so labels can't come from the `t()` translation
 * catalog the rest of the app uses — same doctrine as module-guide's
 * hardcoded text (see CLAUDE.md Phase 17 decision #1). Locale is passed in
 * explicitly by the caller instead.
 */
const DUE_LABELS = {
  ar: {
    none: 'بدون موعد',
    today: 'اليوم',
    tomorrow: 'غداً',
    overdue: (n: number) => `متأخر منذ ${n} يوم`,
    upcoming: (n: number) => `بعد ${n} أيام`,
  },
  en: {
    none: 'No due date',
    today: 'Today',
    tomorrow: 'Tomorrow',
    overdue: (n: number) => `Overdue by ${n} ${n === 1 ? 'day' : 'days'}`,
    upcoming: (n: number) => `In ${n} ${n === 1 ? 'day' : 'days'}`,
  },
} as const;

export function formatTaskDueDate(
  due: string | Date | null | undefined,
  today: Date = new Date(),
  locale: Locale = 'ar',
): TaskDueDateFormatted {
  const L = DUE_LABELS[locale];
  if (!due) {
    return {
      label: L.none,
      tone: 'bg-muted text-muted-foreground',
      isOverdue: false,
      kind: 'none',
    };
  }
  const d = typeof due === 'string' ? new Date(due) : due;
  if (isNaN(d.getTime())) {
    return {
      label: L.none,
      tone: 'bg-muted text-muted-foreground',
      isOverdue: false,
      kind: 'none',
    };
  }
  const diff = differenceInCalendarDays(d, today);
  if (diff < 0) {
    const abs = Math.abs(diff);
    return {
      label: L.overdue(abs),
      tone: 'bg-red-500/10 text-red-700 dark:text-red-400 font-bold',
      isOverdue: true,
      kind: 'overdue',
    };
  }
  if (diff === 0) {
    return {
      label: L.today,
      tone: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
      isOverdue: false,
      kind: 'today',
    };
  }
  if (diff === 1) {
    return {
      label: L.tomorrow,
      tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
      isOverdue: false,
      kind: 'tomorrow',
    };
  }
  if (diff <= 7) {
    return {
      label: L.upcoming(diff),
      tone: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
      isOverdue: false,
      kind: 'upcoming',
    };
  }
  return {
    label: format(d, 'dd MMM', { locale: getDateFnsLocale(locale) }),
    tone: 'bg-muted text-muted-foreground',
    isOverdue: false,
    kind: 'date',
  };
}
