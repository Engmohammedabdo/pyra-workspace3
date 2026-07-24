import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/050_enable_current_month_computed_deduction_approval.sql'),
  'utf8',
);

describe('migration 050 current-month computed deduction approval', () => {
  it('removes only the temporary guard from the verified migration 046 function body', () => {
    expect(migration).toContain('pg_catalog.pg_get_functiondef');
    expect(migration).toContain("MESSAGE = 'deduction_current_period'");
    expect(migration).toContain('pg_catalog.replace(v_definition, v_old_guard');
    expect(migration).toContain("guard differs from migration 046");
    expect(migration).toContain("current-month deduction guard was not removed");
  });

  it('keeps the RPC service-role-only and performs no direct data mutation', () => {
    expect(migration).toContain('FROM authenticated');
    expect(migration).toContain('TO service_role');
    expect(migration).not.toMatch(/INSERT INTO public\.pyra_(deduction_cases|employee_payments)/i);
    expect(migration).not.toMatch(/DELETE FROM public\.pyra_(deduction_cases|employee_payments)/i);
  });
});
