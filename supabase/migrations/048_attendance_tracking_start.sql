-- ────────────────────────────────────────────────────────────────────────────
-- Migration 048 — Attendance tracking start provenance
--
-- Phase:        Employee deductions follow-up
-- Author:       abdou
-- Date:         2026-07-22
-- Reversible:   NO (forward-only; rollback hints are informational)
-- Touches data: YES (backfills only employees with current-employment evidence)
-- Risk tier:    2
--
-- Purpose:
--   Store an explicit, nullable start date for attendance tracking without
--   inventing enrollment from hire date, current schedule, or rollout date.
--   A NULL hire_date cannot establish a current-employment boundary, so it is
--   left unverified until an admin documents the start explicitly.
--
-- Availability:
--   The migration uses three short, restartable transactions. The users-table
--   ACCESS EXCLUSIVE lock is limited to additive/constraint DDL; existing-row
--   classification and historical backfill happen only after that lock is
--   released. Concurrent inserts and the backfill both move observed provenance
--   only toward the true MIN.
-- ────────────────────────────────────────────────────────────────────────────

-- 1/3: additive columns and the exact paired-provenance constraint.
BEGIN;
SET LOCAL lock_timeout = '10s';

DO $preflight$
BEGIN
  IF pg_catalog.to_regclass('public.pyra_users') IS NULL THEN
    RAISE EXCEPTION 'Migration 048 preflight: pyra_users is missing';
  END IF;
  IF pg_catalog.to_regclass('public.pyra_attendance') IS NULL THEN
    RAISE EXCEPTION 'Migration 048 preflight: pyra_attendance is missing';
  END IF;
  IF pg_catalog.to_regrole('postgres') IS NULL THEN
    RAISE EXCEPTION 'Migration 048 preflight: postgres owner role is missing';
  END IF;
END;
$preflight$;

ALTER TABLE public.pyra_users
  ADD COLUMN IF NOT EXISTS attendance_tracking_started_on date;

ALTER TABLE public.pyra_users
  ADD COLUMN IF NOT EXISTS attendance_tracking_start_source text;

COMMENT ON COLUMN public.pyra_users.attendance_tracking_started_on IS
  'Evidence-backed attendance-tracking start. NULL means unverified; never infer from hire date, schedule assignment, or rollout date.';
COMMENT ON COLUMN public.pyra_users.attendance_tracking_start_source IS
  'Provenance for attendance_tracking_started_on: observed (current-employment attendance evidence) or admin (explicit attestation).';

DO $shape_preflight$
DECLARE
  v_started_type text;
  v_started_nullable text;
  v_started_default text;
  v_source_type text;
  v_source_nullable text;
  v_source_default text;
BEGIN
  SELECT column_info.data_type, column_info.is_nullable, column_info.column_default
  INTO v_started_type, v_started_nullable, v_started_default
  FROM information_schema.columns AS column_info
  WHERE column_info.table_schema = 'public'
    AND column_info.table_name = 'pyra_users'
    AND column_info.column_name = 'attendance_tracking_started_on';

  SELECT column_info.data_type, column_info.is_nullable, column_info.column_default
  INTO v_source_type, v_source_nullable, v_source_default
  FROM information_schema.columns AS column_info
  WHERE column_info.table_schema = 'public'
    AND column_info.table_name = 'pyra_users'
    AND column_info.column_name = 'attendance_tracking_start_source';

  IF v_started_type IS DISTINCT FROM 'date'
     OR v_started_nullable IS DISTINCT FROM 'YES'
     OR v_started_default IS NOT NULL
     OR v_source_type IS DISTINCT FROM 'text'
     OR v_source_nullable IS DISTINCT FROM 'YES'
     OR v_source_default IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 048 preflight: attendance tracking columns have an unexpected shape';
  END IF;

END;
$shape_preflight$;

-- Recreate by name on every run so a same-named malformed constraint can never
-- be accepted as proof of the intended invariant.
ALTER TABLE public.pyra_users
  DROP CONSTRAINT IF EXISTS ck_users_attendance_tracking_provenance;

