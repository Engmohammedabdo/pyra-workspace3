import { describe, it, expect } from 'vitest';
import { calculatePayrollItem, hireProrationFactor } from '@/lib/payroll/calculate-item';

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

  it('floors net at 0 (deductions exceed earnings)', () => {
    const r = calculatePayrollItem({
      baseSalary: 100, hourlyRate: 0,
      payments: [{ source_type: 'deduction', amount: 500 }],
      overtimeTimesheets: [], unpaidLeave: [],
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
