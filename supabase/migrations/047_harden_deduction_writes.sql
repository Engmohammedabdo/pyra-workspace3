-- =============================================================
-- Migration 047: Guard deduction ledger writes
-- POST-DEPLOY ONLY
-- =============================================================
-- Apply this migration only after the atomic payroll routes are live and
-- migration 046 has been applied and verified. Installing it earlier is
-- intentionally fail-closed and will reject legacy direct deduction writes.
-- =============================================================

BEGIN;

-- Close the last legacy-writer race: while this transaction validates the
-- ledger and installs the trigger, inserts/updates/deletes must wait.
LOCK TABLE public.pyra_employee_payments IN EXCLUSIVE MODE;

DO $preflight$
DECLARE
  v_function_signature text;
  v_function_oid pg_catalog.oid;
  v_function_source text;
BEGIN
  IF pg_catalog.to_regrole('postgres') IS NULL THEN
    RAISE EXCEPTION 'Migration 047 preflight: required postgres function owner role is missing';
  END IF;

  IF pg_catalog.to_regclass('public.pyra_deduction_write_capabilities') IS NULL THEN
    RAISE EXCEPTION 'Migration 047 preflight: private deduction capability table is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pyra_employee_payments'
      AND column_name = 'deduction_cap_exempt_amount'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'Migration 047 preflight: attendance cap exemption column is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments
    WHERE source_type = 'deduction'
      AND effective_month IS NULL
  ) THEN
    RAISE EXCEPTION 'deduction_effective_month_classification_required';
  END IF;

  -- The generic payment lifecycle is intentionally closed to deductions.
  -- Do not install the append-only guard while a legacy pending deduction
  -- still needs an explicit owner classification; otherwise that row would
  -- become impossible to approve or remove through the supported APIs.
  IF EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments
    WHERE source_type = 'deduction'
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'deduction_pending_classification_required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments
    WHERE source_type = 'deduction'
      AND (
        currency IS NULL
        OR pg_catalog.char_length(pg_catalog.btrim(currency)) <> 3
      )
  ) THEN
    RAISE EXCEPTION 'deduction_currency_classification_required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments
    WHERE source_type = 'deduction'
      AND (
        (status IS DISTINCT FROM 'approved' AND status IS DISTINCT FROM 'paid')
        OR source_id IS NULL
        OR pg_catalog.btrim(source_id) = ''
        OR description IS NULL
        OR pg_catalog.btrim(description) = ''
        OR amount <= 0
        OR effective_month IS NULL
        OR effective_month IS DISTINCT FROM
          pg_catalog.date_trunc('month', effective_month::timestamp)::date
      )
  ) THEN
    RAISE EXCEPTION 'deduction_ledger_classification_required';
  END IF;

  IF EXISTS (SELECT 1 FROM public.pyra_deduction_write_capabilities) THEN
    RAISE EXCEPTION 'Migration 047 preflight: stale deduction write capabilities exist';
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
     ) THEN
    RAISE EXCEPTION 'Migration 047 preflight: service_role can mint deduction capabilities';
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
        'Migration 047 preflight: atomic RPC % is missing deduction write capability issuance',
        v_function_signature;
    END IF;
  END LOOP;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.pyra_guard_deduction_payment_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
  v_touches_deduction boolean := false;
  v_payment_id varchar(20);
  v_capability_payment_id varchar(20);
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_touches_deduction := NEW.source_type = 'deduction';
    v_payment_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_touches_deduction := OLD.source_type = 'deduction'
      OR NEW.source_type = 'deduction';
    v_payment_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_touches_deduction := OLD.source_type = 'deduction';
    v_payment_id := OLD.id;
  END IF;

  IF v_touches_deduction THEN
    DELETE FROM public.pyra_deduction_write_capabilities AS capability
    WHERE capability.transaction_id = pg_catalog.pg_current_xact_id()::text::bigint
      AND capability.payment_id = v_payment_id
      AND capability.operation = pg_catalog.lower(TG_OP)
    RETURNING capability.payment_id INTO v_capability_payment_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'deduction_payment_write_requires_atomic_rpc';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.pyra_guard_deduction_payment_writes() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.pyra_guard_deduction_payment_writes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pyra_guard_deduction_payment_writes() FROM anon;
REVOKE ALL ON FUNCTION public.pyra_guard_deduction_payment_writes() FROM authenticated;
REVOKE ALL ON FUNCTION public.pyra_guard_deduction_payment_writes() FROM service_role;

DROP TRIGGER IF EXISTS trg_guard_deduction_payment_writes
  ON public.pyra_employee_payments;

CREATE TRIGGER trg_guard_deduction_payment_writes
BEFORE INSERT OR UPDATE OR DELETE ON public.pyra_employee_payments
FOR EACH ROW
EXECUTE FUNCTION public.pyra_guard_deduction_payment_writes();

COMMIT;

-- -- DOWN (informational only; never auto-run):
-- -- DROP TRIGGER IF EXISTS trg_guard_deduction_payment_writes ON public.pyra_employee_payments;
-- -- DROP FUNCTION IF EXISTS public.pyra_guard_deduction_payment_writes();