ALTER TABLE public.pyra_users
  ADD CONSTRAINT ck_users_attendance_tracking_provenance
  CHECK (
    (
      attendance_tracking_started_on IS NULL
      AND attendance_tracking_start_source IS NULL
    )
    OR (
      attendance_tracking_started_on IS NOT NULL
      AND attendance_tracking_start_source IN ('observed', 'admin')
      AND (
        attendance_tracking_start_source = 'admin'
        OR (
          attendance_tracking_start_source = 'observed'
          AND hire_date IS NOT NULL
        )
      )
      AND (
        hire_date IS NULL
        OR attendance_tracking_started_on >= hire_date
      )
    )
  ) NOT VALID;

COMMENT ON CONSTRAINT ck_users_attendance_tracking_provenance
  ON public.pyra_users IS
  'Migration 048 exact pair: NULL/NULL or evidence date plus observed/admin source, never before a documented hire date.';

COMMIT;

-- 2/3: install and publish the row trigger before historical backfill.
BEGIN;
SET LOCAL lock_timeout = '10s';

DROP TRIGGER IF EXISTS trg_capture_attendance_tracking_start
  ON public.pyra_attendance;
DROP FUNCTION IF EXISTS public.pyra_capture_attendance_tracking_start();

CREATE FUNCTION public.pyra_capture_attendance_tracking_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
BEGIN
  UPDATE public.pyra_users AS employee
  SET attendance_tracking_started_on = NEW.date,
      attendance_tracking_start_source = 'observed'
  WHERE employee.username = NEW.username
    AND employee.role = 'employee'
    AND employee.hire_date IS NOT NULL
    AND NEW.date >= employee.hire_date
    AND employee.attendance_tracking_start_source IS DISTINCT FROM 'admin'
    AND (
      employee.attendance_tracking_start_source IS NULL
      OR employee.attendance_tracking_start_source = 'observed'
    )
    AND (
      employee.attendance_tracking_started_on IS NULL
      OR NEW.date < employee.attendance_tracking_started_on
    );

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.pyra_capture_attendance_tracking_start() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.pyra_capture_attendance_tracking_start() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pyra_capture_attendance_tracking_start() FROM anon;
REVOKE ALL ON FUNCTION public.pyra_capture_attendance_tracking_start() FROM authenticated;
REVOKE ALL ON FUNCTION public.pyra_capture_attendance_tracking_start() FROM service_role;

CREATE TRIGGER trg_capture_attendance_tracking_start
AFTER INSERT ON public.pyra_attendance
FOR EACH ROW
EXECUTE FUNCTION public.pyra_capture_attendance_tracking_start();

COMMIT;

-- 3/3: unlocked, race-safe backfill and fail-closed verification.
BEGIN;
SET LOCAL row_security = off;
SET LOCAL lock_timeout = '10s';

-- Run the existing-row classification only after the short DDL transaction
-- has released its ACCESS EXCLUSIVE lock. Fail closed instead of converting a
-- partially populated or otherwise unattributed pair into observed evidence.
DO $data_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.pyra_users AS employee
    WHERE (employee.attendance_tracking_started_on IS NULL)
          IS DISTINCT FROM (employee.attendance_tracking_start_source IS NULL)
       OR employee.attendance_tracking_start_source NOT IN ('observed', 'admin')
       OR (
         employee.attendance_tracking_start_source = 'observed'
         AND employee.hire_date IS NULL
       )
       OR (
         employee.hire_date IS NOT NULL
         AND employee.attendance_tracking_started_on < employee.hire_date
       )
  ) THEN
    RAISE EXCEPTION 'attendance_tracking_provenance_classification_required';
  END IF;
END;
$data_preflight$;

WITH first_observed_attendance AS (
  SELECT
    attendance.username,
    pg_catalog.min(attendance.date) AS first_observed_on
  FROM public.pyra_attendance AS attendance
  JOIN public.pyra_users AS employee
    ON employee.username = attendance.username
  WHERE employee.role = 'employee'
    AND employee.hire_date IS NOT NULL
    AND attendance.date >= employee.hire_date
  GROUP BY attendance.username
)
UPDATE public.pyra_users AS employee
SET attendance_tracking_started_on = observed.first_observed_on,
    attendance_tracking_start_source = 'observed'
