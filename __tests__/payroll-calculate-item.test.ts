import { describe, it, expect } from 'vitest';
import { calculatePayrollItem, hireProrationFactor, leaveOverlapDays } from '@/lib/payroll/calculate-item';

describe('leaveOverlapDays', () => {
  it('leave fully inside the run month → full inclusive day count', () => {
    expect(leaveOverlapDays('2026-07-10', '2026-07-12', '2026-07-01', '2026-07-31')).toBe(3);
  });
  it('single-day leave → 1', () => {
    expect(leaveOverlapDays('2026-07-05', '2026-07-05', '2026-07-01', '2026-07-31')).toBe(1);
  });
  it('leave spanning into the month from before → only the in-month days', () => {
    // Jun 28 → Jul 3, run = July → Jul 1,2,3 = 3 days
    expect(leaveOverlapDays('2026-06-28', '2026-07-03', '2026-07-01', '2026-07-31')).toBe(3);
  });
  it('leave spanning out of the month → only the in-month days', () => {
    // Jul 30 → Aug 2, run = July → Jul 30,31 = 2 days
    expect(leaveOverlapDays('2026-07-30', '2026-08-02', '2026-07-01', '2026-07-31')).toBe(2);
  });
  it('leave entirely outside the run month → 0', () => {
    expect(leaveOverlapDays('2026-08-01', '2026-08-05', '2026-07-01', '2026-07-31')).toBe(0);
  });
  it('leave covering the whole month → all days', () => {
    expect(leaveOverlapDays('2026-06-15', '2026-08-15', '2026-07-01', '2026-07-31')).toBe(31);
  });
  it('malformed date → 0 (no crash)', () => {
    expect(leaveOverlapDays('', '2026-07-05', '2026-07-01', '2026-07-31')).toBe(0);
  });
});

