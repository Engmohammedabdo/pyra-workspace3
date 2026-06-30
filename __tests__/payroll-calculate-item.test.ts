import { describe, it, expect } from 'vitest';
import { calculatePayrollItem } from '@/lib/payroll/calculate-item';

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
});
