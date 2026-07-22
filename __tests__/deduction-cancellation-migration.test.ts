import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/051_cancel_employee_deductions.sql'),
  'utf8',
);

describe('migration 051 deduction cancellation', () => {
  it('keeps the deduction and adds documented soft-cancellation fields', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS cancelled_at timestamptz');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS cancelled_by varchar(100)');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS cancellation_reason text');
    expect(migration).toContain("status = 'rejected'");
    expect(migration).not.toMatch(/DELETE FROM public\.pyra_(employee_payments|deduction_cases|manual_deductions)/i);
  });

  it('cancels through one atomic service-role RPC and blocks paid or closed payroll', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.pyra_cancel_employee_deduction');
    expect(migration).toContain("v_payment.status IS NOT DISTINCT FROM 'paid'");
    expect(migration).toContain("v_run.status IN ('approved', 'paid')");
    expect(migration).toContain('pyra_deduction_write_capabilities');
    expect(migration).toContain("status = 'draft'");
    expect(migration).toContain('DELETE FROM public.pyra_payroll_items');
    expect(migration).toContain('FROM authenticated');
    expect(migration).toContain('TO service_role');
  });
});
