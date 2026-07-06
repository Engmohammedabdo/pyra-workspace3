/**
 * Pure helper functions for /api/hr/overview aggregator.
 *
 * NO Supabase imports — all functions take plain data as arguments so they
 * can be unit-tested without any DB connection.
 *
 * Phase: HR Department Improvement (Task 7)
 */

// ============================================================
// Celebrations
// ============================================================

export interface CelebrationUser {
  username: string;
  display_name: string;
  date_of_birth?: string | null;
  hire_date?: string | null;
}

export interface Celebration {
  username: string;
  display_name: string;
  kind: 'birthday' | 'anniversary';
  date: string;
  years?: number;
}

/**
 * Compute birthdays and work anniversaries happening this month.
 *
 * @param users  - Active users to check (must have username + display_name)
 * @param todayKey - Dubai calendar-day key 'YYYY-MM-DD' (pass dubaiDayKey())
 * @returns      - Celebrations (birthday and/or anniversary) for the current month
 *
 * Rules:
 * - Birthday: date_of_birth month matches todayKey month
 * - Anniversary: hire_date month matches todayKey month AND years > 0
 *   (year 0 = hired this same year, no milestone yet)
 */
export function computeCelebrations(
  users: CelebrationUser[],
  todayKey: string,
): Celebration[] {
  const month = todayKey.slice(5, 7); // '06'
  const year = Number(todayKey.slice(0, 4)); // 2026

  const out: Celebration[] = [];

  for (const u of users) {
    if (u.date_of_birth && u.date_of_birth.slice(5, 7) === month) {
      out.push({
        username: u.username,
        display_name: u.display_name,
        kind: 'birthday',
        date: u.date_of_birth,
      });
    }
    if (u.hire_date && u.hire_date.slice(5, 7) === month) {
      const years = year - Number(u.hire_date.slice(0, 4));
      if (years > 0) {
        out.push({
          username: u.username,
          display_name: u.display_name,
          kind: 'anniversary',
          date: u.hire_date,
          years,
        });
      }
    }
  }

  return out;
}

// ============================================================
// Alerts
// ============================================================

export interface AlertInput {
  leavePending: number;
  payrollCalculated: boolean;
  absentNoLeave: number;
  docsExpiringSoon: number;
  docsExpired: number;
}

export interface HrAlert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  href: string;
}

const SEVERITY_RANK: Record<'critical' | 'high' | 'medium' | 'low', number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Minimal translation-function shape `deriveAlerts` needs — matches the
 * subset of next-intl's `getTranslations()` return value that's actually
 * called (a key + ICU params in, a string out). Keeping the shape narrow
 * lets tests pass a trivial stub without pulling in next-intl.
 */
export type AlertTranslator = (key: string, values?: Record<string, string | number>) => string;

/**
 * Derive HR alerts from aggregated metrics.
 *
 * Severity rules (matching CRM AI Insights scheme from CLAUDE.md):
 *   critical → leave backlog > 5
 *   high     → payroll not calculated this month OR absent employees with no leave
 *   medium   → 1-5 leave requests pending
 *
 * i18n Phase 5.6 (Approach A, locked): messages are resolved via an injected
 * translator `t` (the route calls `getTranslations('hr.overview.alerts')` and
 * passes it in) instead of being baked as Arabic sentences here. The two
 * leave-count tiers stay TWO keys (flat-threshold doctrine — no ICU plural).
 */
export function deriveAlerts(input: AlertInput, t: AlertTranslator): HrAlert[] {
  const alerts: HrAlert[] = [];

  if (input.leavePending > 5) {
    alerts.push({
      id: 'leave-backlog',
      severity: 'critical',
      message: t('leaveBacklog', { count: input.leavePending }),
      href: '/dashboard/approvals',
    });
  } else if (input.leavePending > 0) {
    alerts.push({
      id: 'leave-pending',
      severity: 'medium',
      message: t('leavePending', { count: input.leavePending }),
      href: '/dashboard/approvals',
    });
  }

  if (!input.payrollCalculated) {
    alerts.push({
      id: 'payroll-not-calculated',
      severity: 'high',
      message: t('payrollNotCalculated'),
      href: '/dashboard/payroll',
    });
  }

  if (input.absentNoLeave > 0) {
    alerts.push({
      id: 'absent-no-leave',
      severity: 'high',
      message: t('absentNoLeave', { count: input.absentNoLeave }),
      href: '/dashboard/attendance',
    });
  }

  if (input.docsExpired > 0) {
    alerts.push({
      id: 'docs-expired',
      severity: 'critical',
      message: t('docsExpired', { count: input.docsExpired }),
      href: '/dashboard/hr/documents',
    });
  }

  if (input.docsExpiringSoon > 0) {
    alerts.push({
      id: 'docs-expiring-soon',
      severity: 'high',
      message: t('docsExpiringSoon', { count: input.docsExpiringSoon }),
      href: '/dashboard/hr/documents',
    });
  }

  return alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
