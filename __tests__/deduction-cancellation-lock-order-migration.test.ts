import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/052_fix_deduction_cancellation_lock_order.sql',
);

describe('migration 052 deduction cancellation lock order', () => {
  it('observes without locking, then locks the payroll run before its payment', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    const runLock = migration.indexOf('FROM public.pyra_payroll_runs AS payroll');
    const paymentLock = migration.indexOf(
      'FROM public.pyra_employee_payments AS payment',
      runLock + 1,
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.pyra_cancel_employee_deduction');
    expect(runLock).toBeGreaterThan(-1);
    expect(paymentLock).toBeGreaterThan(runLock);
    expect(migration.slice(runLock, paymentLock)).toContain('FOR UPDATE');
    expect(migration.slice(paymentLock)).toContain('FOR UPDATE');
    expect(migration).toContain("'state_changed'::text");
  });
});
