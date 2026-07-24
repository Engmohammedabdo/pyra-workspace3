import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildEmployeePaymentMonthFilter,
  mergePayrollPeriodPayments,
  paymentBelongsToPayrollPeriod,
} from '@/lib/payroll/payment-period';

type Payment = {
  id: string;
  source_type: string;
  effective_month: string | null;
  created_at: string;
};

const juneDeductionApprovedInJuly: Payment = {
  id: 'deduction-june',
  source_type: 'deduction',
  effective_month: '2026-06-01',
  created_at: '2026-07-05T09:00:00.000Z',
};

describe('employee-payment period selection', () => {
  it('assigns generated deductions to effective_month, not approval month', () => {
    expect(paymentBelongsToPayrollPeriod(juneDeductionApprovedInJuly, '2026-06')).toBe(true);
    expect(paymentBelongsToPayrollPeriod(juneDeductionApprovedInJuly, '2026-07')).toBe(false);
  });

  it('fails closed for deductions without effective_month and falls back only for non-deductions', () => {
    const legacyDeduction: Payment = {
      id: 'legacy-deduction',
      source_type: 'deduction',
      effective_month: null,
      created_at: '2026-07-07T10:30:00.000Z',
    };
    const julyBonus: Payment = {
      id: 'july-bonus',
      source_type: 'bonus',
      effective_month: null,
      created_at: '2026-07-10T08:00:00.000Z',
    };

    expect(paymentBelongsToPayrollPeriod(legacyDeduction, '2026-07')).toBe(false);
    expect(paymentBelongsToPayrollPeriod(legacyDeduction, '2026-06')).toBe(false);
    expect(paymentBelongsToPayrollPeriod(julyBonus, '2026-07')).toBe(true);
  });

  it('uses Dubai month boundaries for created_at instead of UTC month slicing', () => {
    const dubaiJuneStart: Payment = {
      id: 'dubai-june-start', source_type: 'bonus', effective_month: null,
      created_at: '2026-05-31T20:00:00.000Z',
    };
    const dubaiJulyStart: Payment = {
      id: 'dubai-july-start', source_type: 'bonus', effective_month: null,
      created_at: '2026-06-30T20:00:00.000Z',
    };

    expect(paymentBelongsToPayrollPeriod(dubaiJuneStart, '2026-06')).toBe(true);
    expect(paymentBelongsToPayrollPeriod(dubaiJuneStart, '2026-05')).toBe(false);
    expect(paymentBelongsToPayrollPeriod(dubaiJulyStart, '2026-06')).toBe(false);
    expect(paymentBelongsToPayrollPeriod(dubaiJulyStart, '2026-07')).toBe(true);
  });

  it('never sweeps final settlements into monthly payroll', () => {
    expect(paymentBelongsToPayrollPeriod({
      id: 'settlement',
      source_type: 'final_settlement',
      effective_month: null,
      created_at: '2026-07-10T08:00:00.000Z',
    }, '2026-07')).toBe(false);
  });

  it('combines the generated and legacy query results without duplicate ids', () => {
    const legacyBonus: Payment = {
      id: 'bonus-june',
      source_type: 'bonus',
      effective_month: null,
      created_at: '2026-06-15T08:00:00.000Z',
    };

    const merged = mergePayrollPeriodPayments(
      '2026-06',
      [legacyBonus, juneDeductionApprovedInJuly],
      [juneDeductionApprovedInJuly],
    );

    expect(merged.map(payment => payment.id)).toEqual(['bonus-june', 'deduction-june']);
  });

  it('builds the generic listing filter with effective-month and legacy branches', () => {
    expect(buildEmployeePaymentMonthFilter('2026-06')).toBe(
      'and(source_type.eq.deduction,effective_month.eq.2026-06-01),' +
      'and(source_type.neq.deduction,effective_month.is.null,' +
      'created_at.gte.2026-06-01T00:00:00+04:00,' +
      'created_at.lt.2026-07-01T00:00:00+04:00)',
    );
    expect(buildEmployeePaymentMonthFilter('2026-13')).toBeNull();
  });
});

describe('employee-payments listing route period boundary', () => {
  it('uses the shared effective-month filter instead of a created_at-only month window', () => {
    const source = readFileSync(resolve(
      process.cwd(), 'app/api/dashboard/employee-payments/route.ts',
    ), 'utf8');

    expect(source).toContain('buildEmployeePaymentMonthFilter');
    expect(source).toContain('query = query.or(monthFilter)');
    expect(source).not.toContain("query = query.gte('created_at', startDate).lte('created_at', endDate)");
  });
});
