-- Migration 052: align deduction cancellation with the canonical payroll lock
-- order. Observe the payment without a row lock, lock its payroll run first
-- when present, then lock and revalidate the payment before any mutation.

BEGIN;

DO $preflight$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.pyra_cancel_employee_deduction(varchar,varchar,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Migration 052 preflight: cancellation RPC is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pyra_employee_payments'
      AND column_name = 'cancellation_reason'
  ) THEN
    RAISE EXCEPTION 'Migration 052 preflight: cancellation audit columns are missing';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.pyra_cancel_employee_deduction(
  p_payment_id varchar,
  p_cancelled_by varchar,
  p_reason text
)
RETURNS TABLE(status text, changed boolean, payment_data jsonb, run_data jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
  v_observed_payment public.pyra_employee_payments%ROWTYPE;
  v_payment public.pyra_employee_payments%ROWTYPE;
  v_run public.pyra_payroll_runs%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_link_count integer := 0;
BEGIN
  IF p_payment_id IS NULL
     OR pg_catalog.btrim(p_payment_id) = ''
     OR pg_catalog.length(p_payment_id) > 20
     OR p_cancelled_by IS NULL
     OR pg_catalog.btrim(p_cancelled_by) = ''
     OR pg_catalog.length(p_cancelled_by) > 100
     OR p_reason IS NULL
     OR pg_catalog.btrim(p_reason) = ''
     OR pg_catalog.length(p_reason) > 2000 THEN
    RETURN QUERY SELECT 'invalid_payload'::text, false, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  -- This first read intentionally takes no row lock. It only tells us whether
  -- the canonical run-first path is required; the locked row is revalidated.
  SELECT payment.*
  INTO v_observed_payment
  FROM public.pyra_employee_payments AS payment
  WHERE payment.id = p_payment_id;

  IF NOT FOUND OR v_observed_payment.source_type IS DISTINCT FROM 'deduction' THEN
    RETURN QUERY SELECT 'not_found'::text, false, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF v_observed_payment.payroll_id IS NOT NULL THEN
    SELECT payroll.*
    INTO v_run
    FROM public.pyra_payroll_runs AS payroll
    WHERE payroll.id = v_observed_payment.payroll_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT
        'state_changed'::text,
        false,
        pg_catalog.to_jsonb(v_observed_payment),
        NULL::jsonb;
      RETURN;
    END IF;

    SELECT payment.*
    INTO v_payment
    FROM public.pyra_employee_payments AS payment
    WHERE payment.id = p_payment_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_payment.source_type IS DISTINCT FROM 'deduction'
       OR v_payment.payroll_id IS DISTINCT FROM v_observed_payment.payroll_id THEN
      RETURN QUERY SELECT
        'state_changed'::text,
        false,
        CASE WHEN v_payment.id IS NULL
          THEN NULL::jsonb
          ELSE pg_catalog.to_jsonb(v_payment)
        END,
        pg_catalog.to_jsonb(v_run);
      RETURN;
    END IF;
  ELSE
    SELECT payment.*
    INTO v_payment
    FROM public.pyra_employee_payments AS payment
    WHERE payment.id = p_payment_id
    FOR UPDATE;

    IF NOT FOUND OR v_payment.source_type IS DISTINCT FROM 'deduction' THEN
      RETURN QUERY SELECT 'not_found'::text, false, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;

    -- A payroll calculation linked the row after the unlocked observation.
    -- Return without locking that run after the payment; a retry will use the
    -- canonical run-first order and cannot deadlock with payroll operations.
    IF v_payment.payroll_id IS NOT NULL THEN
      RETURN QUERY SELECT
        'state_changed'::text,
        false,
        pg_catalog.to_jsonb(v_payment),
        NULL::jsonb;
      RETURN;
    END IF;
  END IF;

  IF v_payment.status IS NOT DISTINCT FROM 'rejected' THEN
    IF v_payment.cancelled_at IS NULL
       OR v_payment.cancelled_by IS NULL
       OR pg_catalog.btrim(v_payment.cancelled_by) = ''
       OR v_payment.cancellation_reason IS NULL
       OR pg_catalog.btrim(v_payment.cancellation_reason) = ''
       OR v_payment.payroll_id IS NOT NULL
       OR v_payment.paid_at IS NOT NULL THEN
      RETURN QUERY SELECT
        'integrity_conflict'::text,
        false,
        pg_catalog.to_jsonb(v_payment),
        NULL::jsonb;
      RETURN;
    END IF;

    RETURN QUERY SELECT
      'already_cancelled'::text,
      false,
      pg_catalog.to_jsonb(v_payment),
      NULL::jsonb;
    RETURN;
  END IF;

  IF v_payment.status IS NOT DISTINCT FROM 'paid'
     OR v_payment.paid_at IS NOT NULL THEN
    RETURN QUERY SELECT
      'already_paid'::text,
      false,
      pg_catalog.to_jsonb(v_payment),
      CASE WHEN v_run.id IS NULL THEN NULL::jsonb ELSE pg_catalog.to_jsonb(v_run) END;
    RETURN;
  END IF;

  IF v_payment.status IS DISTINCT FROM 'approved' THEN
    RETURN QUERY SELECT
      'invalid_status'::text,
      false,
      pg_catalog.to_jsonb(v_payment),
      CASE WHEN v_run.id IS NULL THEN NULL::jsonb ELSE pg_catalog.to_jsonb(v_run) END;
    RETURN;
  END IF;

  SELECT (
    SELECT pg_catalog.count(*)
    FROM public.pyra_deduction_cases AS deduction_case
    WHERE deduction_case.id = v_payment.source_id
      AND deduction_case.payment_id = v_payment.id
      AND deduction_case.employee_username = v_payment.username
      AND deduction_case.period_month = v_payment.effective_month
      AND deduction_case.salary_currency = v_payment.currency
      AND deduction_case.approved_amount = pg_catalog.round(v_payment.amount, 2)
  ) + (
    SELECT pg_catalog.count(*)
    FROM public.pyra_manual_deductions AS manual
    WHERE manual.id = v_payment.source_id
      AND manual.payment_id = v_payment.id
      AND manual.employee_username = v_payment.username
      AND manual.period_month = v_payment.effective_month
      AND manual.salary_currency = v_payment.currency
      AND manual.approved_amount = pg_catalog.round(v_payment.amount, 2)
  )
  INTO v_link_count;

  IF v_link_count IS DISTINCT FROM 1 THEN
    RETURN QUERY SELECT
      'integrity_conflict'::text,
      false,
      pg_catalog.to_jsonb(v_payment),
      CASE WHEN v_run.id IS NULL THEN NULL::jsonb ELSE pg_catalog.to_jsonb(v_run) END;
    RETURN;
  END IF;

  IF v_payment.payroll_id IS NOT NULL THEN
    IF v_run.status IN ('approved', 'paid') THEN
      RETURN QUERY SELECT
        'payment_linked_to_closed_run'::text,
        false,
        pg_catalog.to_jsonb(v_payment),
        pg_catalog.to_jsonb(v_run);
      RETURN;
    END IF;

    IF v_run.status NOT IN ('draft', 'calculated') THEN
      RETURN QUERY SELECT
        'closed_period'::text,
        false,
        pg_catalog.to_jsonb(v_payment),
        pg_catalog.to_jsonb(v_run);
      RETURN;
    END IF;

    PERFORM payment.id
    FROM public.pyra_employee_payments AS payment
    WHERE payment.payroll_id = v_run.id
    ORDER BY payment.id
    FOR UPDATE;

    PERFORM item.id
    FROM public.pyra_payroll_items AS item
    WHERE item.payroll_id = v_run.id
    ORDER BY item.id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM public.pyra_employee_payments AS payment
      WHERE payment.payroll_id = v_run.id
        AND payment.status IS DISTINCT FROM 'approved'
    ) THEN
      RETURN QUERY SELECT
        'integrity_conflict'::text,
        false,
        pg_catalog.to_jsonb(v_payment),
        pg_catalog.to_jsonb(v_run);
      RETURN;
    END IF;

    INSERT INTO public.pyra_deduction_write_capabilities (
      transaction_id, payment_id, operation
    )
    SELECT
      pg_catalog.pg_current_xact_id()::text::bigint,
      payment.id,
      'update'
    FROM public.pyra_employee_payments AS payment
    WHERE payment.payroll_id = v_run.id
      AND payment.source_type = 'deduction'
    ON CONFLICT DO NOTHING;

    UPDATE public.pyra_employee_payments AS payment
    SET payroll_id = NULL,
        status = CASE
          WHEN payment.id = p_payment_id THEN 'rejected'
          ELSE payment.status
        END,
        cancelled_at = CASE
          WHEN payment.id = p_payment_id THEN v_now
          ELSE payment.cancelled_at
        END,
        cancelled_by = CASE
          WHEN payment.id = p_payment_id THEN pg_catalog.btrim(p_cancelled_by)
          ELSE payment.cancelled_by
        END,
        cancellation_reason = CASE
          WHEN payment.id = p_payment_id THEN pg_catalog.btrim(p_reason)
          ELSE payment.cancellation_reason
        END
    WHERE payment.payroll_id = v_run.id;

    DELETE FROM public.pyra_deduction_write_capabilities
    WHERE transaction_id = pg_catalog.pg_current_xact_id()::text::bigint
      AND operation = 'update';

    DELETE FROM public.pyra_payroll_items
    WHERE payroll_id = v_run.id;

    UPDATE public.pyra_payroll_runs AS payroll
    SET status = 'draft',
        total_amount = 0,
        employee_count = 0,
        calculated_at = NULL,
        approved_by = NULL,
        approved_at = NULL,
        paid_at = NULL
    WHERE payroll.id = v_run.id
    RETURNING * INTO v_run;
  ELSE
    INSERT INTO public.pyra_deduction_write_capabilities (
      transaction_id, payment_id, operation
    ) VALUES (
      pg_catalog.pg_current_xact_id()::text::bigint,
      p_payment_id,
      'update'
    )
    ON CONFLICT DO NOTHING;

    UPDATE public.pyra_employee_payments
    SET status = 'rejected',
        payroll_id = NULL,
        cancelled_at = v_now,
        cancelled_by = pg_catalog.btrim(p_cancelled_by),
        cancellation_reason = pg_catalog.btrim(p_reason)
    WHERE id = p_payment_id
    RETURNING * INTO v_payment;

    DELETE FROM public.pyra_deduction_write_capabilities
    WHERE transaction_id = pg_catalog.pg_current_xact_id()::text::bigint
      AND payment_id = p_payment_id
      AND operation = 'update';
  END IF;

  SELECT payment.*
  INTO v_payment
  FROM public.pyra_employee_payments AS payment
  WHERE payment.id = p_payment_id;

  RETURN QUERY SELECT
    'ok'::text,
    true,
    pg_catalog.to_jsonb(v_payment),
    CASE WHEN v_run.id IS NULL THEN NULL::jsonb ELSE pg_catalog.to_jsonb(v_run) END;
END;
$function$;

ALTER FUNCTION public.pyra_cancel_employee_deduction(varchar, varchar, text)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.pyra_cancel_employee_deduction(varchar, varchar, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pyra_cancel_employee_deduction(varchar, varchar, text)
  FROM anon;
REVOKE ALL ON FUNCTION public.pyra_cancel_employee_deduction(varchar, varchar, text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pyra_cancel_employee_deduction(varchar, varchar, text)
  TO service_role;

COMMIT;

-- -- DOWN (manual only): restore migration 051's complete
-- -- pyra_cancel_employee_deduction definition and ACL block.
