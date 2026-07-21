import { describe, it, expect } from 'vitest';
import { computeFinalSettlement, deriveDeductibleAbsenceDays } from '@/lib/hr/final-settlement';

describe('computeFinalSettlement', () => {
  it('reproduces the abdelrahman case exactly (5,133.33 EGP)', () => {
    const s = computeFinalSettlement({
      salary: 14000, currency: 'EGP',
      hireDate: '2026-07-02', lastWorkingDay: '2026-07-14',
      deductibleAbsenceDays: 2,
    });
    expect(s.daily_rate).toBe(466.67);
    expect(s.days_employed).toBe(13);
    expect(s.gross).toBe(6066.67);
    expect(s.absence_deduction).toBe(933.33);
    expect(s.net).toBe(5133.33);
    expect(s.currency).toBe('EGP');
  });

  it('zero absences → net === gross', () => {
    const s = computeFinalSettlement({
      salary: 14000, currency: 'EGP',
      hireDate: '2026-07-02', lastWorkingDay: '2026-07-14',
      deductibleAbsenceDays: 0,
    });
    expect(s.net).toBe(6066.67);
    expect(s.net).toBe(s.gross);
  });

  it('absences >= days employed → net floors at 0', () => {
    const s = computeFinalSettlement({
      salary: 3000, currency: 'AED',
      hireDate: '2026-07-01', lastWorkingDay: '2026-07-03', // 3 days
      deductibleAbsenceDays: 10,
    });
    expect(s.net).toBe(0);
  });

  it('same-day hire and leave → 1 calendar day', () => {
    const s = computeFinalSettlement({
      salary: 3000, currency: 'AED',
      hireDate: '2026-07-02', lastWorkingDay: '2026-07-02',
      deductibleAbsenceDays: 0,
    });
    expect(s.days_employed).toBe(1);
    expect(s.net).toBe(100); // 3000/30 * 1
  });

  it('spans two calendar months (inclusive calendar days)', () => {
    const s = computeFinalSettlement({
      salary: 3000, currency: 'AED',
      hireDate: '2026-06-28', lastWorkingDay: '2026-07-05',
      deductibleAbsenceDays: 0,
    });
    expect(s.days_employed).toBe(8); // Jun 28,29,30 + Jul 1,2,3,4,5
  });
});

describe('deriveDeductibleAbsenceDays', () => {
  it('abdelrahman single month → 2 (07-09 late, 07-10 no-show), capped at last working day', () => {
    const n = deriveDeductibleAbsenceDays({
      hireDateKey: '2026-07-02',
      lastWorkingDayKey: '2026-07-14',
      workDays: [1, 2, 3, 4, 5, 6],
      startHHMM: '11:00',
      onTimeDates: ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-11', '2026-07-13', '2026-07-14'],
      firstAttendanceDateKey: '2026-07-06',
    });
    expect(n).toBe(2);
  });

  it('does NOT count days after the last working day', () => {
    // Same inputs but pretend the run is evaluated well past the exit — the cap must hold.
    const n = deriveDeductibleAbsenceDays({
      hireDateKey: '2026-07-02',
      lastWorkingDayKey: '2026-07-11', // earlier last day
      workDays: [1, 2, 3, 4, 5, 6],
      startHHMM: '11:00',
      onTimeDates: ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-11'],
      firstAttendanceDateKey: '2026-07-06',
    });
    expect(n).toBe(2); // 07-09 + 07-10 only; 07-13/07-14 are past the cap
  });
});
