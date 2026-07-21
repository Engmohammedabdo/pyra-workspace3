import { describe, it, expect } from 'vitest';
import { calculatePayrollItem } from '@/lib/payroll/calculate-item';

// Guard: a final_settlement payment must contribute 0 to net_pay even if it
// somehow reaches the pure calc (defense in depth behind the route exclusion).
describe('calculatePayrollItem ignores final_settlement', () => {
  it('does not fold a final_settlement row into any bucket', () => {
    const withSettlement = calculatePayrollItem({
      baseSalary: 10000,
      hourlyRate: 0,
      payments: [{ source_type: 'final_settlement', amount: 5133.33 }],
      overtimeTimesheets: [],
      unpaidLeave: [],
    });
    const without = calculatePayrollItem({
      baseSalary: 10000,
      hourlyRate: 0,
      payments: [],
      overtimeTimesheets: [],
      unpaidLeave: [],
    });
    expect(withSettlement.net_pay).toBe(without.net_pay);
  });
});
