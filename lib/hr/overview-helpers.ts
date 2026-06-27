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
 * Derive HR alerts from aggregated metrics.
 *
 * Severity rules (matching CRM AI Insights scheme from CLAUDE.md):
 *   critical → leave backlog > 5
 *   high     → payroll not calculated this month OR absent employees with no leave
 *   medium   → 1-5 leave requests pending
 */
export function deriveAlerts(input: AlertInput): HrAlert[] {
  const alerts: HrAlert[] = [];

  if (input.leavePending > 5) {
    alerts.push({
      id: 'leave-backlog',
      severity: 'critical',
      message: `${input.leavePending} طلبات إجازة تنتظر الموافقة`,
      href: '/dashboard/approvals',
    });
  } else if (input.leavePending > 0) {
    alerts.push({
      id: 'leave-pending',
      severity: 'medium',
      message: `${input.leavePending} طلب إجازة بانتظار الموافقة`,
      href: '/dashboard/approvals',
    });
  }

  if (!input.payrollCalculated) {
    alerts.push({
      id: 'payroll-not-calculated',
      severity: 'high',
      message: 'رواتب الشهر الحالي لم تُحتسب بعد',
      href: '/dashboard/payroll',
    });
  }

  if (input.absentNoLeave > 0) {
    alerts.push({
      id: 'absent-no-leave',
      severity: 'high',
      message: `${input.absentNoLeave} موظفين غائبون بلا إجازة اليوم`,
      href: '/dashboard/attendance',
    });
  }

  return alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
