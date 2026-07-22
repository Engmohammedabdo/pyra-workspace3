import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/046_atomic_payroll_integrity.sql');
const verifierPath = resolve(process.cwd(), 'scripts/sql/verify-046-atomic-payroll-integrity.sql');
const manualRoutePath = resolve(process.cwd(), 'app/api/hr/deductions/manual/route.ts');
const paymentsRoutePath = resolve(process.cwd(), 'app/api/dashboard/employee-payments/route.ts');
const payrollCalculateRoutePath = resolve(
  process.cwd(),
  'app/api/dashboard/payroll/[id]/calculate/route.ts',
);
const dialogPath = resolve(process.cwd(), 'components/payroll/AddPaymentDialog.tsx');
const activityPath = resolve(process.cwd(), 'lib/api/activity.ts');
const smokePath = resolve(process.cwd(), '.superpowers/sdd/task-payroll-046-rollback-smoke.sql');

const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const verifier = existsSync(verifierPath) ? readFileSync(verifierPath, 'utf8') : '';
const manualRoute = existsSync(manualRoutePath) ? readFileSync(manualRoutePath, 'utf8') : '';
const paymentsRoute = existsSync(paymentsRoutePath) ? readFileSync(paymentsRoutePath, 'utf8') : '';
const payrollCalculateRoute = existsSync(payrollCalculateRoutePath)
  ? readFileSync(payrollCalculateRoutePath, 'utf8')
  : '';
const dialog = existsSync(dialogPath) ? readFileSync(dialogPath, 'utf8') : '';
const activity = existsSync(activityPath) ? readFileSync(activityPath, 'utf8') : '';
const smoke = existsSync(smokePath) ? readFileSync(smokePath, 'utf8') : '';
const computedApproval = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.pyra_approve_employee_deduction'),
  migration.indexOf('CREATE OR REPLACE FUNCTION public.pyra_approve_manual_deduction'),
);
const manualApproval = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.pyra_approve_manual_deduction'),
);

