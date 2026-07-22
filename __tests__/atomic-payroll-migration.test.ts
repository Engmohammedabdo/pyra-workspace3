import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/046_atomic_payroll_integrity.sql');
const verifierPath = resolve(process.cwd(), 'scripts/sql/verify-046-atomic-payroll-integrity.sql');
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const verifier = existsSync(verifierPath) ? readFileSync(verifierPath, 'utf8') : '';

const functions = [
  'pyra_commit_payroll_calculation',
  'pyra_approve_payroll_run',
  'pyra_pay_payroll_run',
  'pyra_pay_employee_payment',
  'pyra_approve_employee_payment',
  'pyra_delete_draft_payroll_run',
  'pyra_approve_employee_deduction',
  'pyra_approve_manual_deduction',
] as const;

describe('migration 046 atomic payroll integrity', () => {
  it('fails closed before adding one item per employee/run uniqueness', () => {
    expect(migration).toContain('BEGIN;');
    expect(migration).toMatch(/GROUP BY\s+payroll_id,\s*username[\s\S]+HAVING pg_catalog\.count\(\*\) > 1[\s\S]+RAISE EXCEPTION/);
    expect(migration).toMatch(/UNIQUE\s*\(payroll_id,\s*username\)/);
    expect(migration).toContain('COMMIT;');
  });

  it('normalizes legacy NULL payroll currency only after a locked duplicate preflight', () => {
    const runLock = migration.indexOf('LOCK TABLE public.pyra_payroll_runs IN EXCLUSIVE MODE');
    const paymentLock = migration.indexOf('LOCK TABLE public.pyra_employee_payments IN EXCLUSIVE MODE');
    const normalizedPreflight = migration.indexOf("GROUP BY year, month, COALESCE(currency, 'AED')");
    const normalization = migration.indexOf("SET currency = 'AED'");
    expect(runLock).toBeGreaterThan(-1);
    expect(paymentLock).toBeGreaterThan(runLock);
    expect(normalizedPreflight).toBeGreaterThan(paymentLock);
    expect(normalization).toBeGreaterThan(normalizedPreflight);
    expect(migration).toMatch(/ALTER COLUMN currency SET NOT NULL/);
    expect(verifier).toContain("column_name = 'currency'");
    expect(verifier).toContain("is_nullable = 'NO'");
  });

  it.each(functions)('defines service-role-only SECURITY DEFINER RPC %s', (name) => {
    expect(migration).toContain(`FUNCTION public.${name}`);
    expect(migration).toMatch(new RegExp(
      `${name}[\\s\\S]+SECURITY DEFINER[\\s\\S]+SET search_path = ''[\\s\\S]+SET row_security = off`,
    ));
    expect(migration).toContain(`ALTER FUNCTION public.${name}`);
    expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${name}`);
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${name}`);
  });

  it('pins every privileged RPC to postgres and verifies ownership without RLS filtering', () => {
    expect(verifier).toMatch(/BEGIN;\s+SET LOCAL row_security = off;/);
    expect(verifier).toContain("proc.proowner = pg_catalog.to_regrole('postgres')");
    expect(verifier).toContain("ARRAY['search_path=\"\"', 'row_security=off']::text[]");
    expect(verifier).toContain('pg_catalog.cardinality(proc.proconfig) = 2');
    expect(verifier).not.toContain('v_duplicate_count <> 1');
  });

  it('serializes run/payment writes and validates Dubai half-open month bounds', () => {
    expect(migration).toMatch(/FROM public\.pyra_payroll_runs[\s\S]+FOR UPDATE/);
    expect(migration).toMatch(/FROM public\.pyra_employee_payments[\s\S]+ORDER BY[\s\S]+FOR UPDATE/);
    expect(migration).toContain("AT TIME ZONE 'Asia/Dubai'");
    expect(migration).toMatch(/created_at\s*>=\s*v_period_start/);
    expect(migration).toMatch(/created_at\s*<\s*v_period_end/);
  });

  it('locks calculation employees before the run and payment ledger', () => {
    const calculation = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.pyra_commit_payroll_calculation'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.pyra_delete_draft_payroll_run'),
    );
    const userLock = calculation.indexOf('FROM public.pyra_users AS employee');
    const runLock = calculation.indexOf('FROM public.pyra_payroll_runs AS pr');
    const paymentLock = calculation.indexOf('FROM public.pyra_employee_payments AS ep');
    expect(userLock).toBeGreaterThan(-1);
    expect(calculation).toMatch(/ORDER BY employee\.username\s+FOR UPDATE/);
    expect(runLock).toBeGreaterThan(userLock);
    expect(paymentLock).toBeGreaterThan(runLock);
  });

  it('contains atomic guards for linked/direct deductions and idempotent paid retries', () => {
    expect(migration).toContain("v_payment.payroll_id IS NOT NULL");
    expect(migration).toContain("v_payment.source_type = 'deduction'");
    expect(migration).toContain("RETURN QUERY SELECT 'already_paid'::text");
    expect(migration).toContain("RETURN QUERY SELECT 'blocked_input'::text");
  });

  it('fails closed when a nullable legacy run or payment status is NULL', () => {
    expect(migration).toContain("v_run.status IS DISTINCT FROM 'draft'");
    expect(migration).toContain("v_run.status IS DISTINCT FROM 'calculated'");
    expect(migration).toContain("v_run.status IS DISTINCT FROM 'approved'");
    expect(migration).toContain("v_payment.status IS DISTINCT FROM 'pending'");
    expect(migration).toContain("v_payment.status IS DISTINCT FROM 'approved'");
    expect(migration).not.toMatch(/v_(?:run|payment)\.status\s*(?:<>|NOT IN)/);
  });

  it('requires explicit classification for deductions without effective_month', () => {
    expect(migration).toContain('deduction_effective_month_classification_required');
    expect(migration).toMatch(/source_type\s*=\s*'deduction'[\s\S]+effective_month IS NULL/);
    expect((migration.match(/source_type\s*<>\s*'deduction'/g) ?? []).length)
      .toBeGreaterThanOrEqual(4);
    expect(verifier).toContain('deduction payment still has NULL effective_month');
    expect(migration).toContain('deduction_pending_classification_required');
    expect(migration).toContain('deduction_currency_classification_required');
    expect(migration).toContain('deduction_ledger_classification_required');
    expect(migration).toMatch(/source_id IS NULL[\s\S]+description IS NULL[\s\S]+amount <= 0/);
  });

  it('serializes generic payment approval against payroll approval through the run lock', () => {
    const paymentApproval = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.pyra_approve_employee_payment'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.pyra_pay_employee_payment'),
    );
    const runApproval = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.pyra_approve_payroll_run'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.pyra_approve_employee_deduction'),
    );
    expect(paymentApproval).toMatch(/FROM public\.pyra_payroll_runs[\s\S]+FOR UPDATE/);
    expect(paymentApproval).toMatch(/FOR UPDATE[\s\S]+UPDATE public\.pyra_employee_payments/);
    expect(runApproval).toMatch(/FROM public\.pyra_employee_payments[\s\S]+FOR UPDATE/);
    expect(migration).toContain('payment_approval_closed_payroll_period');
  });

  it('blocks unapplied deduction excess and cross-currency employee inputs', () => {
    expect(migration).toContain('v_linked_deduction_amount');
    expect(migration).toMatch(/sum\(ep\.amount\)[\s\S]+item\.monetary_deductions/);
    expect(migration).toContain('payment currency conflicts with the employee payroll run');
    expect(migration).toMatch(/ep\.currency[\s\S]+IS DISTINCT FROM[\s\S]+v_run\.currency/);
  });

  it('ships a verifier covering constraints, functions, ACLs and rollback comments', () => {
    expect(verifier).toContain('uq_payroll_items_run_username');
    for (const name of functions) expect(verifier).toContain(name);
    expect(verifier).toContain('has_function_privilege');
    expect(migration).toContain('-- -- DOWN');
  });
});
