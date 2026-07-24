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
import { DEFAULT_WORK_DAYS } from '@/lib/constants/auth';
import { NON_DEDUCTIBLE_ATTENDANCE_STATUSES } from '@/lib/constants/statuses';
import {
  deriveDayStatus, isOnTimeClockIn, lateMinutesOf, listDeductibleAbsenceDates,
} from '@/lib/hr/attendance-policy';
import {
  calculateAttendanceDeduction,
  isEmployeeDeductionAudience,
} from '@/lib/hr/deductions';

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

// Dubai wall-clock "HH:MM" for a timestamptz (UTC+4, no DST — matches dubaiDayKey).
function dubaiHHMM(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(new Date(iso).getTime() + 4 * 60 * 60 * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
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
      .select('username, display_name, status, employment_type, department, hire_date, date_of_birth, role, deactivated_at, salary, salary_currency, work_schedule_id, attendance_tracking_started_on, attendance_tracking_start_source')
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
      const salary = Number(u.salary);
      const currency = typeof u.salary_currency === 'string' ? u.salary_currency : '';
      if (!Number.isFinite(salary) || salary < 0 || !/^[A-Z]{3}$/.test(currency)) continue;
      userSalaryMap.set(u.username, {
        salary,
        currency,
      });
    }

    // ── Attendance today ────────────────────────────────────────────────────────
    // pyra_attendance.status values: 'present' | 'late' | 'absent' | etc.
    const { data: todayAttendance, error: attError } = await supabase
      .from('pyra_attendance')
      .select('username, status, clock_in, clock_out, total_hours')
      .eq('date', todayKey);

    if (attError) throw new Error(`pyra_attendance: ${attError.message}`);

    const att = todayAttendance ?? [];

    // Work schedules — power the per-employee daily roster (expected start +
    // lateness). Each user's start time drives the "late by N min" figure.
    const { data: schedules, error: schedError } = await supabase
      .from('pyra_work_schedules')
      .select('id, start_time, is_default, work_days');
    if (schedError) throw new Error(`pyra_work_schedules: ${schedError.message}`);
    const scheduleStartMap = new Map((schedules ?? []).map((s) => [s.id as string, s.start_time as string]));
    const scheduleWorkDaysMap = new Map(
      (schedules ?? []).map((s) => [s.id as string, (s.work_days as number[] | null) ?? null]),
    );
    const defaultStart = (schedules ?? []).find((s) => s.is_default)?.start_time ?? '09:00:00';
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

    // ── Daily attendance roster + month-to-date deductible absences ─────────────
    // The punch-clock view the admin checks daily. Covers active STAFF who clock
    // in (admins excluded). Today's status is RE-DERIVED from clock_in vs
    // (start + grace) — NOT the stored status — so rows written under the old
    // >start-only rule re-classify. Each row also carries the month-to-date
    // deductible-absence count (grace policy, locked 2026-07-10): a work day with
    // no on-time clock-in (and not on approved leave) is a deductible absence.
    const attByUser = new Map(att.map((a) => [a.username, a]));
    const rosterUsers = activeUsers.filter((u) => u.role !== 'admin');
    const monthKey = todayKey.slice(0, 7);
    const monthStart = `${monthKey}-01`;
    const nowUae = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const nowUaeMinutes = nowUae.getUTCHours() * 60 + nowUae.getUTCMinutes();

    const { data: monthAttData, error: monthAttError } = await supabase
      .from('pyra_attendance')
      .select('username, date, clock_in, status')
      .gte('date', monthStart)
      .lte('date', todayKey);
    if (monthAttError) throw new Error(`pyra_attendance (month): ${monthAttError.message}`);

    const { data: monthLeaveData, error: monthLeaveError } = await supabase
      .from('pyra_leave_requests')
      .select('username, start_date, end_date')
      .eq('status', 'approved')
      .lte('start_date', todayKey)
      .gte('end_date', monthStart);
    if (monthLeaveError) throw new Error(`pyra_leave_requests (month): ${monthLeaveError.message}`);

    const monthAttendanceByUserDate = new Map<
      string,
      Map<string, NonNullable<typeof monthAttData>[number]>
    >();
    for (const row of monthAttData ?? []) {
      const username = row.username as string;
      const date = String(row.date).slice(0, 10);
      const byDate = monthAttendanceByUserDate.get(username) ?? new Map();
      byDate.set(date, row);
      monthAttendanceByUserDate.set(username, byDate);
    }

    const startFullOf = (u: { work_schedule_id: string | null }) =>
      (u.work_schedule_id && scheduleStartMap.get(u.work_schedule_id)) || defaultStart;
    const workDaysOf = (u: { work_schedule_id: string | null }) =>
      (u.work_schedule_id && scheduleWorkDaysMap.get(u.work_schedule_id)) || [...DEFAULT_WORK_DAYS];
    const trackingStartOf = (u: {
      attendance_tracking_started_on: string | null;
      attendance_tracking_start_source: string | null;
      hire_date: string | null;
    }) => {
      const startedOn = u.attendance_tracking_started_on?.slice(0, 10) ?? null;
      if (u.attendance_tracking_start_source !== 'observed'
        && u.attendance_tracking_start_source !== 'admin') return null;
      if (!startedOn || !/^\d{4}-\d{2}-\d{2}$/.test(startedOn)) return null;
      if (u.hire_date && startedOn < String(u.hire_date).slice(0, 10)) return null;
      return startedOn;
    };

    // Per-user on-time dates and admin-excused dates. Tracking start is a
    // separately documented employee fact; it never resets with the month.
    // Excused (permission) / holiday / weekend rows are admin intent → the day is
    // NOT a deductible absence even without an on-time clock-in.
    const excusedStatuses = new Set<string>(NON_DEDUCTIBLE_ATTENDANCE_STATUSES);
    const onTimeDatesByUser = new Map<string, Set<string>>();
    const excusedDatesByUser = new Map<string, Set<string>>();
    for (const u of rosterUsers) {
      const startFull = startFullOf(u);
      const onTime = new Set<string>();
      const excused = new Set<string>();
      for (const r of monthAttData ?? []) {
        if (r.username !== u.username) continue;
        const day = String(r.date).slice(0, 10);
        if (isOnTimeClockIn(r.clock_in, startFull)) onTime.add(day);
        if (excusedStatuses.has(r.status as string)) excused.add(day);
      }
      onTimeDatesByUser.set(u.username, onTime);
      excusedDatesByUser.set(u.username, excused);
    }

    // Per-user approved-leave dates this month (expanded over the range).
    const leaveDatesByUser = new Map<string, Set<string>>();
    for (const l of monthLeaveData ?? []) {
      const set = leaveDatesByUser.get(l.username) ?? new Set<string>();
      const from = l.start_date > monthStart ? l.start_date : monthStart;
      const to = l.end_date < todayKey ? l.end_date : todayKey;
      for (
        let d = new Date(from + 'T00:00:00Z');
        d <= new Date(to + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        set.add(d.toISOString().slice(0, 10));
      }
      leaveDatesByUser.set(l.username, set);
    }

    const rosterStatusOrder: Record<string, number> = {
      absent: 0, late: 1, not_clocked_in: 2, present: 3, on_leave: 4,
    };
    const roster = rosterUsers
      .filter((u) => Boolean(trackingStartOf(u)) || onLeaveTodayUsernames.has(u.username))
      .map((u) => {
        const startFull = startFullOf(u);
        const expected_start = startFull.slice(0, 5); // HH:MM
        const a = attByUser.get(u.username);
        const sal = userSalaryMap.get(u.username);

        const trackingStart = trackingStartOf(u);
        const deductionEligible = isEmployeeDeductionAudience(u.role);
        const candidateDates = deductionEligible && trackingStart
          ? listDeductibleAbsenceDates({
              monthKey,
              todayKey,
              workDays: workDaysOf(u),
              startHHMM: startFull,
              nowUaeMinutes,
              onTimeDates: onTimeDatesByUser.get(u.username) ?? new Set(),
              leaveDates: leaveDatesByUser.get(u.username),
              excusedDates: excusedDatesByUser.get(u.username),
              hireDateKey: u.hire_date ? String(u.hire_date).slice(0, 10) : null,
              startCountingFrom: trackingStart,
            })
          : [];
        const currency = sal?.currency ?? null;
        const rowsByDate = monthAttendanceByUserDate.get(u.username);
        const attendanceDeduction = calculateAttendanceDeduction(
          sal?.salary ?? 0,
          candidateDates.map((date) => {
            const row = rowsByDate?.get(date);
            return {
              date,
              late_minutes: row?.clock_in ? lateMinutesOf(row.clock_in, startFull) : null,
            };
          }),
        );

        // Today's status — admin intent (excused/holiday) wins; else re-derived
        // with the grace policy.
        let status: string;
        if (a && excusedStatuses.has(a.status as string)) {
          status = a.status as string; // excused / holiday / weekend
        } else if (a) {
          const d = deriveDayStatus(a.clock_in, startFull, nowUaeMinutes);
          status = d === 'pending'
            ? 'not_clocked_in'
            : d === 'absent' && a.clock_in
              ? 'late'
              : d;
        } else if (onLeaveTodayUsernames.has(u.username)) {
          status = 'on_leave';
        } else {
          status = deriveDayStatus(null, startFull, nowUaeMinutes) === 'absent' ? 'absent' : 'not_clocked_in';
        }

        return {
          username: u.username,
          display_name: u.display_name,
          status,
          clock_in_time: dubaiHHMM(a?.clock_in),
          clock_out_time: dubaiHHMM(a?.clock_out),
          total_hours: Number(a?.total_hours) || 0,
          expected_start,
          late_minutes: a ? lateMinutesOf(a.clock_in, startFull) : 0,
          deductible_absences: attendanceDeduction.incidents.length,
          deduction_units: attendanceDeduction.total_units,
          deduction_incidents: attendanceDeduction.incidents,
          estimated_deduction: sal ? attendanceDeduction.amount : null,
          currency,
        };
      })
      .sort((a, b) => (rosterStatusOrder[a.status] ?? 9) - (rosterStatusOrder[b.status] ?? 9));

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
      if (!employee) continue;
      const currency = employee.currency;
      const dailyRate = employee.salary / PAYROLL_WORKING_DAYS_PER_MONTH;

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
        roster,
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