describe('calculatePayrollItem', () => {
  it('base salary only → net = base', () => {
    const r = calculatePayrollItem({
      baseSalary: 5000, hourlyRate: 0, payments: [], overtimeTimesheets: [], unpaidLeave: [],
    });
    expect(r.net_pay).toBe(5000);
    expect(r.commission).toBe(0);
    expect(r.overtime_amount).toBe(0);
  });

  it('sums task, bonus, commission payments into net', () => {
    const r = calculatePayrollItem({
      baseSalary: 5000, hourlyRate: 0,
      payments: [
        { source_type: 'task', amount: 300 },
        { source_type: 'bonus', amount: 200 },
        { source_type: 'commission', amount: 500 },
      ],
      overtimeTimesheets: [], unpaidLeave: [],
    });
    expect(r.task_payments).toBe(300);
    expect(r.bonus).toBe(200);
    expect(r.commission).toBe(500);
    expect(r.net_pay).toBe(6000);
  });

  it('counts manual overtime payment AND timesheet overtime in overtime_amount', () => {
    const r = calculatePayrollItem({
      baseSalary: 0, hourlyRate: 100,
      payments: [{ source_type: 'overtime', amount: 250 }],
      overtimeTimesheets: [{ hours: 2, multiplier: 1.5 }], // 2*100*1.5 = 300
      unpaidLeave: [],
    });
    expect(r.overtime_amount).toBe(550);
    expect(r.net_pay).toBe(550);
  });

  it('uses default multiplier when timesheet multiplier is null', () => {
    const r = calculatePayrollItem({
      baseSalary: 0, hourlyRate: 100,
      payments: [],
      overtimeTimesheets: [{ hours: 2, multiplier: null }], // 2*100*1.5 = 300
      unpaidLeave: [],
    });
    expect(r.overtime_amount).toBe(300);
  });

  it('deducts manual deductions and unpaid leave (base/22 per day)', () => {
    const r = calculatePayrollItem({
      baseSalary: 2200, hourlyRate: 0,
      payments: [{ source_type: 'deduction', amount: 100 }],
      overtimeTimesheets: [],
      unpaidLeave: [{ days: 2, typeName: 'إجازة غير مدفوعة' }], // 2200/22=100/day *2 = 200
    });
    expect(r.deductions).toBe(300);
    expect(r.deduction_details).toEqual([
      { type: 'deduction', amount: 100 },
      { type: 'unpaid_leave', amount: 200, reason: 'إجازة غير مدفوعة — 2 يوم' },
    ]);
    expect(r.net_pay).toBe(1900);
  });

  it('caps all source_type=deduction money at 25% of monthly salary before unpaid leave', () => {
    const r = calculatePayrollItem({
      baseSalary: 2200, hourlyRate: 0,
      payments: [
        { source_type: 'deduction', amount: 400 },
        { source_type: 'deduction', amount: 300 },
      ],
      overtimeTimesheets: [],
      unpaidLeave: [{ days: 1, typeName: 'Unpaid leave' }],
    });

    expect(r.deduction_details).toEqual([
      { type: 'deduction', amount: 400 },
      { type: 'deduction', amount: 150 },
      { type: 'unpaid_leave', amount: 100, reason: 'Unpaid leave — 1 يوم' },
    ]);
    expect(r.deductions).toBe(650);
    expect(r.monetary_deductions).toBe(550);
    expect(r.unpaid_leave_deductions).toBe(100);
    expect(r.net_pay).toBe(1550);
  });

  it('uses the full monthly salary, not the prorated base, for the 25% monetary cap', () => {
    const r = calculatePayrollItem({
      baseSalary: 3000, hourlyRate: 0,
      payments: [{ source_type: 'deduction', amount: 900 }],
      overtimeTimesheets: [], unpaidLeave: [],
      prorationFactor: 0.5,
    });

    expect(r.base_salary).toBe(1500);
    expect(r.deductions).toBe(750);
    expect(r.net_pay).toBe(750);
  });

  it('deducts an approved attendance exemption in full outside the 25% cap', () => {
    const r = calculatePayrollItem({
      baseSalary: 2000, hourlyRate: 0,
      payments: [
        { source_type: 'deduction', amount: 500 },
        {
          source_type: 'deduction',
          amount: 300,
          deduction_cap_exempt_amount: 300,
        },
      ],
      overtimeTimesheets: [], unpaidLeave: [],
    });

    expect(r.deduction_details).toEqual([
      { type: 'deduction', amount: 500 },
      { type: 'deduction', amount: 300 },
    ]);
    expect(r.monetary_deductions).toBe(800);
    expect(r.deductions).toBe(800);
    expect(r.net_pay).toBe(1200);
  });

  it('only charges the non-exempt portion of a deduction against the 25% cap', () => {
    const r = calculatePayrollItem({
      baseSalary: 1000, hourlyRate: 0,
      payments: [{
        source_type: 'deduction',
        amount: 500,
        deduction_cap_exempt_amount: 150,
      }],
      overtimeTimesheets: [], unpaidLeave: [],
    });

    // 150 exempt + 250 capped = 400 applied from the requested 500.
    expect(r.deduction_details).toEqual([{ type: 'deduction', amount: 400 }]);
    expect(r.monetary_deductions).toBe(400);
    expect(r.net_pay).toBe(600);
  });

  it('clamps an excessive exemption to the payment amount without consuming the cap', () => {
    const r = calculatePayrollItem({
      baseSalary: 400, hourlyRate: 0,
      payments: [
        {
          source_type: 'deduction',
          amount: 80,
          deduction_cap_exempt_amount: 999,
        },
        { source_type: 'deduction', amount: 100 },
      ],
      overtimeTimesheets: [], unpaidLeave: [],
    });

    expect(r.deduction_details).toEqual([
      { type: 'deduction', amount: 80 },
      { type: 'deduction', amount: 100 },
    ]);
    expect(r.monetary_deductions).toBe(180);
  });

  it.each([
    ['negative', -50],
    ['non-numeric', 'not-a-number'],
    ['non-finite', Number.POSITIVE_INFINITY],
  ])('treats an invalid %s exemption as zero', (_label, exemption) => {
    const r = calculatePayrollItem({
      baseSalary: 400, hourlyRate: 0,
      payments: [{
        source_type: 'deduction',
        amount: 150,
        deduction_cap_exempt_amount: exemption,
      }],
      overtimeTimesheets: [], unpaidLeave: [],
    });

    expect(r.deduction_details).toEqual([{ type: 'deduction', amount: 100 }]);
    expect(r.monetary_deductions).toBe(100);
  });

  it('floors net at 0 when capped monetary deductions plus unpaid leave exceed earnings', () => {
    const r = calculatePayrollItem({
      baseSalary: 100, hourlyRate: 0,
      payments: [{ source_type: 'deduction', amount: 500 }],
      overtimeTimesheets: [], unpaidLeave: [{ days: 22, typeName: 'Unpaid leave' }],
    });
    expect(r.net_pay).toBe(0);
  });

  it('skips unpaid-leave deduction when baseSalary is 0 (no daily rate)', () => {
    const r = calculatePayrollItem({
      baseSalary: 0, hourlyRate: 0, payments: [],
      overtimeTimesheets: [], unpaidLeave: [{ days: 3, typeName: 'إجازة غير مدفوعة' }],
    });
    expect(r.deductions).toBe(0);
    expect(r.net_pay).toBe(0);
  });

  it('pro-rates ONLY the base salary; additions are paid in full', () => {
    // hired with 2/30 of the month worked, base 3000 → 200; bonus 500 paid full
    const r = calculatePayrollItem({
      baseSalary: 3000, hourlyRate: 0,
      payments: [{ source_type: 'bonus', amount: 500 }],
      overtimeTimesheets: [], unpaidLeave: [],
      prorationFactor: 2 / 30,
    });
    expect(r.base_salary).toBe(200);
    expect(r.bonus).toBe(500);
    expect(r.net_pay).toBe(700);
  });

  it('matches the real case: 5000 salary, hired day 29 of a 30-day month → 333.33', () => {
    const factor = hireProrationFactor('2026-06-29', 2026, 6);
    const r = calculatePayrollItem({
      baseSalary: 5000, hourlyRate: 0, payments: [], overtimeTimesheets: [], unpaidLeave: [],
      prorationFactor: factor,
    });
    expect(r.base_salary).toBe(333.33);
    expect(r.net_pay).toBe(333.33);
  });
});