describe('atomic aggregate disciplinary-deduction cap', () => {
  it('stores the attendance portion explicitly as cap-exempt payroll money', () => {
    expect(migration).toContain(
      'ADD COLUMN IF NOT EXISTS deduction_cap_exempt_amount numeric(12,2)',
    );
    expect(migration).toContain('ck_employee_payments_deduction_cap_exempt');
    expect(migration).toContain('deduction_cap_exempt_amount <= amount');
    expect(migration).toContain("source_type = 'deduction'");
    expect(verifier).toContain('deduction_cap_exempt_amount');
    expect(verifier).toContain('ck_employee_payments_deduction_cap_exempt');
  });

  it('stores immutable documented manual deductions with stable source identity', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.pyra_manual_deductions');
    expect(migration).toMatch(/reason\s+text NOT NULL/);
    expect(migration).toMatch(/evidence\s+jsonb NOT NULL/);
    expect(migration).toMatch(/basis\s+varchar\(50\) NOT NULL/);
    expect(migration).toMatch(/payment_id\s+varchar\(20\) NOT NULL/);
    expect(migration).toContain('source_id');
    expect(migration).toContain('effective_month');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.pyra_manual_deduction_tasks');
    expect(migration).toContain('CONSTRAINT uq_manual_deduction_task UNIQUE (task_id)');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_manual_quality_employee_month');
  });

  it('approves a manual deduction in one idempotent service-role-only RPC', () => {
    expect(migration).toContain('FUNCTION public.pyra_approve_manual_deduction');
    expect(migration).toMatch(/pyra_approve_manual_deduction[\s\S]+SECURITY DEFINER[\s\S]+SET search_path = ''/);
    expect(migration).toContain("RETURN QUERY SELECT 'already_approved'::text");
    expect(migration).toContain("RETURN QUERY SELECT 'idempotency_conflict'::text");
    expect(migration).toContain("RETURN QUERY SELECT 'duplicate_cause'::text");
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.pyra_approve_manual_deduction');
  });

  it('serializes computed and manual approvals on the same monthly disciplinary cap key', () => {
    const capLockMatches = migration.match(/payroll_deduction_cap:/g) ?? [];
    expect(capLockMatches.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toMatch(/status IN \('approved', 'paid'\)/);
    expect(migration).toContain("effective_month IS NULL");
    expect(migration).toContain("'ambiguous_period'::text");
    expect(migration).toContain("'cap_exhausted'::text");
    expect(migration).toContain("'currency_conflict'::text");
    expect(migration).toContain("v_user.role IS DISTINCT FROM 'employee'");
    expect(migration).toContain("AT TIME ZONE 'Asia/Dubai'");
    expect(computedApproval).toContain('deduction_future_period');
    expect(computedApproval).toContain('deduction_current_period');
    expect(computedApproval).toMatch(/p_period_month\s*=\s*v_current_month/);
    expect(computedApproval).toContain('deduction_currency_conflict');
    expect(computedApproval).toContain("v_user.role IS DISTINCT FROM 'employee'");
    expect(manualApproval).toContain("'current_month_only'::text");
    expect(manualApproval).toMatch(/p_period_month\s+IS DISTINCT FROM\s+v_current_month/);
    expect(manualApproval).not.toContain('deduction_current_period');
    expect(manualApproval).toContain("'currency_conflict'::text");
    expect(manualApproval).toContain("v_user.role IS DISTINCT FROM 'employee'");
    expect(computedApproval).toContain(
      "COALESCE(payroll.currency, 'AED') = COALESCE(p_salary_currency, 'AED')",
    );
    expect(manualApproval).toContain(
      "COALESCE(payroll.currency, 'AED') = COALESCE(p_salary_currency, 'AED')",
    );
  });

  it('keeps attendance outside the cap and subtracts only prior disciplinary money', () => {
    expect((migration.match(/CREATE OR REPLACE FUNCTION public\.pyra_approve_employee_deduction/g) ?? []).length)
      .toBeGreaterThanOrEqual(1);
    expect(migration).toContain('v_prior_approved_amount');
    expect(migration).toContain('v_remaining_cap_amount');
    expect(computedApproval).toMatch(
      /v_cap_subject_requested_amount\s*:=\s*pg_catalog\.round\(\s*v_delivery_amount \+ v_quality_amount/,
    );
    expect(computedApproval).toMatch(
      /v_approved_amount\s*:=\s*pg_catalog\.round\(\s*v_attendance_amount\s*\+\s*LEAST\(v_cap_subject_requested_amount, v_remaining_cap_amount\)/,
    );
    expect(computedApproval).toContain(
      'payment.amount - payment.deduction_cap_exempt_amount',
    );
    expect(computedApproval).toMatch(
      /deduction_cap_exempt_amount[\s\S]+v_attendance_amount/,
    );
    expect(manualApproval).toContain(
      'payment.amount - payment.deduction_cap_exempt_amount',
    );
    expect(manualApproval).toMatch(
      /deduction_cap_exempt_amount[\s\S]+0/,
    );
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS ck_deduction_cases_approved_formula');
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS ck_deduction_cases_approved_cap');
    expect(migration).toContain('ck_deduction_cases_approved_cap_subject');
  });

  it('revalidates the linked payment after the concurrent idempotency recheck', () => {
    const integrityChecks = computedApproval.match(/deduction_case_integrity_conflict/g) ?? [];
    expect(integrityChecks).toHaveLength(2);
  });

  it('validates payroll totals against full attendance plus capped disciplinary ledger', () => {
    expect(migration).not.toMatch(
      /item\.monetary_deductions\s*\)\s*>\s*pg_catalog\.round\(\s*item\.salary_snapshot/,
    );
    expect(migration).toContain(
      'ep.amount - ep.deduction_cap_exempt_amount',
    );
    expect(migration).toContain('v_linked_cap_subject_amount');
    expect(payrollCalculateRoute).toContain('deduction_cap_exempt_amount');
    expect(payrollCalculateRoute).toMatch(
      /paymentsByUser\[p\.username\]\.push\([\s\S]+deduction_cap_exempt_amount/,
    );
  });

  it('keeps quality money exclusively in the documented manual workflow', () => {
    expect(computedApproval).toContain('v_quality_amount IS DISTINCT FROM 0');
    expect(migration).toContain('ck_deduction_cases_quality_manual_only');
    expect(migration).toContain('deduction_quality_case_classification_required');
    expect(manualApproval).toContain("'quality_timing_unconfirmed'::text");
    expect(manualRoute).toContain('QUALITY_DEDUCTION_APPROVAL_ENABLED');
    expect(manualRoute).toContain('PAYROLL_RPC_STATUS.QUALITY_TIMING_UNCONFIRMED');
  });

  it('fails closed when a manual request no longer fits the remaining cap', () => {
    expect(manualApproval).toMatch(/v_requested_amount\s*>\s*v_remaining_cap_amount/);
    expect(manualApproval).toContain("'cap_changed'::text");
    expect(manualApproval).not.toMatch(
      /v_approved_amount\s*:=\s*LEAST\(v_requested_amount, v_remaining_cap_amount\)/,
    );
    expect(manualRoute).toContain('PAYROLL_RPC_STATUS.CAP_CHANGED');
    expect(manualRoute).toContain("t('payroll.manualDeduction.capChanged')");
  });

  it('routes manual deductions through the dedicated HR approval API', () => {
    expect(manualRoute).toContain("requireApiPermission('hr.manage')");
    expect(manualRoute).toContain(".rpc('pyra_approve_manual_deduction'");
    expect(manualRoute).toContain('MONTHLY_DEDUCTION_CAP_PERCENT');
    expect(manualRoute).toContain('idempotency_key');
    expect(manualRoute).toContain('buildManualDeductionEvidence');
    expect(manualRoute).toContain('hasClientEvidence');
    expect(manualRoute).toContain('p_evidence: trustedEvidence.evidence');
    expect(manualRoute).toContain('p_basis: basis');
    expect(manualRoute).toContain('reason');
    expect(manualRoute).toContain('loadMonthlyDeductionsReport');
    expect(manualRoute).not.toContain("select('username, role, status, salary, salary_currency')");
    expect(manualRoute).toContain('PAYROLL_RPC_STATUS.CURRENT_MONTH_ONLY');
    expect(manualRoute).toContain('PAYROLL_RPC_STATUS.CURRENCY_CONFLICT');
    expect(activity).toContain("DEDUCTION: 'deduction'");
    expect(manualRoute).toContain('`${ENTITY_TYPES.DEDUCTION}_${ACTIVITY_ACTIONS.APPROVE}`');
  });

  it('enforces the current Dubai month in both manual API and RPC', () => {
    expect(manualRoute).toContain('dubaiDayKey(requestInstant)');
    expect(manualRoute).toContain('PAYROLL_RPC_STATUS.CURRENT_MONTH_ONLY');
    expect(manualRoute).toContain("t('payroll.manualDeduction.currentMonthOnly')");
    expect(manualApproval).toContain("AT TIME ZONE 'Asia/Dubai'");
    expect(manualApproval).toContain("'current_month_only'::text");
    expect(smoke).toContain('v_current_month');
    expect(smoke).not.toContain("DATE '1995-10-01'");
  });

  it('closes the legacy generic deduction bypass', () => {
    expect(paymentsRoute).toMatch(/source_type\s*===\s*EMPLOYEE_PAYMENT_SOURCE_TYPE\.DEDUCTION/);
    expect(dialog).not.toMatch(/CREATABLE_SOURCE_TYPES\s*=\s*\[[\s\S]*?'deduction'/);
  });

  it('verifies manual table/RPC ACLs and aggregate-cap hardening', () => {
    expect(verifier).toContain('pyra_manual_deductions');
    expect(verifier).toContain('pyra_approve_manual_deduction');
    expect(verifier).toContain('append-only');
    expect(verifier).toContain('ck_deduction_cases_approved_formula');
    expect(verifier).toContain('manual deduction RPC is not current-month-only');
    expect(verifier).not.toContain(
      "has_table_privilege('service_role', 'public.pyra_payroll_runs', 'SELECT,INSERT,UPDATE,DELETE')",
    );
  });
});
