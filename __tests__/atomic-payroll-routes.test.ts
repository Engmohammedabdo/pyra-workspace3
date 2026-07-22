import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const calculateRoute = read('app/api/dashboard/payroll/[id]/calculate/route.ts');
const payrollRoute = read('app/api/dashboard/payroll/[id]/route.ts');
const paymentRoute = read('app/api/dashboard/employee-payments/[id]/route.ts');

describe('atomic payroll API writers', () => {
  it('commits calculation, item replacement, and payment links through one RPC', () => {
    expect(calculateRoute).toContain(".rpc('pyra_commit_payroll_calculation'");
    expect(calculateRoute).toContain('p_expected_calculated_at: run.calculated_at');
    expect(calculateRoute).toContain('monetary_deductions');
    expect(calculateRoute).toContain('unpaid_leave_deductions');
    expect(calculateRoute).toMatch(/cannotCalculateInStatus[\s\S]{0,100}, 409\)/);
    expect(calculateRoute).toContain(".neq('source_type', EMPLOYEE_PAYMENT_SOURCE_TYPE.DEDUCTION)");
    expect(calculateRoute).not.toMatch(/from\('pyra_payroll_items'\)[\s\S]{0,120}\.delete\(/);
    expect(calculateRoute).not.toMatch(/from\('pyra_payroll_runs'\)[\s\S]{0,180}\.update\(/);
  });

  it('approves, pays, and deletes payroll runs through atomic RPCs', () => {
    expect(payrollRoute).toContain(".rpc('pyra_approve_payroll_run'");
    expect(payrollRoute).toContain(".rpc('pyra_pay_payroll_run'");
    expect(payrollRoute).toContain(".rpc('pyra_delete_draft_payroll_run'");
    expect(payrollRoute).not.toContain('markPaymentsPaidAndPropagate');
    expect(payrollRoute).not.toMatch(/from\('pyra_expenses'\)[\s\S]{0,100}\.(insert|delete)\(/);
  });

  it('uses the atomic direct-pay RPC and never writes a task separately', () => {
    expect(paymentRoute).toContain(".rpc('pyra_approve_employee_payment'");
    expect(paymentRoute).toContain(".rpc('pyra_pay_employee_payment'");
    expect(paymentRoute).toContain('PAYMENT_LINKED');
    expect(paymentRoute).toContain('DIRECT_PAY_DISALLOWED');
    expect(paymentRoute).not.toMatch(/from\('pyra_tasks'\)[\s\S]{0,120}\.update\(/);
    expect(paymentRoute).not.toMatch(/from\('pyra_employee_payments'\)[\s\S]{0,220}\.update\(/);
  });

  it('uses fail-closed maybeSingle run reads instead of mapping query errors to 404', () => {
    expect(calculateRoute).toContain('.maybeSingle()');
    expect(payrollRoute).toContain('.maybeSingle()');
  });
});
