import { DEDUCTION_DAYS_PER_MONTH, countDeductibleAbsences } from '@/lib/hr/attendance-policy';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface FinalSettlementInput {
  salary: number;            // pyra_users.salary — monthly total package
  currency: string;          // pyra_users.salary_currency
  hireDate: string;          // YYYY-MM-DD
  lastWorkingDay: string;    // YYYY-MM-DD
  deductibleAbsenceDays: number;
}

export interface FinalSettlement {
  daily_rate: number;
  days_employed: number;     // CALENDAR days, inclusive
  gross: number;
  absence_days: number;
  absence_deduction: number;
  net: number;               // floored at 0
  currency: string;
}

function calendarDaysInclusive(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * Final settlement = (salary/30) × (calendar days employed − deductible absences),
 * floored at 0. The /30 basis is owner-locked: the monthly salary covers every
 * calendar day incl. the paid weekly rest day (lib/hr/attendance-policy.ts:13-16).
 *
 * Net is derived from the UNROUNDED daily rate so the authoritative payable
 * matches the hand-verified 5,133.33 EGP. gross/absence_deduction are each
 * rounded for display and may differ from net by <= 1 cent (a known, harmless
 * independent-rounding artifact at numeric(12,2)).
 */
export function computeFinalSettlement(input: FinalSettlementInput): FinalSettlement {
  const rawDaily = input.salary / DEDUCTION_DAYS_PER_MONTH;
  const days_employed = calendarDaysInclusive(input.hireDate, input.lastWorkingDay);
  const payableDays = Math.max(0, days_employed - input.deductibleAbsenceDays);
  return {
    daily_rate: round2(rawDaily),
    days_employed,
    gross: round2(rawDaily * days_employed),
    absence_days: input.deductibleAbsenceDays,
    absence_deduction: round2(rawDaily * input.deductibleAbsenceDays),
    net: round2(rawDaily * payableDays),
    currency: input.currency,
  };
}

export interface DeriveInput {
  hireDateKey: string;                    // YYYY-MM-DD
  lastWorkingDayKey: string;              // YYYY-MM-DD (the cap)
  workDays: number[];                     // e.g. [1,2,3,4,5,6]; 0 = Sunday
  startHHMM: string;                      // schedule start, e.g. '11:00'
  onTimeDates: string[];                  // dates the employee clocked in on time
  firstAttendanceDateKey: string | null;  // startCountingFrom (don't punish pre-tracking days)
  leaveDates?: string[];
  excusedDates?: string[];
  grace?: number;
}

/**
 * Sum deductible absences across every calendar month the employee was employed,
 * capping the count at lastWorkingDayKey (countDeductibleAbsences has no departure
 * cap of its own — its only bound is todayKey, so we feed it lastWorkingDayKey).
 * nowUaeMinutes = 1440 (end of day): every evaluated date is at or before a past
 * last-working-day, so the "today's grace hasn't elapsed" skip never applies.
 *
 * Adaptation from the task brief: `countDeductibleAbsences` in
 * lib/hr/attendance-policy.ts types `onTimeDates`/`leaveDates`/`excusedDates` as
 * `Set<string>` (not `string[]`) — this caller's own input stays array-shaped
 * (matches the brief + test) and converts to Set at the call site.
 */
export function deriveDeductibleAbsenceDays(input: DeriveInput): number {
  const startMonth = input.hireDateKey.slice(0, 7);   // YYYY-MM
  const endMonth = input.lastWorkingDayKey.slice(0, 7);
  let total = 0;
  let [y, m] = startMonth.split('-').map(Number);
  const [ey, em] = endMonth.split('-').map(Number);
  const onTimeDates = new Set(input.onTimeDates);
  const leaveDates = input.leaveDates ? new Set(input.leaveDates) : undefined;
  const excusedDates = input.excusedDates ? new Set(input.excusedDates) : undefined;
  while (y < ey || (y === ey && m <= em)) {
    const monthKey = `${y}-${String(m).padStart(2, '0')}`;
    const lastDayOfMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthEnd = `${monthKey}-${String(lastDayOfMonth).padStart(2, '0')}`;
    const todayKey = monthEnd < input.lastWorkingDayKey ? monthEnd : input.lastWorkingDayKey;
    total += countDeductibleAbsences({
      monthKey,
      todayKey,
      workDays: input.workDays,
      startHHMM: input.startHHMM,
      nowUaeMinutes: 1440,
      onTimeDates,
      leaveDates,
      excusedDates,
      hireDateKey: input.hireDateKey,
      startCountingFrom: input.firstAttendanceDateKey ?? undefined,
      grace: input.grace,
    });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return total;
}
