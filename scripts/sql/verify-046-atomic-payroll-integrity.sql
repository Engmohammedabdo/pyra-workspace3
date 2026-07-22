-- Read-only, fail-closed postflight for migration 046 atomic payroll integrity.

BEGIN;
SET LOCAL row_security = off;

DO $verify$
DECLARE
  v_function_signatures text[] := ARRAY[
    'pyra_commit_payroll_calculation(varchar,timestamptz,jsonb,varchar[],numeric)',
    'pyra_approve_payroll_run(varchar,timestamptz,varchar,text,jsonb)',
    'pyra_pay_payroll_run(varchar,text)',
    'pyra_pay_employee_payment(varchar)',
    'pyra_approve_employee_payment(varchar,varchar)',
    'pyra_delete_draft_payroll_run(varchar)',
    'pyra_approve_manual_deduction(varchar,varchar,varchar,date,numeric,varchar,numeric,numeric,varchar,text,jsonb,varchar)',
    'pyra_approve_employee_deduction(varchar,varchar,varchar,date,numeric,varchar,numeric,numeric,numeric,varchar,numeric,numeric,numeric,numeric,boolean,integer,boolean,numeric,numeric,jsonb,jsonb,text,text,varchar)'
  ];
  v_function_signature text;
  v_function_name text;
  v_function_oid pg_catalog.oid;
  v_function_source text;
  v_duplicate_count bigint;
