import { NextRequest } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/log-error';
import { computeCelebrations, deriveAlerts, type AlertTranslator } from '@/lib/hr/overview-helpers';
import { dubaiDayKey } from '@/lib/utils/format';
import { monthNamesFor } from '@/lib/constants/dates';
import type { Locale } from '@/lib/i18n/config';
import { PAYROLL_WORKING_DAYS_PER_MONTH } from '@/lib/constants/payroll';

// ============================================================
// GET /api/hr/overview
//
// HR Department overview aggregator — admin-only surface.
// Returns headcount, attendance, leave, payroll, evaluations,
// generated alerts, and this-month celebrations in one round trip.
//
// Gate: hr.view (admin/HR managers only)
// Data access: service-role client (bypasses RLS on all HR tables)
// ============================================================

/**
 * Returns a Dubai-calendar YYYY-MM-DD string N days from today (negative = past).
 * Phase 6B: switched from UTC date math to dubaiDayKey so hire-date window
 * boundaries are consistent with the Dubai calendar day used throughout the route.
 */
function daysFromNow(n: number): string {
  return dubaiDayKey(new Date(Date.now() + n * 24 * 60 * 60 * 1000));
}

export async function GET(request: NextRequest) {
  // 1. Auth gate — hr.view is admin-only; returns 401/403 NextResponse if not allowed
  const auth = await requireApiPermission('hr.view');
  if (isApiError(auth)) return auth;

  // Per-request locale — drives the alert messages (t-injection, Approach A)
  // and the active_period / payroll-trend labels below.
  const locale = (await getLocale()) as Locale;
  // next-intl's Translator type is namespace-keyed narrower than the plain
  // (key, values?) => string shape deriveAlerts expects (kept next-intl-free
  // for unit testability) — the runtime call shape is identical.
  const tAlerts = (await getTranslations('hr.overview.alerts')) as unknown as AlertTranslator;

  try {
    // 2. Service-role client — bypasses RLS so we can aggregate across all employees
    const supabase = createServiceRoleClient();
    const todayKey = dubaiDayKey(); // Dubai-timezone calendar day (YYYY-MM-DD)

    // ── Headcount ──────────────────────────────────────────────────────────────
    const { data: allUsers, error: usersError } = await supabase
      .from('pyra_users')
      .select('username, display_name, status, employment_type, department, hire_date, date_of_birth, role, deactivated_at, salary, salary_currency')
      .neq('role', 'client');

    if (usersError) throw new Error(`pyra_users: ${usersError.message}`);

    const activeUsers = (allUsers ?? []).filter((u) => u.status === 'active');

    const by_type: Record<string, number> = {};
    const by_department: Record<string, number> = {};

    for (const u of activeUsers) {
      const empType = u.employment_type ?? 'unknown';
      by_type[empType] = (by_type[empType] ?? 0) + 1;
      if (u.department) {
        by_department[u.department] = (by_department[u.department] ?? 0) + 1;
      }
    }

    const thirtyDaysAgo = daysFromNow(-30);
    const ninetyDaysAgo = daysFromNow(-90);
    const threeSixtyFiveDaysAgo = daysFromNow(-365);
    const new_30d = activeUsers.filter((u) => u.hire_date && u.hire_date >= thirtyDaysAgo).length;
    const new_90d = activeUsers.filter((u) => u.hire_date && u.hire_date >= ninetyDaysAgo).length;

    // ── Turnover / attrition (E4) ────────────────────────────────────────────
    // deactivated_at is a timestamptz stamped on the active → inactive/suspended
    // transition (migration 029). Convert it to the Dubai calendar day (NOT a raw
    // UTC .slice(0,10), which skews ~4h near midnight) so both sides of the window
    // comparison use dubaiDayKey — the thresholds are already Dubai-day via daysFromNow.
    const dateOnly = (iso: string) => dubaiDayKey(new Date(iso));
    const allNonClientUsers = allUsers ?? [];
    const inactive = allNonClientUsers.filter((u) => u.status !== 'active').length;
    const departed_30d = allNonClientUsers.filter(
      (u) => u.deactivated_at && dateOnly(u.deactivated_at) >= thirtyDaysAgo,
    ).length;
    const departed_90d = allNonClientUsers.filter(
      (u) => u.deactivated_at && dateOnly(u.deactivated_at) >= ninetyDaysAgo,
    ).length;
    const departed_365d = allNonClientUsers.filter(
      (u) => u.deactivated_at && dateOnly(u.deactivated_at) >= threeSixtyFiveDaysAgo,
    ).length;

    // Salary lookup per employee — used by the leave-liability calc (E5) below.
    // CURRENCY-SAFE: never sum across currencies, only used per-user then
    // bucketed by that user's own salary_currency.
    const userSalaryMap = new Map<string, { salary: number; currency: string }>();
    for (const u of allNonClientUsers) {
      userSalaryMap.set(u.username, {
        salary: Number(u.salary) || 0,
        currency: (u.salary_currency as string) || 'AED',
      });
    }

    // ── Attendance today ────────────────────────────────────────────────────────
    // pyra_attendance.status values: 'present' | 'late' | 'absent' | etc.
    const { data: todayAttendance, error: attError } = await supabase
      .from('pyra_attendance')
      .select('username, status')
      .eq('date', todayKey);

    if (attError) throw new Error(`pyra_attendance: ${attError.message}`);

    const att = todayAttendance ?? [];
    const presentCount = att.filter((a) => a.status === 'present' || a.status === 'late').length;
    const lateCount = att.filter((a) => a.status === 'late').length;
    const absentCount = att.filter((a) => a.status === 'absent').length;

    // For "absent with no leave" alert: employees in attendance as absent AND
    // not on an approved leave today
    const { data: approvedLeaveAll, error: leaveAllError } = await supabase
      .from('pyra_leave_requests')
      .select('username, start_date, end_date, days_count, status')
      .eq('status', 'approved')
      .gte('end_date', todayKey)
      .order('start_date', { ascending: true });

    if (leaveAllError) throw new Error(`pyra_leave_requests (approved): ${leaveAllError.message}`);

    const approvedLeave = approvedLeaveAll ?? [];

    // Usernames on approved leave today
    const onLeaveTodayUsernames = new Set(
      approvedLeave
        .filter((l) => l.start_date <= todayKey && l.end_date >= todayKey)
        .map((l) => l.username),
    );

    const absentNoLeaveCount = att.filter(
      (a) => a.status === 'absent' && !onLeaveTodayUsernames.has(a.username),
    ).length;

    const present_rate_pct = activeUsers.length
      ? Math.round((presentCount / activeUsers.length) * 100)
      : 0;

    // ── Leave ──────────────────────────────────────────────────────────────────
    const { data: pendingLeaveData, error: pendingLeaveError } = await supabase
      .from('pyra_leave_requests')
      .select('id')
      .eq('status', 'pending');

    if (pendingLeaveError) throw new Error(`pyra_leave_requests (pending): ${pendingLeaveError.message}`);

    // Pending expense approvals (status='pending' — default is 'approved', so 'pending' means awaiting HR)
    const { data: pendingExpensesData, error: pendingExpensesError } = await supabase
      .from('pyra_expenses')
      .select('id')
      .eq('status', 'pending');

    if (pendingExpensesError) throw new Error(`pyra_expenses (pending): ${pendingExpensesError.message}`);

    // Submitted timesheet periods awaiting approval (status='submitted')
    const { data: pendingTimesheetsData, error: pendingTimesheetsError } = await supabase
      .from('pyra_timesheet_periods')
      .select('id')
      .eq('status', 'submitted');

    if (pendingTimesheetsError) throw new Error(`pyra_timesheet_periods (submitted): ${pendingTimesheetsError.message}`);

    const pendingLeaveCt = (pendingLeaveData ?? []).length;
    const pendingExpenseCt = (pendingExpensesData ?? []).length;
    const pendingTimesheetCt = (pendingTimesheetsData ?? []).length;
    const pendingApprovalTotal = pendingLeaveCt + pendingExpenseCt + pendingTimesheetCt;

    // Helper: get display_name for a username from the full non-client user set.
    // Uses allUsers (not activeUsers) so inactive employees on approved leave
    // still resolve to their display_name rather than falling back to raw username.
    const nameOf = (un: string): string =>
      (allUsers ?? []).find((u) => u.username === un)?.display_name ?? un;

    // On-leave today list
    const onLeaveTodayList = approvedLeave
      .filter((l) => l.start_date <= todayKey && l.end_date >= todayKey)
      .map((l) => ({
        username: l.username,
        display_name: nameOf(l.username),
        end_date: l.end_date as string,
      }));

    // Upcoming leaves — starting in the next 7 days (exclusive of today).
    // Derived from the Dubai calendar day so the window boundary is correct
    // at the Dubai day boundary (not off by up to 4 hours vs UTC).
    const in7DaysDate = new Date(todayKey + 'T00:00:00Z');
    in7DaysDate.setUTCDate(in7DaysDate.getUTCDate() + 7);
    const in7Days = in7DaysDate.toISOString().slice(0, 10);
    const upcomingLeave = approvedLeave
      .filter((l) => l.start_date > todayKey && l.start_date <= in7Days)
      .map((l) => ({
        username: l.username,
        display_name: nameOf(l.username),
        start_date: l.start_date as string,
        end_date: l.end_date as string,
        // days_count is the actual column name (brief used total_days — corrected)
        days: l.days_count ?? 0,
      }));

    // Paid-leave liability (E5): remaining days on PAID leave-type balances,
    // valued at each employee's own daily rate (salary / working days per
    // month), bucketed by that employee's salary_currency. NEVER sum across
    // currencies — mirrors the payroll-trend runsByCurrency pattern above.
    const currentYear = new Date().getFullYear();
    const { data: balancesData, error: balancesError } = await supabase
      .from('pyra_leave_balances_v2')
      .select('username, total_days, used_days, carried_over, pyra_leave_types(is_paid)')
      .eq('year', currentYear);

    if (balancesError) throw new Error(`pyra_leave_balances_v2: ${balancesError.message}`);

    const liabilityByCurrency = new Map<string, { amount: number; days: number }>();

    for (const b of balancesData ?? []) {
      // Supabase embeds a many-to-one relation (leave_type_id FK) as a single
      // object, but guard against an array shape defensively.
      const typeRel = Array.isArray(b.pyra_leave_types) ? b.pyra_leave_types[0] : b.pyra_leave_types;
      if (!typeRel || typeRel.is_paid !== true) continue; // unpaid leave types contribute nothing

      const remainingDays = Math.max(0, (b.total_days ?? 0) + (b.carried_over ?? 0) - (b.used_days ?? 0));
      const employee = userSalaryMap.get(b.username);
      const currency = employee?.currency || 'AED';
      const dailyRate = (employee?.salary ?? 0) / PAYROLL_WORKING_DAYS_PER_MONTH;

      const bucket = liabilityByCurrency.get(currency) ?? { amount: 0, days: 0 };
      bucket.amount += remainingDays * dailyRate;
      bucket.days += remainingDays;
      liabilityByCurrency.set(currency, bucket);
    }

    const liability_by_currency = Array.from(liabilityByCurrency.entries()).map(([currency, v]) => ({
      currency,
      amount: Math.round(v.amount * 100) / 100,
      days: v.days,
    }));

    const paid_liability_days = liability_by_currency.reduce((sum, v) => sum + v.days, 0);

    // ── Payroll ────────────────────────────────────────────────────────────────
    const now = new Date();
    const curMonth = now.getMonth() + 1; // 1-12
    const curYear = now.getFullYear();

    const { data: payrollRuns, error: payrollError } = await supabase
      .from('pyra_payroll_runs')
      .select('id, month, year, status, total_amount, currency, paid_at')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(12);

    if (payrollError) throw new Error(`pyra_payroll_runs: ${payrollError.message}`);

    const runs = payrollRuns ?? [];
    const curRun = runs.find((r) => r.month === curMonth && r.year === curYear) ?? null;
    const lastPaidRun = runs.find((r) => r.status === 'paid') ?? null;

    // Trend grouped by currency — NEVER sum or plot across currencies (an
    // AED 15,000 run and an EGP 25,000 run share no axis). Each currency gets
    // its own last-6-runs series, oldest-first for chart rendering. Encounter
    // order is preserved from the desc-sorted runs, so the currency with the
    // most recent run appears first.
    const runsByCurrency = new Map<string, typeof runs>();
    for (const r of runs) {
      const cur = (r.currency as string) || 'AED';
      if (!runsByCurrency.has(cur)) runsByCurrency.set(cur, []);
      runsByCurrency.get(cur)!.push(r);
    }
    const monthNames = monthNamesFor(locale);
    const trend_by_currency = Array.from(runsByCurrency.entries()).map(([currency, cRuns]) => ({
      currency,
      points: cRuns
        .slice(0, 6)
        .reverse()
        .map((r) => ({
          label: monthNames[r.month - 1] ?? String(r.month),
          total: Number(r.total_amount) || 0,
        })),
    }));

    // Count pending employee payments (used for KPI display — no currency summing)
    const { data: pendingPaymentsData, error: pendingPayError } = await supabase
      .from('pyra_employee_payments')
      .select('id')
      .eq('status', 'pending');

    if (pendingPayError) throw new Error(`pyra_employee_payments: ${pendingPayError.message}`);

    // ── Evaluations ────────────────────────────────────────────────────────────
    const { data: activePeriods, error: periodsError } = await supabase
      .from('pyra_evaluation_periods')
      .select('id, name, name_ar, status')
      .eq('status', 'active')
      .limit(1);

    if (periodsError) throw new Error(`pyra_evaluation_periods: ${periodsError.message}`);

    const activePeriod = activePeriods?.[0] ?? null;
    const evalCounts = { pending: 0, submitted: 0, acknowledged: 0 };

    if (activePeriod) {
      const { data: evals, error: evalsError } = await supabase
        .from('pyra_evaluations')
        .select('status')
        .eq('period_id', activePeriod.id);

      if (evalsError) throw new Error(`pyra_evaluations: ${evalsError.message}`);

      for (const e of evals ?? []) {
        if (e.status === 'draft') {
          evalCounts.pending++;
        } else if (e.status === 'submitted') {
          evalCounts.submitted++;
        } else if (e.status === 'acknowledged') {
          evalCounts.acknowledged++;
        }
      }
    }

    // ── Document expiry counts (for alerts) ───────────────────────────────────
    const in30Days = dubaiDayKey(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    const { data: expiredDocs, error: expErr } = await supabase
      .from('pyra_employee_documents')
      .select('id')
      .not('expiry_date', 'is', null)
      .lt('expiry_date', todayKey);
    if (expErr) throw new Error(`pyra_employee_documents (expired): ${expErr.message}`);

    const { data: expiringDocs, error: expSoonErr } = await supabase
      .from('pyra_employee_documents')
      .select('id')
      .gte('expiry_date', todayKey)
      .lte('expiry_date', in30Days);
    if (expSoonErr) throw new Error(`pyra_employee_documents (expiring): ${expSoonErr.message}`);

    // ── Alerts (pure helper) ───────────────────────────────────────────────────
    // payrollCalculated: current month run exists and is NOT in draft state
    const payrollCalculated = !!curRun && curRun.status !== 'draft';
    const alerts = deriveAlerts({
      leavePending: pendingLeaveCt,
      payrollCalculated,
      absentNoLeave: absentNoLeaveCount,
      docsExpired: (expiredDocs ?? []).length,
      docsExpiringSoon: (expiringDocs ?? []).length,
    }, tAlerts);

    // ── Celebrations (pure helper) ─────────────────────────────────────────────
    const celebrations = computeCelebrations(activeUsers, todayKey);

    // ── Compose response ───────────────────────────────────────────────────────
    return apiSuccess({
      headcount: {
        active: activeUsers.length,
        by_type,
        by_department,
        new_30d,
        new_90d,
        inactive,
        departed_30d,
        departed_90d,
        departed_365d,
      },
      attendance_today: {
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        on_leave: onLeaveTodayList.length,
        present_rate_pct,
      },
      leave: {
        pending: pendingLeaveCt,
        on_leave_today: onLeaveTodayList,
        paid_liability_days,
        liability_by_currency,
        upcoming: upcomingLeave,
      },
      pending_approvals: {
        leave: pendingLeaveCt,
        expense: pendingExpenseCt,
        timesheet: pendingTimesheetCt,
        total: pendingApprovalTotal,
      },
      payroll: {
        current_status: curRun?.status ?? null,
        current_month: curMonth,
        current_year: curYear,
        last_paid_total: Number(lastPaidRun?.total_amount) || 0,
        last_paid_currency: (lastPaidRun?.currency as string) || 'AED',
        trend_by_currency,
        pending_payments_count: (pendingPaymentsData ?? []).length,
      },
      evaluations: {
        active_period: activePeriod
          ? (locale === 'ar' ? activePeriod.name_ar : (activePeriod.name || activePeriod.name_ar))
          : null,
        ...evalCounts,
      },
      alerts,
      celebrations,
    });
  } catch (err) {
    logError({
      error: err,
      request,
      metadata: { action: 'hr_overview' },
    });
    return apiServerError();
  }
}