describe('hireProrationFactor', () => {
  it('returns 1 when no hire date', () => {
    expect(hireProrationFactor(null, 2026, 6)).toBe(1);
    expect(hireProrationFactor('', 2026, 6)).toBe(1);
  });

  it('returns 1 when hired before the run month', () => {
    expect(hireProrationFactor('2025-06-29', 2026, 6)).toBe(1);
    expect(hireProrationFactor('2026-05-31', 2026, 6)).toBe(1);
  });

  it('returns 0 when hired after the run month (not yet employed)', () => {
    expect(hireProrationFactor('2026-07-01', 2026, 6)).toBe(0);
    expect(hireProrationFactor('2027-01-10', 2026, 6)).toBe(0);
  });

  it('pro-rates within the hire month by calendar days / days-in-month', () => {
    // June has 30 days; hired the 29th → days 29,30 = 2 worked
    expect(hireProrationFactor('2026-06-29', 2026, 6)).toBeCloseTo(2 / 30, 10);
    // first day → full month
    expect(hireProrationFactor('2026-06-01', 2026, 6)).toBe(1);
    // last day → 1 day
    expect(hireProrationFactor('2026-06-30', 2026, 6)).toBeCloseTo(1 / 30, 10);
  });

  it('uses the actual days in the run month (February)', () => {
    // Feb 2026 has 28 days; hired the 27th → days 27,28 = 2 worked
    expect(hireProrationFactor('2026-02-27', 2026, 2)).toBeCloseTo(2 / 28, 10);
  });
});
