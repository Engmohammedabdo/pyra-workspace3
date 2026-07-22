import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/048_attendance_tracking_start.sql',
);
const verifierPath = resolve(
  process.cwd(),
  'scripts/sql/verify-048-attendance-tracking-start.sql',
);

const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const verifier = existsSync(verifierPath) ? readFileSync(verifierPath, 'utf8') : '';

describe('migration 048 attendance tracking provenance', () => {
  it('adds nullable tracking fields with an exact, restartable constraint', () => {
    expect(migration).toMatch(
      /ADD COLUMN IF NOT EXISTS attendance_tracking_started_on date/,
    );
    expect(migration).toMatch(
      /ADD COLUMN IF NOT EXISTS attendance_tracking_start_source text/,
    );
    expect(migration).toContain(
      'DROP CONSTRAINT IF EXISTS ck_users_attendance_tracking_provenance',
    );
    expect(migration).toContain(
      "attendance_tracking_start_source IN ('observed', 'admin')",
    );
    expect(migration).toMatch(
      /attendance_tracking_start_source = 'observed'[\s\S]+hire_date IS NOT NULL/,
    );
    expect(migration).toMatch(
      /attendance_tracking_started_on IS NULL[\s\S]+attendance_tracking_start_source IS NULL[\s\S]+OR[\s\S]+attendance_tracking_started_on IS NOT NULL/,
    );
  });

  it('releases the DDL lock before scanning or classifying user rows', () => {
    const firstCommit = migration.indexOf('\nCOMMIT;');
    const dataPreflight = migration.indexOf('DO $data_preflight$');
    expect(firstCommit).toBeGreaterThan(0);
    expect(dataPreflight).toBeGreaterThan(firstCommit);
    expect(migration.slice(0, firstCommit)).not.toContain(
      'FROM public.pyra_users AS employee',
    );
    expect(migration).not.toMatch(/^LOCK TABLE /m);
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(3);
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(3);
  });

  it('backfills only the earliest attendance with a current-employment boundary', () => {
    const backfillStart = migration.indexOf('WITH first_observed_attendance AS');
    const backfillEnd = migration.indexOf(
      'VALIDATE CONSTRAINT ck_users_attendance_tracking_provenance',
    );
    const backfill = migration.slice(backfillStart, backfillEnd);

    expect(backfillStart).toBeGreaterThan(0);
    expect(backfillEnd).toBeGreaterThan(backfillStart);
    expect(backfill).toContain(
      'pg_catalog.min(attendance.date) AS first_observed_on',
    );
    expect(backfill).toContain('FROM public.pyra_attendance AS attendance');
    expect(backfill).toContain('JOIN public.pyra_users AS employee');
    expect(backfill).toContain("employee.role = 'employee'");
    expect(backfill).toContain('employee.hire_date IS NOT NULL');
    expect(backfill).toContain('attendance.date >= employee.hire_date');
    expect(backfill).not.toContain('employee.hire_date IS NULL');
    expect(backfill).toContain("attendance_tracking_start_source = 'observed'");
    expect(migration).not.toMatch(
      /SET\s+attendance_tracking_started_on\s*=\s*(?:employee\.)?hire_date/,
    );
    expect(migration).not.toMatch(
      /SET\s+attendance_tracking_started_on\s*=\s*(?:employee\.)?created_at/,
    );
  });

  it('captures later inserts and never replaces an admin attestation', () => {
    const functionStart = migration.indexOf(
      'CREATE FUNCTION public.pyra_capture_attendance_tracking_start()',
    );
    const functionEnd = migration.indexOf('$function$;', functionStart);
    const functionBody = migration.slice(functionStart, functionEnd);

    expect(functionStart).toBeGreaterThan(0);
    expect(functionBody).toContain("employee.role = 'employee'");
    expect(functionBody).toContain('employee.hire_date IS NOT NULL');
    expect(functionBody).toContain('NEW.date >= employee.hire_date');
    expect(functionBody).toContain(
      "attendance_tracking_start_source IS DISTINCT FROM 'admin'",
    );
    expect(functionBody).toContain(
      'NEW.date < employee.attendance_tracking_started_on',
    );
    expect(migration).toMatch(/AFTER INSERT ON public\.pyra_attendance/);
    expect(migration).toContain('FOR EACH ROW');
  });

  it('normalizes ownership, settings, ACLs, and exact trigger metadata', () => {
    expect(migration).toMatch(
      /SECURITY DEFINER\s+SET search_path = ''\s+SET row_security = off/,
    );
    expect(migration).toContain(
      'ALTER FUNCTION public.pyra_capture_attendance_tracking_start() OWNER TO postgres',
    );
    for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
      expect(migration).toContain(
        `REVOKE ALL ON FUNCTION public.pyra_capture_attendance_tracking_start() FROM ${role}`,
      );
    }
    for (const sql of [migration, verifier]) {
      expect(sql).toContain('proc.proowner = pg_catalog.to_regrole(\'postgres\')');
      expect(sql).toContain('search_path=""');
      expect(sql).toContain('row_security=off');
      expect(sql).toContain('pg_catalog.cardinality(proc.proconfig) = 2');
      expect(sql).toContain('has_function_privilege');
      expect(sql).toContain('unsafe EXECUTE ACL');
      expect(sql).toContain('trigger_info.tgtype = 5');
      expect(sql).toContain('trigger_info.tgnargs = 0');
      expect(sql).toContain('trigger_info.tgqual IS NULL');
    }
    expect(verifier).not.toContain('v_function_count');
  });

  it('verifies exact server-rendered constraint and function bodies with RLS disabled', () => {
    for (const sql of [migration, verifier]) {
      expect(sql).toContain('CREATE TEMPORARY TABLE migration_048_');
      expect(sql).toContain('v_expected_constraint_definition');
      expect(sql).toContain(
        'v_constraint_definition IS DISTINCT FROM v_expected_constraint_definition',
      );
      expect(sql).toContain('v_expected_source text := $expected$');
      expect(sql).toContain('v_function_source');
      expect(sql).toContain('pg_catalog.regexp_replace');
    }
    expect(verifier).toMatch(/BEGIN;\s+SET LOCAL row_security = off;/);
    expect(verifier).toContain(
      'observed provenance disagrees with current-employment attendance history',
    );
    expect(verifier).toContain('qualifying attendance evidence was not backfilled');
    expect(verifier).toContain('COMMIT;');
  });

  it('is idempotent and keeps rollback hints inert', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS');
    expect(migration).toContain('DROP TRIGGER IF EXISTS');
    expect(migration).toContain('DROP FUNCTION IF EXISTS');
    expect(migration).toContain(
      'CREATE FUNCTION public.pyra_capture_attendance_tracking_start()',
    );
    expect(migration).toContain('-- -- DOWN');
    expect(migration).toContain('-- -- DROP TRIGGER IF EXISTS');
    expect(migration).toContain('-- -- DROP FUNCTION IF EXISTS');
    expect(migration).toContain('-- -- ALTER TABLE public.pyra_users');
  });
});