BEGIN
  SELECT pg_catalog.count(*)
  INTO v_duplicate_count
  FROM (
    SELECT payroll_id, username
    FROM public.pyra_payroll_items
    GROUP BY payroll_id, username
    HAVING pg_catalog.count(*) > 1
  ) AS duplicate_groups;

  IF v_duplicate_count <> 0 THEN
    RAISE EXCEPTION 'Migration 046 postflight: duplicate payroll item employee/run groups remain';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments
    WHERE source_type = 'deduction'
      AND effective_month IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration 046 postflight: deduction payment still has NULL effective_month';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments
    WHERE source_type = 'deduction'
      AND (
        status = 'pending'
        OR (status IS DISTINCT FROM 'approved' AND status IS DISTINCT FROM 'paid')
        OR source_id IS NULL
        OR pg_catalog.btrim(source_id) = ''
        OR description IS NULL
        OR pg_catalog.btrim(description) = ''
        OR amount <= 0
        OR effective_month IS NULL
        OR effective_month IS DISTINCT FROM
          pg_catalog.date_trunc('month', effective_month::timestamp)::date
        OR currency IS NULL
        OR pg_catalog.char_length(pg_catalog.btrim(currency)) <> 3
      )
  ) THEN
    RAISE EXCEPTION 'Migration 046 postflight: unresolved deduction ledger classification remains';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pyra_employee_payments'
      AND column_name = 'deduction_cap_exempt_amount'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.pyra_employee_payments'::pg_catalog.regclass
      AND con.conname = 'ck_employee_payments_deduction_cap_exempt'
      AND con.convalidated
      AND pg_catalog.strpos(
        pg_catalog.pg_get_constraintdef(con.oid),
        'deduction_cap_exempt_amount <= amount'
      ) > 0
  ) THEN
    RAISE EXCEPTION 'Migration 046 postflight: deduction cap-exempt payment split is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_payroll_runs
    GROUP BY year, month, COALESCE(currency, 'AED')
    HAVING pg_catalog.count(*) > 1
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pyra_payroll_runs'
      AND column_name = 'currency'
      AND is_nullable = 'NO'
      AND column_default = '''AED''::character varying'
  ) THEN
    RAISE EXCEPTION 'Migration 046 postflight: payroll period currency is not normalized';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_deduction_cases AS deduction_case
    LEFT JOIN public.pyra_employee_payments AS own_payment
      ON own_payment.id = deduction_case.payment_id
    WHERE own_payment.id IS NULL
       OR (
         own_payment.status IS DISTINCT FROM 'approved'
         AND own_payment.status IS DISTINCT FROM 'paid'
       )
       OR own_payment.deduction_cap_exempt_amount
          IS DISTINCT FROM deduction_case.attendance_amount
  ) THEN
    RAISE EXCEPTION 'Migration 046 postflight: computed deduction case has an invalid payment status';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_manual_deductions AS manual
    LEFT JOIN public.pyra_employee_payments AS payment
      ON payment.id = manual.payment_id
    WHERE payment.id IS NULL
       OR payment.deduction_cap_exempt_amount IS DISTINCT FROM 0
  ) THEN
    RAISE EXCEPTION 'Migration 046 postflight: manual deduction consumed attendance exemption';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pyra_deduction_cases
    WHERE quality_amount IS DISTINCT FROM 0
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.pyra_deduction_cases'::pg_catalog.regclass
      AND con.conname = 'ck_deduction_cases_quality_manual_only'
      AND con.convalidated
  ) THEN
    RAISE EXCEPTION 'Migration 046 postflight: computed quality money is not disabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.pyra_payroll_items'::pg_catalog.regclass
      AND con.conname = 'uq_payroll_items_run_username'
      AND con.contype = 'u'
      AND con.convalidated
      AND pg_catalog.pg_get_constraintdef(con.oid) = 'UNIQUE (payroll_id, username)'
  ) THEN
    RAISE EXCEPTION 'Migration 046 postflight: payroll item employee/run uniqueness is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'pyra_manual_deductions'
      AND relation.relkind = 'r'
      AND relation.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.pyra_manual_deductions'::pg_catalog.regclass
      AND con.conname = 'fk_manual_deductions_payment'
      AND con.contype = 'f'
      AND con.condeferrable
      AND con.condeferred
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.pyra_manual_deductions'::pg_catalog.regclass
      AND con.conname = 'ck_manual_deductions_documentation'
      AND con.convalidated
      AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(con.oid), 'reason') > 0
      AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(con.oid), 'evidence') > 0
      AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(con.oid), 'schema_version') > 0
      AND (
        pg_catalog.strpos(
          pg_catalog.pg_get_constraintdef(con.oid),
          'IS NOT DISTINCT FROM'
        ) > 0
        OR (
          -- PostgreSQL normalizes `a IS NOT DISTINCT FROM b` to
          -- `NOT (a IS DISTINCT FROM b)` in pg_get_constraintdef().
          pg_catalog.strpos(pg_catalog.pg_get_constraintdef(con.oid), 'IS DISTINCT FROM') > 0
          AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(con.oid), 'NOT (') > 0
        )
      )
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.pyra_manual_deductions'::pg_catalog.regclass
      AND con.conname = 'ck_manual_deductions_basis'
      AND con.convalidated
      AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(con.oid), 'quality_repeated_pattern') > 0
  ) THEN
    RAISE EXCEPTION 'Migration 046 postflight: immutable manual deduction evidence table is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'pyra_manual_deduction_tasks'
      AND relation.relkind = 'r'
      AND relation.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.pyra_manual_deduction_tasks'::pg_catalog.regclass
      AND con.conname = 'uq_manual_deduction_task'
      AND con.contype = 'u'
      AND con.convalidated
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes AS index_def
    WHERE index_def.schemaname = 'public'
      AND index_def.tablename = 'pyra_manual_deductions'
      AND index_def.indexname = 'uq_manual_quality_employee_month'
      AND pg_catalog.strpos(index_def.indexdef, 'quality_repeated_pattern') > 0
  ) THEN
    RAISE EXCEPTION 'Migration 046 postflight: duplicate-cause guards are incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'pyra_deduction_write_capabilities'
      AND relation.relkind = 'r'
      AND relation.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.pyra_deduction_write_capabilities'::pg_catalog.regclass
      AND con.conname = 'pyra_deduction_write_capabilities_pkey'
      AND con.contype = 'p'
      AND con.convalidated
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.pyra_deduction_write_capabilities'::pg_catalog.regclass
      AND con.conname = 'ck_deduction_write_capability_operation'
      AND con.convalidated
  ) THEN
    RAISE EXCEPTION 'Migration 046 postflight: private deduction capability table is incomplete';
  END IF;

  IF EXISTS (SELECT 1 FROM public.pyra_deduction_write_capabilities)
     OR pg_catalog.has_table_privilege(
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
     ) THEN
    RAISE EXCEPTION 'Migration 046 postflight: deduction capability table is not private and empty';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.pyra_deduction_cases'::pg_catalog.regclass
      AND con.conname = 'ck_deduction_cases_approved_formula'
      AND con.convalidated
      AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(con.oid), 'remaining_cap_amount') > 0
      AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(con.oid), 'attendance_amount') > 0
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.pyra_deduction_cases'::pg_catalog.regclass
      AND con.conname = 'ck_deduction_cases_remaining_cap'
      AND con.convalidated
      AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(con.oid), 'prior_approved_amount') > 0
      AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(con.oid), 'remaining_cap_amount') > 0
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.pyra_deduction_cases'::pg_catalog.regclass
      AND con.conname = 'ck_deduction_cases_approved_cap_subject'
      AND con.convalidated
  ) THEN
    RAISE EXCEPTION 'Migration 046 postflight: aggregate computed-case cap constraints are missing';
  END IF;

  FOREACH v_function_signature IN ARRAY v_function_signatures
  LOOP
    v_function_name := pg_catalog.split_part(v_function_signature, '(', 1);
    v_function_oid := pg_catalog.to_regprocedure('public.' || v_function_signature);

    IF v_function_oid IS NULL OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS proc
      WHERE proc.oid = v_function_oid
        AND proc.prosecdef
        AND proc.proowner = pg_catalog.to_regrole('postgres')
        AND proc.proconfig = ARRAY['search_path=""', 'row_security=off']::text[]
        AND pg_catalog.cardinality(proc.proconfig) = 2
    ) THEN
      RAISE EXCEPTION 'Migration 046 postflight: missing, overloaded, or insecure function %', v_function_signature;
    END IF;

    IF pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
       OR NOT pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Migration 046 postflight: incorrect ACL for function %', v_function_name;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS proc,
           LATERAL pg_catalog.aclexplode(
             COALESCE(proc.proacl, pg_catalog.acldefault('f', proc.proowner))
           ) AS acl
      WHERE proc.oid = v_function_oid
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'Migration 046 postflight: PUBLIC can execute function %', v_function_name;
    END IF;
  END LOOP;

  SELECT proc.prosrc
  INTO v_function_source
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid = pg_catalog.to_regprocedure(
    'public.pyra_approve_manual_deduction(varchar,varchar,varchar,date,numeric,varchar,numeric,numeric,varchar,text,jsonb,varchar)'
  );

  IF v_function_source IS NULL
     OR pg_catalog.strpos(v_function_source, 'current_month_only') = 0
     OR pg_catalog.strpos(v_function_source, 'IS DISTINCT FROM v_current_month') = 0
     OR pg_catalog.strpos(v_function_source, 'cap_changed') = 0
     OR pg_catalog.strpos(v_function_source, 'duplicate_cause') = 0
     OR pg_catalog.strpos(v_function_source, 'quality_timing_unconfirmed') = 0
     OR pg_catalog.strpos(v_function_source, 'p_basis') = 0
     OR pg_catalog.strpos(v_function_source, 'pyra_manual_deduction_tasks') = 0
     OR pg_catalog.strpos(v_function_source, 'deduction_cap_exempt_amount') = 0 THEN
    RAISE EXCEPTION 'Migration 046 postflight: manual deduction RPC is not current-month-only and fail-closed';
  END IF;

  SELECT proc.prosrc
  INTO v_function_source
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid = pg_catalog.to_regprocedure(
    'public.pyra_commit_payroll_calculation(varchar,timestamptz,jsonb,varchar[],numeric)'
  );
  IF v_function_source IS NULL
     OR pg_catalog.strpos(v_function_source, 'FROM public.pyra_users AS employee') = 0
     OR pg_catalog.strpos(v_function_source, 'ORDER BY employee.username') = 0
     OR pg_catalog.strpos(v_function_source, 'FROM public.pyra_users AS employee')
        > pg_catalog.strpos(v_function_source, 'FROM public.pyra_payroll_runs AS pr')
     OR pg_catalog.strpos(v_function_source, 'FROM public.pyra_payroll_runs AS pr')
        > pg_catalog.strpos(v_function_source, 'FROM public.pyra_employee_payments AS ep') THEN
    RAISE EXCEPTION 'Migration 046 postflight: payroll calculation lock order is not user-run-payment';
  END IF;

  -- Append-only to service_role; only the SECURITY DEFINER approval RPC writes.
  IF pg_catalog.has_table_privilege('anon', 'public.pyra_manual_deductions', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.pyra_manual_deductions', 'SELECT')
     OR pg_catalog.has_table_privilege('service_role', 'public.pyra_manual_deductions', 'INSERT')
     OR pg_catalog.has_table_privilege('service_role', 'public.pyra_manual_deductions', 'UPDATE')
     OR pg_catalog.has_table_privilege('service_role', 'public.pyra_manual_deductions', 'DELETE')
     OR NOT pg_catalog.has_table_privilege('service_role', 'public.pyra_manual_deductions', 'SELECT') THEN
    RAISE EXCEPTION 'Migration 046 postflight: manual deduction table is not append-only';
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'public.pyra_manual_deduction_tasks', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.pyra_manual_deduction_tasks', 'SELECT')
     OR pg_catalog.has_table_privilege('service_role', 'public.pyra_manual_deduction_tasks', 'INSERT')
     OR pg_catalog.has_table_privilege('service_role', 'public.pyra_manual_deduction_tasks', 'UPDATE')
     OR pg_catalog.has_table_privilege('service_role', 'public.pyra_manual_deduction_tasks', 'DELETE')
     OR NOT pg_catalog.has_table_privilege('service_role', 'public.pyra_manual_deduction_tasks', 'SELECT') THEN
    RAISE EXCEPTION 'Migration 046 postflight: manual deduction task ledger is not append-only';
  END IF;

  -- has_table_privilege accepts comma lists with ANY semantics, so every
  -- required privilege is asserted independently.
  IF NOT pg_catalog.has_table_privilege('service_role', 'public.pyra_payroll_runs', 'SELECT')
     OR NOT pg_catalog.has_table_privilege('service_role', 'public.pyra_payroll_runs', 'INSERT')
     OR NOT pg_catalog.has_table_privilege('service_role', 'public.pyra_payroll_runs', 'UPDATE')
     OR NOT pg_catalog.has_table_privilege('service_role', 'public.pyra_payroll_runs', 'DELETE')
     OR NOT pg_catalog.has_table_privilege('service_role', 'public.pyra_payroll_items', 'SELECT')
     OR NOT pg_catalog.has_table_privilege('service_role', 'public.pyra_payroll_items', 'INSERT')
     OR NOT pg_catalog.has_table_privilege('service_role', 'public.pyra_payroll_items', 'UPDATE')
     OR NOT pg_catalog.has_table_privilege('service_role', 'public.pyra_payroll_items', 'DELETE')
     OR NOT pg_catalog.has_table_privilege('service_role', 'public.pyra_employee_payments', 'SELECT')
     OR NOT pg_catalog.has_table_privilege('service_role', 'public.pyra_employee_payments', 'INSERT')
     OR NOT pg_catalog.has_table_privilege('service_role', 'public.pyra_employee_payments', 'UPDATE')
     OR NOT pg_catalog.has_table_privilege('service_role', 'public.pyra_expenses', 'SELECT')
     OR NOT pg_catalog.has_table_privilege('service_role', 'public.pyra_expenses', 'INSERT')
     OR NOT pg_catalog.has_table_privilege('service_role', 'public.pyra_expenses', 'DELETE') THEN
    RAISE EXCEPTION 'Migration 046 postflight: service_role lacks required payroll writer privileges';
  END IF;
END;
$verify$;

COMMIT;

SELECT pg_catalog.jsonb_build_object(
  'status', 'ok',
  'constraint', 'uq_payroll_items_run_username',
  'service_role_only', true,
  'manual_deductions_append_only', true,
  'quality_money_manual_only', true,
  'attendance_outside_disciplinary_cap', true,
  'rpc_count', 8
) AS migration_046_postflight;
