-- Read-only, fail-closed postflight for POST-DEPLOY migration 047.

BEGIN;
SET LOCAL row_security = off;

DO $verify$
DECLARE
  v_guard_oid pg_catalog.oid;
  v_function_signature text;
  v_function_oid pg_catalog.oid;
  v_function_source text;
BEGIN
  IF pg_catalog.to_regclass('public.pyra_deduction_write_capabilities') IS NULL THEN
    RAISE EXCEPTION 'Migration 047 postflight: deduction capability table is missing';
  END IF;

  IF pg_catalog.has_table_privilege(
       'service_role',
       'public.pyra_deduction_write_capabilities',
       'INSERT'
     )
     OR pg_catalog.has_table_privilege(
       'service_role',
       'public.pyra_deduction_write_capabilities',
       'UPDATE'
     )
     OR pg_catalog.has_table_privilege(
       'service_role',
       'public.pyra_deduction_write_capabilities',
       'DELETE'
     )
     OR pg_catalog.has_table_privilege(
       'anon',
       'public.pyra_deduction_write_capabilities',
       'INSERT'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'public.pyra_deduction_write_capabilities',
       'INSERT'
     ) THEN
    RAISE EXCEPTION 'Migration 047 postflight: deduction capability table has unsafe DML ACLs';
  END IF;

  IF EXISTS (SELECT 1 FROM public.pyra_deduction_write_capabilities) THEN
    RAISE EXCEPTION 'Migration 047 postflight: stale deduction write capabilities remain';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pyra_employee_payments'
      AND column_name = 'deduction_cap_exempt_amount'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'Migration 047 postflight: attendance cap exemption column is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments
    WHERE source_type = 'deduction'
      AND (
        effective_month IS NULL
        OR status = 'pending'
        OR (status IS DISTINCT FROM 'approved' AND status IS DISTINCT FROM 'paid')
        OR source_id IS NULL
        OR pg_catalog.btrim(source_id) = ''
        OR description IS NULL
        OR pg_catalog.btrim(description) = ''
        OR amount <= 0
        OR effective_month IS DISTINCT FROM
          pg_catalog.date_trunc('month', effective_month::timestamp)::date
        OR currency IS NULL
        OR pg_catalog.char_length(pg_catalog.btrim(currency)) <> 3
      )
  ) THEN
    RAISE EXCEPTION 'Migration 047 postflight: unresolved deduction classification remains';
  END IF;

  SELECT proc.oid
  INTO v_guard_oid
  FROM pg_catalog.pg_proc AS proc
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = proc.pronamespace
  WHERE namespace.nspname = 'public'
    AND proc.proname = 'pyra_guard_deduction_payment_writes'
    AND proc.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
    AND proc.prosecdef
    AND proc.proowner = pg_catalog.to_regrole('postgres')
    AND proc.proconfig = ARRAY['search_path=""', 'row_security=off']::text[]
    AND pg_catalog.cardinality(proc.proconfig) = 2
    AND pg_catalog.strpos(proc.prosrc, 'pyra_deduction_write_capabilities') > 0
    AND pg_catalog.strpos(proc.prosrc, 'pg_current_xact_id') > 0
    AND pg_catalog.strpos(proc.prosrc, 'DELETE FROM') > 0
    AND pg_catalog.strpos(proc.prosrc, 'deduction_payment_write_requires_atomic_rpc') > 0;

  IF v_guard_oid IS NULL THEN
    RAISE EXCEPTION 'Migration 047 postflight: deduction write guard function is missing or insecure';
  END IF;

  IF pg_catalog.has_function_privilege('service_role', v_guard_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Migration 047 postflight: service_role can execute deduction guard trigger function';
  END IF;

  IF pg_catalog.has_function_privilege('anon', v_guard_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_guard_oid, 'EXECUTE')
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS proc,
            LATERAL pg_catalog.aclexplode(
              COALESCE(proc.proacl, pg_catalog.acldefault('f', proc.proowner))
            ) AS acl
       WHERE proc.oid = v_guard_oid
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Migration 047 postflight: deduction write guard function has an unsafe ACL';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger
    WHERE trigger.tgrelid = 'public.pyra_employee_payments'::pg_catalog.regclass
      AND trigger.tgname = 'trg_guard_deduction_payment_writes'
      AND NOT trigger.tgisinternal
      AND trigger.tgenabled = 'O'
      AND trigger.tgfoid = v_guard_oid
      AND trigger.tgtype = 31
      AND trigger.tgnargs = 0
      AND trigger.tgqual IS NULL
      AND pg_catalog.strpos(
        pg_catalog.pg_get_triggerdef(trigger.oid),
        'BEFORE INSERT OR DELETE OR UPDATE'
      ) > 0
  ) THEN
    RAISE EXCEPTION 'Migration 047 postflight: deduction write guard trigger is missing or disabled';
  END IF;

  FOREACH v_function_signature IN ARRAY ARRAY[
    'pyra_commit_payroll_calculation(varchar,timestamptz,jsonb,varchar[],numeric)',
    'pyra_delete_draft_payroll_run(varchar)',
    'pyra_pay_payroll_run(varchar,text)',
    'pyra_approve_employee_deduction(varchar,varchar,varchar,date,numeric,varchar,numeric,numeric,numeric,varchar,numeric,numeric,numeric,numeric,boolean,integer,boolean,numeric,numeric,jsonb,jsonb,text,text,varchar)',
    'pyra_approve_manual_deduction(varchar,varchar,varchar,date,numeric,varchar,numeric,numeric,varchar,text,jsonb,varchar)'
  ]
  LOOP
    v_function_oid := pg_catalog.to_regprocedure('public.' || v_function_signature);

    SELECT proc.prosrc
    INTO v_function_source
    FROM pg_catalog.pg_proc AS proc
    WHERE proc.oid = v_function_oid
      AND proc.prosecdef
      AND proc.proowner = pg_catalog.to_regrole('postgres')
      AND proc.proconfig = ARRAY['search_path=""', 'row_security=off']::text[]
      AND pg_catalog.cardinality(proc.proconfig) = 2;

    IF v_function_oid IS NULL
       OR v_function_source IS NULL
       OR pg_catalog.strpos(
         v_function_source,
         'pyra_deduction_write_capabilities'
       ) = 0
       OR pg_catalog.strpos(v_function_source, 'pg_current_xact_id') = 0 THEN
      RAISE EXCEPTION
        'Migration 047 postflight: atomic RPC is missing deduction write capability issuance: %',
        v_function_signature;
    END IF;
  END LOOP;
END;
$verify$;

COMMIT;

SELECT pg_catalog.jsonb_build_object(
  'status', 'ok',
  'postdeploy_only', true,
  'trigger', 'trg_guard_deduction_payment_writes',
  'guarded_table', 'pyra_employee_payments',
  'capability_table', 'pyra_deduction_write_capabilities'
) AS migration_047_postflight;
