-- Persistent-data read-only, fail-closed postflight for migration 048.
-- A transaction-local temp table derives the server's exact CHECK rendering;
-- no business row is inserted, updated, or deleted.

BEGIN;
SET LOCAL row_security = off;

CREATE TEMPORARY TABLE migration_048_verify_expected_users_shape (
  hire_date date,
  attendance_tracking_started_on date,
  attendance_tracking_start_source text,
  CONSTRAINT ck_migration_048_verify_expected_provenance
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

DO $verify$
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
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = 'pyra_users'
      AND column_info.column_name = 'attendance_tracking_started_on'
      AND column_info.data_type = 'date'
      AND column_info.is_nullable = 'YES'
      AND column_info.column_default IS NULL
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = 'pyra_users'
      AND column_info.column_name = 'attendance_tracking_start_source'
      AND column_info.data_type = 'text'
      AND column_info.is_nullable = 'YES'
      AND column_info.column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration 048 postflight: attendance tracking columns are missing or malformed';
  END IF;

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
      'pg_temp.migration_048_verify_expected_users_shape'::pg_catalog.regclass
    AND constraint_info.conname = 'ck_migration_048_verify_expected_provenance'
    AND constraint_info.contype = 'c';

  IF v_constraint_definition IS NULL
     OR v_expected_constraint_definition IS NULL
     OR v_constraint_definition IS DISTINCT FROM v_expected_constraint_definition THEN
    RAISE EXCEPTION 'Migration 048 postflight: exact provenance constraint is missing, unvalidated, or drifted';
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
$verify$;

SELECT pg_catalog.jsonb_build_object(
  'status', 'ok',
  'observed', (
    SELECT pg_catalog.count(*)
    FROM public.pyra_users AS employee
    WHERE employee.attendance_tracking_start_source = 'observed'
  ),
  'admin', (
    SELECT pg_catalog.count(*)
    FROM public.pyra_users AS employee
    WHERE employee.attendance_tracking_start_source = 'admin'
  ),
  'unverified', (
    SELECT pg_catalog.count(*)
    FROM public.pyra_users AS employee
    WHERE employee.attendance_tracking_started_on IS NULL
      AND employee.attendance_tracking_start_source IS NULL
  ),
  'trigger', 'trg_capture_attendance_tracking_start'
) AS migration_048_postflight;

COMMIT;
