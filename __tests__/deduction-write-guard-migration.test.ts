import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const payrollMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/046_atomic_payroll_integrity.sql',
);
const guardMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/047_harden_deduction_writes.sql',
);
const verifierPath = resolve(
  process.cwd(),
  'scripts/sql/verify-047-harden-deduction-writes.sql',
);
const smokePath = resolve(
  process.cwd(),
  '.superpowers/sdd/task-payroll-047-rollback-smoke.sql',
);

const payrollMigration = existsSync(payrollMigrationPath)
  ? readFileSync(payrollMigrationPath, 'utf8')
  : '';
const guardMigration = existsSync(guardMigrationPath)
  ? readFileSync(guardMigrationPath, 'utf8')
  : '';
const verifier = existsSync(verifierPath) ? readFileSync(verifierPath, 'utf8') : '';
const smoke = existsSync(smokePath) ? readFileSync(smokePath, 'utf8') : '';

describe('post-deploy deduction ledger write guard', () => {
  it('is explicitly deployment-ordered and never bundled into migration 046', () => {
    expect(guardMigration).toContain('POST-DEPLOY ONLY');
    expect(guardMigration).toContain('after the atomic payroll routes are live');
    expect(payrollMigration).not.toContain('CREATE TRIGGER trg_guard_deduction_payment_writes');
  });

  it('guards inserts, updates, and deletes that touch deduction rows', () => {
    expect(guardMigration).toContain('FUNCTION public.pyra_guard_deduction_payment_writes()');
    expect(guardMigration).toContain("TG_OP = 'INSERT'");
    expect(guardMigration).toContain("TG_OP = 'UPDATE'");
    expect(guardMigration).toContain("TG_OP = 'DELETE'");
    expect(guardMigration).toContain("OLD.source_type = 'deduction'");
    expect(guardMigration).toContain("NEW.source_type = 'deduction'");
    expect(guardMigration).toContain('deduction_payment_write_requires_atomic_rpc');
    expect(guardMigration).toContain('CREATE TRIGGER trg_guard_deduction_payment_writes');
  });

  it('fails closed before freezing an unresolved legacy pending deduction', () => {
    const lock = guardMigration.indexOf(
      'LOCK TABLE public.pyra_employee_payments IN EXCLUSIVE MODE',
    );
    const pendingCheck = guardMigration.indexOf('deduction_pending_classification_required');
    const trigger = guardMigration.indexOf('CREATE TRIGGER trg_guard_deduction_payment_writes');
    expect(lock).toBeGreaterThan(-1);
    expect(pendingCheck).toBeGreaterThan(lock);
    expect(trigger).toBeGreaterThan(pendingCheck);
    expect(guardMigration).toMatch(
      /source_type\s*=\s*'deduction'[\s\S]+status\s*=\s*'pending'/,
    );
    expect(guardMigration).toContain('deduction_pending_classification_required');
    expect(guardMigration).toContain('deduction_currency_classification_required');
    expect(guardMigration).toContain('deduction_ledger_classification_required');
    expect(verifier).toContain('unresolved deduction classification remains');
  });

  it('uses one-shot private capabilities instead of spoofable session state', () => {
    expect(payrollMigration).toContain(
      'CREATE TABLE IF NOT EXISTS public.pyra_deduction_write_capabilities',
    );
    expect(payrollMigration).toContain('transaction_id');
    expect(payrollMigration).toContain('operation');
    expect(payrollMigration).toContain('REVOKE ALL ON TABLE public.pyra_deduction_write_capabilities FROM service_role');
    expect(guardMigration).toMatch(/DELETE FROM public\.pyra_deduction_write_capabilities[\s\S]+RETURNING/);
    expect(payrollMigration).not.toContain('pyra.deduction_writer');
    expect(guardMigration).not.toContain('pyra.deduction_writer');
    expect(guardMigration).not.toContain('current_setting(');
    expect(guardMigration).not.toContain('set_config(');
  });

  it('locks down the trigger function and verifies the installed guard fail-closed', () => {
    expect(guardMigration).toMatch(
      /SECURITY DEFINER\s+SET search_path = ''\s+SET row_security = off/,
    );
    expect(guardMigration).toContain(
      'ALTER FUNCTION public.pyra_guard_deduction_payment_writes() OWNER TO postgres',
    );
    expect(guardMigration).toContain(
      'REVOKE ALL ON FUNCTION public.pyra_guard_deduction_payment_writes() FROM service_role',
    );
    expect(verifier).toContain('trg_guard_deduction_payment_writes');
    expect(verifier).toContain('pyra_deduction_write_capabilities');
    expect(verifier).toContain('service_role can execute deduction guard trigger function');
    expect(verifier).toContain('atomic RPC is missing deduction write capability issuance');
    expect(verifier).toContain("proc.proowner = pg_catalog.to_regrole('postgres')");
    expect(verifier).toContain('trigger.tgtype = 31');
    expect(verifier).toContain('trigger.tgnargs = 0');
    expect(verifier).toContain('trigger.tgqual IS NULL');
    expect(verifier).not.toContain('v_function_count');
    expect(smoke).toContain("set_config('pyra.deduction_writer', 'spoofed', true)");
    expect(smoke).toContain('spoofed session state bypassed deduction guard');
    expect(smoke).toContain('one-shot capability leaked after atomic RPC');
    expect(smoke).toContain('v_current_month');
    expect(smoke).not.toContain("DATE '1994-01-01'");
  });
});