FROM first_observed_attendance AS observed
WHERE employee.username = observed.username
  AND employee.attendance_tracking_start_source IS DISTINCT FROM 'admin'
  AND (
    employee.attendance_tracking_start_source IS NULL
    OR employee.attendance_tracking_start_source = 'observed'
  )
  AND (
    employee.attendance_tracking_started_on IS NULL
    OR observed.first_observed_on < employee.attendance_tracking_started_on
  );

ALTER TABLE public.pyra_users
  VALIDATE CONSTRAINT ck_users_attendance_tracking_provenance;

-- Derive the expected CHECK rendering from this PostgreSQL server instead of
-- relying on version-sensitive pg_get_constraintdef formatting or token tests.
CREATE TEMPORARY TABLE migration_048_expected_users_shape (
  hire_date date,
  attendance_tracking_started_on date,
  attendance_tracking_start_source text,
  CONSTRAINT ck_migration_048_expected_provenance
  CHECK (
    (
      attendance_tracking_started_on IS NULL
      AND attendance_tracking_start_source IS NULL
    )
    OR (
      attendance_tracking_started_on IS NOT NULL
      AND attendance_tracking_start_source IN ('observed', 'admin')
      AND (
        attendance_tracking_start_source = 'admin'
        OR (
          attendance_tracking_start_source = 'observed'
          AND hire_date IS NOT NULL
        )
      )
      AND (
        hire_date IS NULL
        OR attendance_tracking_started_on >= hire_date
      )
    )
  )
) ON COMMIT DROP;

DO $postflight$
DECLARE
  v_constraint_definition text;
  v_expected_constraint_definition text;
  v_function_oid pg_catalog.oid;
  v_function_source text;
  v_expected_source text := $expected$
BEGIN
  UPDATE public.pyra_users AS employee
  SET attendance_tracking_started_on = NEW.date,
      attendance_tracking_start_source = 'observed'
  WHERE employee.username = NEW.username
    AND employee.role = 'employee'
    AND employee.hire_date IS NOT NULL
    AND NEW.date >= employee.hire_date
    AND employee.attendance_tracking_start_source IS DISTINCT FROM 'admin'
    AND (
      employee.attendance_tracking_start_source IS NULL
      OR employee.attendance_tracking_start_source = 'observed'
    )
    AND (
      employee.attendance_tracking_started_on IS NULL
      OR NEW.date < employee.attendance_tracking_started_on
    );

  RETURN NEW;
END;
$expected$;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_info.oid)
  INTO v_constraint_definition
  FROM pg_catalog.pg_constraint AS constraint_info
  WHERE constraint_info.conrelid = 'public.pyra_users'::pg_catalog.regclass
    AND constraint_info.conname = 'ck_users_attendance_tracking_provenance'
    AND constraint_info.contype = 'c'
    AND constraint_info.convalidated;

  SELECT pg_catalog.pg_get_constraintdef(constraint_info.oid)
  INTO v_expected_constraint_definition
  FROM pg_catalog.pg_constraint AS constraint_info
  WHERE constraint_info.conrelid =
      'pg_temp.migration_048_expected_users_shape'::pg_catalog.regclass
    AND constraint_info.conname = 'ck_migration_048_expected_provenance'
    AND constraint_info.contype = 'c';

  IF v_constraint_definition IS NULL
     OR v_expected_constraint_definition IS NULL
     OR v_constraint_definition IS DISTINCT FROM v_expected_constraint_definition THEN
    RAISE EXCEPTION 'Migration 048 postflight: exact provenance constraint is missing or unvalidated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_users AS employee
    WHERE (employee.attendance_tracking_started_on IS NULL)
          IS DISTINCT FROM (employee.attendance_tracking_start_source IS NULL)
       OR employee.attendance_tracking_start_source NOT IN ('observed', 'admin')
       OR (
         employee.attendance_tracking_start_source = 'observed'
         AND employee.hire_date IS NULL
       )
       OR (
         employee.hire_date IS NOT NULL
         AND employee.attendance_tracking_started_on < employee.hire_date
       )
  ) THEN
    RAISE EXCEPTION 'Migration 048 postflight: invalid attendance tracking provenance pair';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_users AS employee
    LEFT JOIN LATERAL (
      SELECT pg_catalog.min(attendance.date) AS first_observed_on
      FROM public.pyra_attendance AS attendance
      WHERE attendance.username = employee.username
        AND employee.hire_date IS NOT NULL
        AND attendance.date >= employee.hire_date
    ) AS observed ON true
    WHERE employee.attendance_tracking_start_source = 'observed'
      AND (
        employee.hire_date IS NULL
        OR employee.attendance_tracking_started_on
           IS DISTINCT FROM observed.first_observed_on
      )
  ) THEN
    RAISE EXCEPTION 'Migration 048 postflight: observed provenance disagrees with current-employment attendance history';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_users AS employee
    WHERE employee.role = 'employee'
      AND employee.hire_date IS NOT NULL
      AND employee.attendance_tracking_started_on IS NULL
      AND employee.attendance_tracking_start_source IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.pyra_attendance AS attendance
        WHERE attendance.username = employee.username
          AND attendance.date >= employee.hire_date
      )
  ) THEN
    RAISE EXCEPTION 'Migration 048 postflight: qualifying attendance evidence was not backfilled';
  END IF;

  SELECT proc.oid, proc.prosrc
  INTO v_function_oid, v_function_source
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid = pg_catalog.to_regprocedure(
      'public.pyra_capture_attendance_tracking_start()'
    )
    AND proc.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
    AND proc.prosecdef
    AND proc.proowner = pg_catalog.to_regrole('postgres')
    AND proc.proconfig @> ARRAY['search_path=""', 'row_security=off']::text[]
    AND pg_catalog.cardinality(proc.proconfig) = 2;

  IF v_function_oid IS NULL
     OR pg_catalog.regexp_replace(
          pg_catalog.btrim(v_function_source), '[[:space:]]+', ' ', 'g'
        ) IS DISTINCT FROM pg_catalog.regexp_replace(
          pg_catalog.btrim(v_expected_source), '[[:space:]]+', ' ', 'g'
        ) THEN
    RAISE EXCEPTION 'Migration 048 postflight: tracking trigger function is missing, drifted, or insecure';
  END IF;

  IF pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE')
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS proc,
            LATERAL pg_catalog.aclexplode(
              COALESCE(proc.proacl, pg_catalog.acldefault('f', proc.proowner))
            ) AS acl
       WHERE proc.oid = v_function_oid
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Migration 048 postflight: tracking trigger function has unsafe EXECUTE ACL';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_info
    WHERE trigger_info.tgrelid = 'public.pyra_attendance'::pg_catalog.regclass
      AND trigger_info.tgname = 'trg_capture_attendance_tracking_start'
      AND NOT trigger_info.tgisinternal
      AND trigger_info.tgenabled = 'O'
      AND trigger_info.tgfoid = v_function_oid
      AND trigger_info.tgtype = 5
      AND trigger_info.tgnargs = 0
      AND trigger_info.tgqual IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration 048 postflight: exact AFTER INSERT FOR EACH ROW trigger is missing';
  END IF;
END;
$postflight$;

COMMIT;

-- -- DOWN (informational only; never auto-run):
-- -- DROP TRIGGER IF EXISTS trg_capture_attendance_tracking_start ON public.pyra_attendance;
-- -- DROP FUNCTION IF EXISTS public.pyra_capture_attendance_tracking_start();
-- -- ALTER TABLE public.pyra_users DROP CONSTRAINT IF EXISTS ck_users_attendance_tracking_provenance;
-- -- ALTER TABLE public.pyra_users DROP COLUMN IF EXISTS attendance_tracking_start_source;
-- -- ALTER TABLE public.pyra_users DROP COLUMN IF EXISTS attendance_tracking_started_on;
