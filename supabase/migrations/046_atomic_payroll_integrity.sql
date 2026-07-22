-- =============================================================
-- Migration 046: Atomic payroll integrity
-- =============================================================
-- Keeps payroll math in the unit-tested TypeScript pure core while moving
-- every multi-table financial write into a single PostgreSQL transaction.
-- Expected business conflicts are returned as status rows; unexpected SQL
-- errors abort and roll back the whole RPC.
-- =============================================================

BEGIN;

-- Freeze legacy writers while the preflight classifies the existing ledger
-- and normalizes the historical nullable AED payroll currency. The locks are
-- held until COMMIT, so no row can race between validation and hardening.
LOCK TABLE public.pyra_payroll_runs IN EXCLUSIVE MODE;
LOCK TABLE public.pyra_deduction_cases IN EXCLUSIVE MODE;
LOCK TABLE public.pyra_employee_payments IN EXCLUSIVE MODE;

-- Attendance deductions are approved payroll money, but the owner explicitly
-- excludes that documented portion from the 25% disciplinary ceiling. Keeping
-- the split on the immutable payment row lets payroll and every later approval
-- derive the same cap ledger without parsing descriptions or JSON evidence.
ALTER TABLE public.pyra_employee_payments
  ADD COLUMN IF NOT EXISTS deduction_cap_exempt_amount numeric(12,2)
  NOT NULL DEFAULT 0;

DO $payment_cap_exempt_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_employee_payments'::pg_catalog.regclass
      AND conname = 'ck_employee_payments_deduction_cap_exempt'
  ) THEN
    ALTER TABLE public.pyra_employee_payments
      ADD CONSTRAINT ck_employee_payments_deduction_cap_exempt CHECK (
        deduction_cap_exempt_amount >= 0
        AND (
          (
            source_type = 'deduction'
            AND amount > 0
            AND deduction_cap_exempt_amount <= amount
          )
          OR (
            source_type IS DISTINCT FROM 'deduction'
            AND deduction_cap_exempt_amount = 0
          )
        )
      );
  END IF;
END;
$payment_cap_exempt_constraint$;

DO $preflight$
BEGIN
  IF pg_catalog.to_regrole('postgres') IS NULL THEN
    RAISE EXCEPTION 'Required postgres function owner role is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_payroll_items
    GROUP BY payroll_id, username
    HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add payroll item uniqueness: duplicate payroll_id/username rows exist';
  END IF;

  -- A deduction month is an attested business fact. Never infer it from
  -- created_at: every legacy row must be classified explicitly before 046.
  IF EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments
    WHERE source_type = 'deduction'
      AND effective_month IS NULL
  ) THEN
    RAISE EXCEPTION 'deduction_effective_month_classification_required';
  END IF;

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

  -- Migration 026 established NULL payroll currency as AED in application
  -- reads, but PostgreSQL UNIQUE treats NULL values as distinct. Abort before
  -- normalization if that historical shape would collapse two period rows.
  IF EXISTS (
    SELECT 1
    FROM public.pyra_payroll_runs
    GROUP BY year, month, COALESCE(currency, 'AED')
    HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION 'payroll_period_currency_classification_required';
  END IF;
END;
$preflight$;

UPDATE public.pyra_payroll_runs
SET currency = 'AED'
WHERE currency IS NULL;

ALTER TABLE public.pyra_payroll_runs
  ALTER COLUMN currency SET DEFAULT 'AED',
  ALTER COLUMN currency SET NOT NULL;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_payroll_items'::pg_catalog.regclass
      AND conname = 'uq_payroll_items_run_username'
  ) THEN
    ALTER TABLE public.pyra_payroll_items
      ADD CONSTRAINT uq_payroll_items_run_username
      UNIQUE (payroll_id, username);
  END IF;
END;
$constraint$;

-- Private, transaction-bound, one-shot capabilities used by migration 047's
-- row trigger. Callers cannot mint them; approved SECURITY DEFINER RPCs issue
-- an exact payment/operation capability and the trigger consumes it once.
CREATE TABLE IF NOT EXISTS public.pyra_deduction_write_capabilities (
  transaction_id bigint NOT NULL,
  payment_id varchar(20) NOT NULL,
  operation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

DO $capability_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_write_capabilities'::pg_catalog.regclass
      AND conname = 'pyra_deduction_write_capabilities_pkey'
  ) THEN
    ALTER TABLE public.pyra_deduction_write_capabilities
      ADD CONSTRAINT pyra_deduction_write_capabilities_pkey
      PRIMARY KEY (transaction_id, payment_id, operation);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_write_capabilities'::pg_catalog.regclass
      AND conname = 'ck_deduction_write_capability_operation'
  ) THEN
    ALTER TABLE public.pyra_deduction_write_capabilities
      ADD CONSTRAINT ck_deduction_write_capability_operation
      CHECK (operation IN ('insert', 'update', 'delete'));
  END IF;
END;
$capability_constraints$;

ALTER TABLE public.pyra_deduction_write_capabilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pyra_deduction_write_capabilities FROM PUBLIC;
REVOKE ALL ON TABLE public.pyra_deduction_write_capabilities FROM anon;
REVOKE ALL ON TABLE public.pyra_deduction_write_capabilities FROM authenticated;
REVOKE ALL ON TABLE public.pyra_deduction_write_capabilities FROM service_role;

-- Manual/owner-attested deductions are intentionally separate from the one
-- computed case allowed per employee/month. Each row is immutable evidence for
-- one explicit admin approval; payment_id is the already-approved payroll
-- ledger row created in the same transaction.
CREATE TABLE IF NOT EXISTS public.pyra_manual_deductions (
  id                         varchar(20) NOT NULL,
  payment_id                 varchar(20) NOT NULL,
  employee_username          varchar NOT NULL,
  period_month               date NOT NULL,
  basis                      varchar(50) NOT NULL,
  salary_snapshot            numeric(12,2) NOT NULL,
  salary_currency            varchar(3) NOT NULL,
  monthly_cap_percentage     numeric(5,2) NOT NULL,
  requested_amount           numeric(12,2) NOT NULL,
  cap_amount                 numeric(12,2) NOT NULL,
  prior_approved_amount      numeric(12,2) NOT NULL,
  approved_amount            numeric(12,2) NOT NULL,
  reason                     text NOT NULL,
  evidence                   jsonb NOT NULL,
  approved_by                varchar NOT NULL,
  approved_at                timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_at                 timestamptz NOT NULL DEFAULT pg_catalog.now()
);

DO $manual_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_manual_deductions'::pg_catalog.regclass
      AND conname = 'pyra_manual_deductions_pkey'
  ) THEN
    ALTER TABLE public.pyra_manual_deductions
      ADD CONSTRAINT pyra_manual_deductions_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_manual_deductions'::pg_catalog.regclass
      AND conname = 'ck_manual_deductions_basis'
  ) THEN
    ALTER TABLE public.pyra_manual_deductions
      ADD CONSTRAINT ck_manual_deductions_basis CHECK (
        basis IN ('owner_attested_legacy_delivery', 'quality_repeated_pattern')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_manual_deductions'::pg_catalog.regclass
      AND conname = 'uq_manual_deductions_payment'
  ) THEN
    ALTER TABLE public.pyra_manual_deductions
      ADD CONSTRAINT uq_manual_deductions_payment UNIQUE (payment_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_manual_deductions'::pg_catalog.regclass
      AND conname = 'fk_manual_deductions_payment'
  ) THEN
    ALTER TABLE public.pyra_manual_deductions
      ADD CONSTRAINT fk_manual_deductions_payment
      FOREIGN KEY (payment_id)
      REFERENCES public.pyra_employee_payments(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_manual_deductions'::pg_catalog.regclass
      AND conname = 'ck_manual_deductions_period_month'
  ) THEN
    ALTER TABLE public.pyra_manual_deductions
      ADD CONSTRAINT ck_manual_deductions_period_month
      CHECK (period_month = pg_catalog.date_trunc('month', period_month::timestamp)::date);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_manual_deductions'::pg_catalog.regclass
      AND conname = 'ck_manual_deductions_amounts'
  ) THEN
    ALTER TABLE public.pyra_manual_deductions
      ADD CONSTRAINT ck_manual_deductions_amounts CHECK (
        salary_snapshot > 0
        AND monthly_cap_percentage BETWEEN 0 AND 100
        AND requested_amount > 0
        AND cap_amount >= 0
        AND prior_approved_amount >= 0
        AND approved_amount > 0
        AND approved_amount = requested_amount
        AND prior_approved_amount + approved_amount <= cap_amount
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_manual_deductions'::pg_catalog.regclass
      AND conname = 'ck_manual_deductions_documentation'
  ) THEN
    ALTER TABLE public.pyra_manual_deductions
      ADD CONSTRAINT ck_manual_deductions_documentation CHECK (
        pg_catalog.btrim(reason) <> ''
        AND pg_catalog.jsonb_typeof(evidence) = 'object'
        AND evidence <> '{}'::jsonb
        AND evidence -> 'schema_version' IS NOT DISTINCT FROM '1'::jsonb
        AND evidence ->> 'source'
          IS NOT DISTINCT FROM 'employee_deductions_admin_approval'
        AND evidence ->> 'basis' IS NOT DISTINCT FROM basis
        AND evidence ->> 'employee_username' IS NOT DISTINCT FROM employee_username
        AND evidence ->> 'report_month'
          IS NOT DISTINCT FROM pg_catalog.to_char(period_month, 'YYYY-MM')
      );
  END IF;
END;
$manual_constraints$;

CREATE INDEX IF NOT EXISTS idx_manual_deductions_employee_month
  ON public.pyra_manual_deductions(employee_username, period_month, salary_currency);

CREATE UNIQUE INDEX IF NOT EXISTS uq_manual_quality_employee_month
  ON public.pyra_manual_deductions(employee_username, period_month)
  WHERE basis = 'quality_repeated_pattern';

ALTER TABLE public.pyra_manual_deductions ENABLE ROW LEVEL SECURITY;

-- A legacy task is a single documented cause. This child ledger prevents the
-- same task from being charged again under a different idempotency key.
CREATE TABLE IF NOT EXISTS public.pyra_manual_deduction_tasks (
  manual_deduction_id varchar(20) NOT NULL,
  task_id varchar(20) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT pyra_manual_deduction_tasks_pkey
    PRIMARY KEY (manual_deduction_id, task_id),
  CONSTRAINT uq_manual_deduction_task UNIQUE (task_id),
  CONSTRAINT fk_manual_deduction_tasks_manual
    FOREIGN KEY (manual_deduction_id)
    REFERENCES public.pyra_manual_deductions(id),
  CONSTRAINT fk_manual_deduction_tasks_task
    FOREIGN KEY (task_id)
    REFERENCES public.pyra_tasks(id)
);

ALTER TABLE public.pyra_manual_deduction_tasks ENABLE ROW LEVEL SECURITY;

-- Migration 041 assumed its computed case was the only deduction in a month.
-- Existing cases can be backfilled with prior=0 only when the ledger proves
-- there was no other same-month deduction; otherwise abort for manual audit.
DO $case_cap_preflight$
BEGIN
  -- Migration 041 capped attendance together with disciplinary money. Never
  -- reinterpret or increase an already-approved payment silently; any such
  -- historical case needs an owner-visible classification before this policy
  -- can be installed.
  IF EXISTS (
    SELECT 1
    FROM public.pyra_deduction_cases
    WHERE attendance_amount > 0
      AND approved_amount IS DISTINCT FROM pg_catalog.round(
        attendance_amount + LEAST(delivery_amount + quality_amount, cap_amount),
        2
      )
  ) THEN
    RAISE EXCEPTION 'deduction_attendance_cap_classification_required';
  END IF;

  -- Quality money belongs exclusively to the documented manual workflow. A
  -- pre-existing computed quality charge needs an explicit audit before this
  -- ownership invariant can be installed.
  IF EXISTS (
    SELECT 1
    FROM public.pyra_deduction_cases
    WHERE quality_amount IS DISTINCT FROM 0
  ) THEN
    RAISE EXCEPTION 'deduction_quality_case_classification_required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_deduction_cases AS deduction_case
    LEFT JOIN public.pyra_employee_payments AS own_payment
      ON own_payment.id = deduction_case.payment_id
    WHERE own_payment.id IS NULL
       OR own_payment.username IS DISTINCT FROM deduction_case.employee_username
       OR own_payment.source_type IS DISTINCT FROM 'deduction'
       OR own_payment.source_id IS DISTINCT FROM deduction_case.id
       OR own_payment.effective_month IS DISTINCT FROM deduction_case.period_month
       OR own_payment.currency IS DISTINCT FROM deduction_case.salary_currency
       OR pg_catalog.round(own_payment.amount, 2) IS DISTINCT FROM deduction_case.approved_amount
       OR own_payment.deduction_cap_exempt_amount IS DISTINCT FROM 0
       OR (
         own_payment.status IS DISTINCT FROM 'approved'
         AND own_payment.status IS DISTINCT FROM 'paid'
       )
  ) OR EXISTS (
    SELECT 1
    FROM public.pyra_deduction_cases AS deduction_case
    JOIN public.pyra_employee_payments AS other_payment
      ON other_payment.username = deduction_case.employee_username
     AND other_payment.source_type = 'deduction'
      AND other_payment.id <> deduction_case.payment_id
     AND other_payment.status IN ('pending', 'approved', 'paid')
     AND (
       other_payment.effective_month = deduction_case.period_month
       OR other_payment.effective_month IS NULL
     )
  ) THEN
    RAISE EXCEPTION 'Cannot backfill aggregate deduction cap snapshots: existing case ledger requires manual audit';
  END IF;
END;
$case_cap_preflight$;

-- Preserve the approved total exactly. Only cases already matching the new
-- formula reach this point, so this classifies their attendance portion without
-- increasing, decreasing, or reapproving any historical payment.
UPDATE public.pyra_employee_payments AS payment
SET deduction_cap_exempt_amount = deduction_case.attendance_amount
FROM public.pyra_deduction_cases AS deduction_case
WHERE payment.id = deduction_case.payment_id
  AND deduction_case.attendance_amount > 0;

ALTER TABLE public.pyra_deduction_cases
  DROP CONSTRAINT IF EXISTS ck_deduction_cases_approved_formula,
  DROP CONSTRAINT IF EXISTS ck_deduction_cases_approved_cap;

ALTER TABLE public.pyra_deduction_cases
  ADD COLUMN IF NOT EXISTS prior_approved_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS remaining_cap_amount numeric(12,2);

UPDATE public.pyra_deduction_cases
SET prior_approved_amount = 0,
    remaining_cap_amount = cap_amount
WHERE prior_approved_amount IS NULL OR remaining_cap_amount IS NULL;

ALTER TABLE public.pyra_deduction_cases
  ALTER COLUMN prior_approved_amount SET NOT NULL,
  ALTER COLUMN remaining_cap_amount SET NOT NULL;

DO $case_cap_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::pg_catalog.regclass
      AND conname = 'ck_deduction_cases_remaining_cap'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_remaining_cap CHECK (
        prior_approved_amount >= 0
        AND remaining_cap_amount = GREATEST(
          0::numeric,
          pg_catalog.round(cap_amount - prior_approved_amount, 2)
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::pg_catalog.regclass
      AND conname = 'ck_deduction_cases_approved_formula'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_approved_formula CHECK (
        approved_amount = pg_catalog.round(
          attendance_amount
          + LEAST(delivery_amount + quality_amount, remaining_cap_amount),
          2
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::pg_catalog.regclass
      AND conname = 'ck_deduction_cases_approved_cap_subject'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_approved_cap_subject CHECK (
        approved_amount >= attendance_amount
        AND pg_catalog.round(approved_amount - attendance_amount, 2)
          <= remaining_cap_amount
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::pg_catalog.regclass
      AND conname = 'ck_deduction_cases_quality_manual_only'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_quality_manual_only CHECK (
        quality_amount = 0
      );
  END IF;
END;
$case_cap_constraints$;

CREATE OR REPLACE FUNCTION public.pyra_commit_payroll_calculation(
  p_payroll_id varchar,
  p_expected_calculated_at timestamptz,
  p_items jsonb,
  p_payment_ids varchar[],
  p_monthly_cap_percentage numeric
)
RETURNS TABLE(status text, changed boolean, run_data jsonb, items_data jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
  v_run public.pyra_payroll_runs%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_month_start date;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_payment_ids varchar[] := COALESCE(p_payment_ids, ARRAY[]::varchar[]);
  v_total numeric(14,2);
  v_count integer;
  v_items jsonb;
BEGIN
  -- Reject non-object item arrays before jsonb_to_recordset, then lock every
  -- referenced employee first. Computed/manual deductions use the same
  -- user -> run -> payment order, preventing a salary-change race or deadlock.
  IF pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RETURN QUERY SELECT 'invalid_payload'::text, false, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_items) AS item(value)
    WHERE pg_catalog.jsonb_typeof(item.value) IS DISTINCT FROM 'object'
  ) THEN
    RETURN QUERY SELECT 'invalid_payload'::text, false, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM employee.username
  FROM public.pyra_users AS employee
  WHERE employee.username IN (
    SELECT item.username
    FROM pg_catalog.jsonb_to_recordset(p_items) AS item(username varchar)
    WHERE item.username IS NOT NULL
  )
  ORDER BY employee.username
  FOR UPDATE;

  SELECT pr.*
  INTO v_run
  FROM public.pyra_payroll_runs AS pr
  WHERE pr.id = p_payroll_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, false, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF v_run.status IS DISTINCT FROM 'draft'
     AND v_run.status IS DISTINCT FROM 'calculated' THEN
    RETURN QUERY SELECT 'invalid_status'::text, false, pg_catalog.to_jsonb(v_run), NULL::jsonb;
    RETURN;
  END IF;

  IF v_run.calculated_at IS DISTINCT FROM p_expected_calculated_at THEN
    RETURN QUERY SELECT 'stale_calculation'::text, false, pg_catalog.to_jsonb(v_run), NULL::jsonb;
    RETURN;
  END IF;

  IF pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR p_monthly_cap_percentage IS NULL
     OR p_monthly_cap_percentage < 0
     OR p_monthly_cap_percentage > 100
     OR pg_catalog.cardinality(v_payment_ids) IS DISTINCT FROM (
       SELECT pg_catalog.count(DISTINCT id)::integer
       FROM pg_catalog.unnest(v_payment_ids) AS ids(id)
     ) THEN
    RETURN QUERY SELECT 'invalid_payload'::text, false, pg_catalog.to_jsonb(v_run), NULL::jsonb;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_items) AS item(
      id varchar,
      username varchar,
      salary_snapshot numeric,
      base_salary numeric,
      task_payments numeric,
      overtime_amount numeric,
      bonus numeric,
      commission numeric,
      monetary_deductions numeric,
      unpaid_leave_deductions numeric,
      deductions numeric,
      deduction_details jsonb,
      net_pay numeric
    )
    WHERE item.id IS NULL
       OR pg_catalog.btrim(item.id) = ''
       OR pg_catalog.length(item.id) > 20
       OR item.username IS NULL
       OR pg_catalog.btrim(item.username) = ''
       OR item.salary_snapshot IS NULL OR item.salary_snapshot < 0
       OR item.base_salary IS NULL OR item.base_salary < 0
       OR item.task_payments IS NULL OR item.task_payments < 0
       OR item.overtime_amount IS NULL OR item.overtime_amount < 0
       OR item.bonus IS NULL OR item.bonus < 0
       OR item.commission IS NULL OR item.commission < 0
       OR item.monetary_deductions IS NULL OR item.monetary_deductions < 0
       OR item.unpaid_leave_deductions IS NULL OR item.unpaid_leave_deductions < 0
       OR item.deductions IS NULL OR item.deductions < 0
       OR item.net_pay IS NULL OR item.net_pay < 0
       OR pg_catalog.jsonb_typeof(item.deduction_details) IS DISTINCT FROM 'array'
       OR pg_catalog.round(item.deductions, 2) IS DISTINCT FROM pg_catalog.round(
         item.monetary_deductions + item.unpaid_leave_deductions,
         2
       )
  ) OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.jsonb_to_recordset(p_items) AS item(id varchar)
  ) IS DISTINCT FROM (
    SELECT pg_catalog.count(DISTINCT item.id)
    FROM pg_catalog.jsonb_to_recordset(p_items) AS item(id varchar)
  ) OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.jsonb_to_recordset(p_items) AS item(username varchar)
  ) IS DISTINCT FROM (
    SELECT pg_catalog.count(DISTINCT item.username)
    FROM pg_catalog.jsonb_to_recordset(p_items) AS item(username varchar)
  ) THEN
    RETURN QUERY SELECT 'invalid_payload'::text, false, pg_catalog.to_jsonb(v_run), NULL::jsonb;
    RETURN;
  END IF;

  v_month_start := pg_catalog.make_date(v_run.year, v_run.month, 1);
  v_period_start := v_month_start::timestamp AT TIME ZONE 'Asia/Dubai';
  v_period_end := (v_month_start + INTERVAL '1 month')::timestamp AT TIME ZONE 'Asia/Dubai';

  -- Lock both the old links and every requested new link in deterministic order.
  PERFORM ep.id
  FROM public.pyra_employee_payments AS ep
  WHERE ep.payroll_id = p_payroll_id
     OR ep.id = ANY(v_payment_ids)
     OR (
       ep.source_type <> 'final_settlement'
       AND (
          (ep.source_type = 'deduction' AND ep.effective_month = v_month_start)
          OR (
            ep.source_type <> 'deduction'
            AND
            ep.effective_month IS NULL
            AND ep.created_at >= v_period_start
           AND ep.created_at < v_period_end
         )
       )
     )
  ORDER BY ep.id
  FOR UPDATE;

  -- Every requested item must still describe an active employee in the run's
  -- current currency and salary. A status/currency/salary change is a conflict,
  -- never a silent skip or automatic carry-forward.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_items) AS item(
      username varchar,
      salary_snapshot numeric
    )
    LEFT JOIN public.pyra_users AS u ON u.username = item.username
    WHERE u.username IS NULL
       OR u.status IS DISTINCT FROM 'active'
       OR COALESCE(u.salary_currency, 'AED')
          IS DISTINCT FROM COALESCE(v_run.currency, 'AED')
       OR pg_catalog.round(COALESCE(u.salary, 0), 2)
          IS DISTINCT FROM pg_catalog.round(item.salary_snapshot, 2)
  ) THEN
    RETURN QUERY SELECT 'blocked_input'::text, false, pg_catalog.to_jsonb(v_run), NULL::jsonb;
    RETURN;
  END IF;

  -- A payment currency conflicts with the employee payroll run when it belongs
  -- to this period and employee but cannot be included without cross-currency
  -- summing. Block for explicit correction instead of warning and skipping it.
  IF EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments AS ep
    WHERE ep.status = 'approved'
      AND ep.source_type <> 'final_settlement'
      AND (ep.payroll_id IS NULL OR ep.payroll_id = p_payroll_id)
      AND COALESCE(ep.currency, 'AED') IS DISTINCT FROM COALESCE(v_run.currency, 'AED')
      AND (
        (ep.source_type = 'deduction' AND ep.effective_month = v_month_start)
        OR (
          ep.source_type <> 'deduction'
          AND
          ep.effective_month IS NULL
          AND ep.created_at >= v_period_start
          AND ep.created_at < v_period_end
        )
      )
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_to_recordset(p_items) AS item(username varchar)
        WHERE item.username = ep.username
      )
  ) THEN
    RETURN QUERY SELECT 'blocked_input'::text, false, pg_catalog.to_jsonb(v_run), NULL::jsonb;
    RETURN;
  END IF;

  -- The submitted IDs must be the exact current set for this run/currency/month.
  -- This rejects missing, newly-added, linked-to-another-run, inactive-user and
  -- stale-period inputs without mutating the previous calculation.
  IF EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments AS ep
    WHERE ep.status = 'approved'
      AND ep.source_type <> 'final_settlement'
      AND (ep.payroll_id IS NULL OR ep.payroll_id = p_payroll_id)
      AND COALESCE(ep.currency, 'AED') = COALESCE(v_run.currency, 'AED')
      AND (
        (ep.source_type = 'deduction' AND ep.effective_month = v_month_start)
        OR (
          ep.source_type <> 'deduction'
          AND
          ep.effective_month IS NULL
          AND ep.created_at >= v_period_start
          AND ep.created_at < v_period_end
        )
      )
      AND NOT (ep.id = ANY(v_payment_ids))
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(v_payment_ids) AS ids(id)
    LEFT JOIN public.pyra_employee_payments AS ep ON ep.id = ids.id
    WHERE ep.id IS NULL
       OR ep.status IS DISTINCT FROM 'approved'
       OR (ep.payroll_id IS NOT NULL AND ep.payroll_id IS DISTINCT FROM p_payroll_id)
       OR ep.source_type = 'final_settlement'
       OR COALESCE(ep.currency, 'AED') IS DISTINCT FROM COALESCE(v_run.currency, 'AED')
       OR NOT (
          (ep.source_type = 'deduction' AND ep.effective_month = v_month_start)
          OR (
            ep.source_type <> 'deduction'
            AND
            ep.effective_month IS NULL
            AND ep.created_at >= v_period_start
           AND ep.created_at < v_period_end
         )
       )
       OR NOT EXISTS (
         SELECT 1
         FROM pg_catalog.jsonb_to_recordset(p_items) AS item(username varchar)
         WHERE item.username = ep.username
       )
  ) OR EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments AS ep
    WHERE ep.payroll_id = p_payroll_id
      AND NOT (ep.id = ANY(v_payment_ids))
  ) THEN
    RETURN QUERY SELECT 'blocked_input'::text, false, pg_catalog.to_jsonb(v_run), NULL::jsonb;
    RETURN;
  END IF;

  -- The TypeScript pure core remains the payroll-math source. This database
  -- check only proves that every linked deduction ledger amount was actually
  -- applied to the submitted item. A legacy over-cap ledger must be corrected;
  -- it is never silently linked and later marked paid at a smaller amount.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_items) AS item(
      username varchar,
      salary_snapshot numeric,
      monetary_deductions numeric
    )
    CROSS JOIN LATERAL (
      SELECT
        COALESCE(pg_catalog.round(pg_catalog.sum(ep.amount), 2), 0)
          AS v_linked_deduction_amount,
        COALESCE(pg_catalog.round(pg_catalog.sum(
          GREATEST(0::numeric, ep.amount - ep.deduction_cap_exempt_amount)
        ), 2), 0) AS v_linked_cap_subject_amount
      FROM public.pyra_employee_payments AS ep
      WHERE ep.id = ANY(v_payment_ids)
        AND ep.username = item.username
        AND ep.source_type = 'deduction'
    ) AS deduction_ledger
    WHERE pg_catalog.round(item.monetary_deductions, 2)
      IS DISTINCT FROM deduction_ledger.v_linked_deduction_amount
      OR deduction_ledger.v_linked_cap_subject_amount > pg_catalog.round(
        item.salary_snapshot * p_monthly_cap_percentage / 100,
        2
      )
  ) THEN
    RETURN QUERY SELECT 'blocked_input'::text, false, pg_catalog.to_jsonb(v_run), NULL::jsonb;
    RETURN;
  END IF;

  DELETE FROM public.pyra_payroll_items WHERE payroll_id = p_payroll_id;

  INSERT INTO public.pyra_deduction_write_capabilities (
    transaction_id, payment_id, operation
  )
  SELECT pg_catalog.pg_current_xact_id()::text::bigint, ep.id, 'update'
  FROM public.pyra_employee_payments AS ep
  WHERE ep.payroll_id = p_payroll_id
    AND ep.source_type = 'deduction'
  ON CONFLICT DO NOTHING;

  UPDATE public.pyra_employee_payments
  SET payroll_id = NULL
  WHERE payroll_id = p_payroll_id;

  DELETE FROM public.pyra_deduction_write_capabilities
  WHERE transaction_id = pg_catalog.pg_current_xact_id()::text::bigint
    AND operation = 'update';

  INSERT INTO public.pyra_payroll_items (
    id,
    payroll_id,
    username,
    base_salary,
    task_payments,
    overtime_amount,
    bonus,
    commission,
    deductions,
    deduction_details,
    net_pay,
    currency,
    status
  )
  SELECT
    item.id,
    p_payroll_id,
    item.username,
    pg_catalog.round(item.base_salary, 2),
    pg_catalog.round(item.task_payments, 2),
    pg_catalog.round(item.overtime_amount, 2),
    pg_catalog.round(item.bonus, 2),
    pg_catalog.round(item.commission, 2),
    pg_catalog.round(item.deductions, 2),
    item.deduction_details,
    pg_catalog.round(item.net_pay, 2),
    COALESCE(v_run.currency, 'AED'),
    'pending'
  FROM pg_catalog.jsonb_to_recordset(p_items) AS item(
    id varchar,
    username varchar,
    base_salary numeric,
    task_payments numeric,
    overtime_amount numeric,
    bonus numeric,
    commission numeric,
    deductions numeric,
    deduction_details jsonb,
    net_pay numeric
  );

  IF pg_catalog.cardinality(v_payment_ids) > 0 THEN
    INSERT INTO public.pyra_deduction_write_capabilities (
      transaction_id, payment_id, operation
    )
    SELECT pg_catalog.pg_current_xact_id()::text::bigint, ep.id, 'update'
    FROM public.pyra_employee_payments AS ep
    WHERE ep.id = ANY(v_payment_ids)
      AND ep.source_type = 'deduction'
    ON CONFLICT DO NOTHING;

    UPDATE public.pyra_employee_payments
    SET payroll_id = p_payroll_id
    WHERE id = ANY(v_payment_ids);

    DELETE FROM public.pyra_deduction_write_capabilities
    WHERE transaction_id = pg_catalog.pg_current_xact_id()::text::bigint
      AND operation = 'update';
  END IF;

  SELECT
    COALESCE(pg_catalog.round(pg_catalog.sum(pi.net_pay), 2), 0),
    pg_catalog.count(*)::integer
  INTO v_total, v_count
  FROM public.pyra_payroll_items AS pi
  WHERE pi.payroll_id = p_payroll_id;

  UPDATE public.pyra_payroll_runs
  SET total_amount = v_total,
      employee_count = v_count,
      status = 'calculated',
      calculated_at = v_now
  WHERE id = p_payroll_id
  RETURNING * INTO v_run;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(pi) ORDER BY pi.username),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.pyra_payroll_items AS pi
  WHERE pi.payroll_id = p_payroll_id;

  RETURN QUERY SELECT 'ok'::text, true, pg_catalog.to_jsonb(v_run), v_items;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pyra_delete_draft_payroll_run(
  p_payroll_id varchar
)
RETURNS TABLE(status text, changed boolean, run_data jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
  v_run public.pyra_payroll_runs%ROWTYPE;
BEGIN
  SELECT pr.*
  INTO v_run
  FROM public.pyra_payroll_runs AS pr
  WHERE pr.id = p_payroll_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, false, NULL::jsonb;
    RETURN;
  END IF;

  IF v_run.status IS DISTINCT FROM 'draft' THEN
    RETURN QUERY SELECT 'invalid_status'::text, false, pg_catalog.to_jsonb(v_run);
    RETURN;
  END IF;

  PERFORM ep.id
  FROM public.pyra_employee_payments AS ep
  WHERE ep.payroll_id = p_payroll_id
  ORDER BY ep.id
  FOR UPDATE;

  PERFORM pi.id
  FROM public.pyra_payroll_items AS pi
  WHERE pi.payroll_id = p_payroll_id
  ORDER BY pi.username
  FOR UPDATE;

  PERFORM expense.id
  FROM public.pyra_expenses AS expense
  WHERE expense.payroll_run_id = p_payroll_id
  ORDER BY expense.id
  FOR UPDATE;

  INSERT INTO public.pyra_deduction_write_capabilities (
    transaction_id, payment_id, operation
  )
  SELECT pg_catalog.pg_current_xact_id()::text::bigint, ep.id, 'update'
  FROM public.pyra_employee_payments AS ep
  WHERE ep.payroll_id = p_payroll_id
    AND ep.source_type = 'deduction'
  ON CONFLICT DO NOTHING;

  UPDATE public.pyra_employee_payments
  SET payroll_id = NULL
  WHERE payroll_id = p_payroll_id;

  DELETE FROM public.pyra_deduction_write_capabilities
  WHERE transaction_id = pg_catalog.pg_current_xact_id()::text::bigint
    AND operation = 'update';

  DELETE FROM public.pyra_expenses WHERE payroll_run_id = p_payroll_id;
  DELETE FROM public.pyra_payroll_items WHERE payroll_id = p_payroll_id;
  DELETE FROM public.pyra_payroll_runs WHERE id = p_payroll_id;

  RETURN QUERY SELECT 'ok'::text, true, pg_catalog.to_jsonb(v_run);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pyra_approve_employee_payment(
  p_payment_id varchar,
  p_approved_by varchar
)
RETURNS TABLE(status text, changed boolean, payment_data jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
  v_snapshot public.pyra_employee_payments%ROWTYPE;
  v_payment public.pyra_employee_payments%ROWTYPE;
  v_period_month date;
  v_period_currency varchar(3);
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF p_payment_id IS NULL
     OR pg_catalog.btrim(p_payment_id) = ''
     OR p_approved_by IS NULL
     OR pg_catalog.btrim(p_approved_by) = '' THEN
    RETURN QUERY SELECT 'invalid_payload'::text, false, NULL::jsonb;
    RETURN;
  END IF;

  -- Read only the immutable lock key first. Both this function and payroll-run
  -- approval acquire the run row before the payment row, closing the race.
  SELECT payment.*
  INTO v_snapshot
  FROM public.pyra_employee_payments AS payment
  WHERE payment.id = p_payment_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, false, NULL::jsonb;
    RETURN;
  END IF;

  IF v_snapshot.source_type = 'deduction' THEN
    RETURN QUERY SELECT 'direct_pay_disallowed'::text, false, pg_catalog.to_jsonb(v_snapshot);
    RETURN;
  END IF;

  IF v_snapshot.source_type <> 'final_settlement'
     AND v_snapshot.effective_month IS NOT NULL THEN
    RETURN QUERY SELECT 'integrity_conflict'::text, false, pg_catalog.to_jsonb(v_snapshot);
    RETURN;
  END IF;

  v_period_month := pg_catalog.date_trunc(
    'month',
    v_snapshot.created_at AT TIME ZONE 'Asia/Dubai'
  )::date;
  v_period_currency := COALESCE(v_snapshot.currency, 'AED');

  PERFORM payroll.id
  FROM public.pyra_payroll_runs AS payroll
  WHERE payroll.year = EXTRACT(year FROM v_period_month)::integer
    AND payroll.month = EXTRACT(month FROM v_period_month)::integer
    AND COALESCE(payroll.currency, 'AED') = v_period_currency
  ORDER BY payroll.id
  FOR UPDATE;

  SELECT payment.*
  INTO v_payment
  FROM public.pyra_employee_payments AS payment
  WHERE payment.id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, false, NULL::jsonb;
    RETURN;
  END IF;

  IF v_payment.source_type IS DISTINCT FROM v_snapshot.source_type
     OR v_payment.username IS DISTINCT FROM v_snapshot.username
     OR v_payment.created_at IS DISTINCT FROM v_snapshot.created_at
     OR v_payment.effective_month IS DISTINCT FROM v_snapshot.effective_month
     OR COALESCE(v_payment.currency, 'AED') IS DISTINCT FROM v_period_currency
     OR v_payment.amount IS DISTINCT FROM v_snapshot.amount
     OR v_payment.payroll_id IS DISTINCT FROM v_snapshot.payroll_id THEN
    RETURN QUERY SELECT 'integrity_conflict'::text, false, pg_catalog.to_jsonb(v_payment);
    RETURN;
  END IF;

  IF v_payment.status = 'approved' THEN
    RETURN QUERY SELECT 'already_approved'::text, false, pg_catalog.to_jsonb(v_payment);
    RETURN;
  END IF;

  IF v_payment.status IS DISTINCT FROM 'pending' OR v_payment.payroll_id IS NOT NULL THEN
    RETURN QUERY SELECT 'invalid_status'::text, false, pg_catalog.to_jsonb(v_payment);
    RETURN;
  END IF;

  -- payment_approval_closed_payroll_period: no new monthly payment can become
  -- approved after the matching run has been approved or paid.
  IF v_payment.source_type <> 'final_settlement'
     AND EXISTS (
       SELECT 1
       FROM public.pyra_payroll_runs AS payroll
       WHERE payroll.year = EXTRACT(year FROM v_period_month)::integer
         AND payroll.month = EXTRACT(month FROM v_period_month)::integer
         AND COALESCE(payroll.currency, 'AED') = v_period_currency
         AND payroll.status IN ('approved', 'paid')
     ) THEN
    RETURN QUERY SELECT 'closed_period'::text, false, pg_catalog.to_jsonb(v_payment);
    RETURN;
  END IF;

  UPDATE public.pyra_employee_payments AS payment
  SET status = 'approved',
      approved_by = p_approved_by,
      approved_at = v_now
  WHERE payment.id = p_payment_id
    AND payment.status = 'pending'
  RETURNING payment.* INTO v_payment;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'integrity_conflict'::text, false, NULL::jsonb;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'ok'::text, true, pg_catalog.to_jsonb(v_payment);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pyra_pay_employee_payment(
  p_payment_id varchar
)
RETURNS TABLE(status text, changed boolean, payment_data jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
  v_payment public.pyra_employee_payments%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task public.pyra_tasks%ROWTYPE;
BEGIN
  SELECT ep.*
  INTO v_payment
  FROM public.pyra_employee_payments AS ep
  WHERE ep.id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, false, NULL::jsonb;
    RETURN;
  END IF;

  IF v_payment.payroll_id IS NOT NULL THEN
    RETURN QUERY SELECT 'payment_linked'::text, false, pg_catalog.to_jsonb(v_payment);
    RETURN;
  END IF;

  IF v_payment.source_type = 'deduction' THEN
    RETURN QUERY SELECT 'direct_pay_disallowed'::text, false, pg_catalog.to_jsonb(v_payment);
    RETURN;
  END IF;

  IF v_payment.status = 'paid' THEN
    RETURN QUERY SELECT 'already_paid'::text, false, pg_catalog.to_jsonb(v_payment);
    RETURN;
  END IF;

  IF v_payment.status IS DISTINCT FROM 'approved' THEN
    RETURN QUERY SELECT 'invalid_status'::text, false, pg_catalog.to_jsonb(v_payment);
    RETURN;
  END IF;

  IF v_payment.source_type = 'task' THEN
    IF v_payment.source_id IS NULL THEN
      RETURN QUERY SELECT 'integrity_conflict'::text, false, pg_catalog.to_jsonb(v_payment);
      RETURN;
    END IF;

    SELECT task.*
    INTO v_task
    FROM public.pyra_tasks AS task
    WHERE task.id = v_payment.source_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT 'integrity_conflict'::text, false, pg_catalog.to_jsonb(v_payment);
      RETURN;
    END IF;
  END IF;

  UPDATE public.pyra_employee_payments
  SET status = 'paid',
      paid_at = v_now
  WHERE id = p_payment_id
  RETURNING * INTO v_payment;

  IF v_payment.source_type = 'task' THEN
    UPDATE public.pyra_tasks
    SET payment_status = 'paid',
        updated_at = v_now
    WHERE id = v_payment.source_id;
  END IF;

  RETURN QUERY SELECT 'ok'::text, true, pg_catalog.to_jsonb(v_payment);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pyra_pay_payroll_run(
  p_payroll_id varchar,
  p_notes text
)
RETURNS TABLE(status text, changed boolean, run_data jsonb, items_data jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
  v_run public.pyra_payroll_runs%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_items jsonb;
  v_item_count integer;
  v_item_total numeric(14,2);
  v_month_start date;
  v_period_start timestamptz;
  v_period_end timestamptz;
BEGIN
  SELECT pr.*
  INTO v_run
  FROM public.pyra_payroll_runs AS pr
  WHERE pr.id = p_payroll_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, false, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF v_run.status = 'paid' THEN
    SELECT COALESCE(
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(pi) ORDER BY pi.username),
      '[]'::jsonb
    ) INTO v_items
    FROM public.pyra_payroll_items AS pi
    WHERE pi.payroll_id = p_payroll_id;
    RETURN QUERY SELECT 'already_paid'::text, false, pg_catalog.to_jsonb(v_run), v_items;
    RETURN;
  END IF;

  IF v_run.status IS DISTINCT FROM 'approved' THEN
    RETURN QUERY SELECT 'invalid_status'::text, false, pg_catalog.to_jsonb(v_run), NULL::jsonb;
    RETURN;
  END IF;

  v_month_start := pg_catalog.make_date(v_run.year, v_run.month, 1);
  v_period_start := v_month_start::timestamp AT TIME ZONE 'Asia/Dubai';
  v_period_end := (v_month_start + INTERVAL '1 month')::timestamp AT TIME ZONE 'Asia/Dubai';

  PERFORM pi.id
  FROM public.pyra_payroll_items AS pi
  WHERE pi.payroll_id = p_payroll_id
  ORDER BY pi.username
  FOR UPDATE;

  PERFORM ep.id
  FROM public.pyra_employee_payments AS ep
  WHERE ep.payroll_id = p_payroll_id
     OR (
       ep.status = 'approved'
       AND ep.source_type <> 'final_settlement'
       AND COALESCE(ep.currency, 'AED') = COALESCE(v_run.currency, 'AED')
       AND (
         (ep.source_type = 'deduction' AND ep.effective_month = v_month_start)
         OR (
           ep.source_type <> 'deduction'
           AND
           ep.effective_month IS NULL
           AND ep.created_at >= v_period_start
           AND ep.created_at < v_period_end
         )
       )
     )
  ORDER BY ep.id
  FOR UPDATE;

  PERFORM task.id
  FROM public.pyra_tasks AS task
  WHERE task.id IN (
    SELECT ep.source_id
    FROM public.pyra_employee_payments AS ep
    WHERE ep.payroll_id = p_payroll_id
      AND ep.source_type = 'task'
      AND ep.source_id IS NOT NULL
  )
  ORDER BY task.id
  FOR UPDATE;

  SELECT pg_catalog.count(*)::integer,
         COALESCE(pg_catalog.round(pg_catalog.sum(pi.net_pay), 2), 0)
  INTO v_item_count, v_item_total
  FROM public.pyra_payroll_items AS pi
  WHERE pi.payroll_id = p_payroll_id;

  IF v_item_count IS DISTINCT FROM COALESCE(v_run.employee_count, 0)
     OR v_item_total IS DISTINCT FROM pg_catalog.round(COALESCE(v_run.total_amount, 0), 2)
     OR EXISTS (
       SELECT 1
       FROM public.pyra_payroll_items AS pi
       WHERE pi.payroll_id = p_payroll_id
         AND (
           pi.status IS DISTINCT FROM 'pending'
           OR pi.currency IS DISTINCT FROM COALESCE(v_run.currency, 'AED')
         )
     )
     OR EXISTS (
       SELECT 1
       FROM public.pyra_employee_payments AS ep
       WHERE ep.payroll_id = p_payroll_id
         AND (
           ep.status IS DISTINCT FROM 'approved'
           OR COALESCE(ep.currency, 'AED') IS DISTINCT FROM COALESCE(v_run.currency, 'AED')
           OR NOT EXISTS (
             SELECT 1
             FROM public.pyra_payroll_items AS pi
             WHERE pi.payroll_id = p_payroll_id
               AND pi.username = ep.username
           )
         )
     )
     OR EXISTS (
       SELECT 1
       FROM public.pyra_employee_payments AS ep
       LEFT JOIN public.pyra_tasks AS task ON task.id = ep.source_id
       WHERE ep.payroll_id = p_payroll_id
         AND ep.source_type = 'task'
         AND (ep.source_id IS NULL OR task.id IS NULL)
     )
     OR EXISTS (
       SELECT 1
       FROM public.pyra_employee_payments AS ep
       WHERE ep.status = 'approved'
         AND ep.source_type <> 'final_settlement'
         AND ep.payroll_id IS DISTINCT FROM p_payroll_id
         AND COALESCE(ep.currency, 'AED') = COALESCE(v_run.currency, 'AED')
         AND (
           (ep.source_type = 'deduction' AND ep.effective_month = v_month_start)
           OR (
             ep.source_type <> 'deduction'
             AND
             ep.effective_month IS NULL
             AND ep.created_at >= v_period_start
             AND ep.created_at < v_period_end
           )
         )
     ) THEN
    RETURN QUERY SELECT 'integrity_conflict'::text, false, pg_catalog.to_jsonb(v_run), NULL::jsonb;
    RETURN;
  END IF;

  -- Run first so any database guard can verify the linked payment is being
  -- settled by an already-paid run inside this same transaction.
  UPDATE public.pyra_payroll_runs
  SET status = 'paid',
      paid_at = v_now,
      notes = COALESCE(p_notes, notes)
  WHERE id = p_payroll_id
  RETURNING * INTO v_run;

  UPDATE public.pyra_payroll_items
  SET status = 'paid'
  WHERE payroll_id = p_payroll_id;

  INSERT INTO public.pyra_deduction_write_capabilities (
    transaction_id, payment_id, operation
  )
  SELECT pg_catalog.pg_current_xact_id()::text::bigint, ep.id, 'update'
  FROM public.pyra_employee_payments AS ep
  WHERE ep.payroll_id = p_payroll_id
    AND ep.source_type = 'deduction'
  ON CONFLICT DO NOTHING;

  UPDATE public.pyra_employee_payments
  SET status = 'paid',
      paid_at = v_now
  WHERE payroll_id = p_payroll_id;

  DELETE FROM public.pyra_deduction_write_capabilities
  WHERE transaction_id = pg_catalog.pg_current_xact_id()::text::bigint
    AND operation = 'update';

  UPDATE public.pyra_tasks AS task
  SET payment_status = 'paid',
      updated_at = v_now
  WHERE task.id IN (
    SELECT ep.source_id
    FROM public.pyra_employee_payments AS ep
    WHERE ep.payroll_id = p_payroll_id
      AND ep.source_type = 'task'
      AND ep.source_id IS NOT NULL
  );

  SELECT COALESCE(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(pi) ORDER BY pi.username),
    '[]'::jsonb
  ) INTO v_items
  FROM public.pyra_payroll_items AS pi
  WHERE pi.payroll_id = p_payroll_id;

  RETURN QUERY SELECT 'ok'::text, true, pg_catalog.to_jsonb(v_run), v_items;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pyra_approve_payroll_run(
  p_payroll_id varchar,
  p_expected_calculated_at timestamptz,
  p_approved_by varchar,
  p_notes text,
  p_expenses jsonb
)
RETURNS TABLE(status text, changed boolean, run_data jsonb, items_data jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
  v_run public.pyra_payroll_runs%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_items jsonb;
  v_month_end date;
  v_month_start date;
  v_period_start timestamptz;
  v_period_end timestamptz;
BEGIN
  SELECT pr.*
  INTO v_run
  FROM public.pyra_payroll_runs AS pr
  WHERE pr.id = p_payroll_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, false, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF v_run.status = 'approved' THEN
    SELECT COALESCE(
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(pi) ORDER BY pi.username),
      '[]'::jsonb
    ) INTO v_items
    FROM public.pyra_payroll_items AS pi
    WHERE pi.payroll_id = p_payroll_id;
    RETURN QUERY SELECT 'already_approved'::text, false, pg_catalog.to_jsonb(v_run), v_items;
    RETURN;
  END IF;

  IF v_run.status IS DISTINCT FROM 'calculated' THEN
    RETURN QUERY SELECT 'invalid_status'::text, false, pg_catalog.to_jsonb(v_run), NULL::jsonb;
    RETURN;
  END IF;

  IF v_run.calculated_at IS DISTINCT FROM p_expected_calculated_at THEN
    RETURN QUERY SELECT 'stale_calculation'::text, false, pg_catalog.to_jsonb(v_run), NULL::jsonb;
    RETURN;
  END IF;

  IF pg_catalog.jsonb_typeof(p_expenses) IS DISTINCT FROM 'array'
     OR p_approved_by IS NULL
     OR pg_catalog.btrim(p_approved_by) = '' THEN
    RETURN QUERY SELECT 'invalid_payload'::text, false, pg_catalog.to_jsonb(v_run), NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pi.id
  FROM public.pyra_payroll_items AS pi
  WHERE pi.payroll_id = p_payroll_id
  ORDER BY pi.username
  FOR UPDATE;

  v_month_start := pg_catalog.make_date(v_run.year, v_run.month, 1);
  v_month_end := (v_month_start + INTERVAL '1 month - 1 day')::date;
  v_period_start := v_month_start::timestamp AT TIME ZONE 'Asia/Dubai';
  v_period_end := (v_month_start + INTERVAL '1 month')::timestamp AT TIME ZONE 'Asia/Dubai';

  -- Shared lock order with pyra_approve_employee_payment: run first, then every
  -- payment that can affect this period. The following validation therefore
  -- observes a stable approved-payment set.
  PERFORM payment.id
  FROM public.pyra_employee_payments AS payment
  WHERE payment.payroll_id = p_payroll_id
     OR (
       payment.source_type <> 'final_settlement'
       AND COALESCE(payment.currency, 'AED') = COALESCE(v_run.currency, 'AED')
       AND (
         (payment.source_type = 'deduction' AND payment.effective_month = v_month_start)
         OR (
           payment.source_type <> 'deduction'
           AND payment.effective_month IS NULL
           AND payment.created_at >= v_period_start
           AND payment.created_at < v_period_end
         )
       )
     )
  ORDER BY payment.id
  FOR UPDATE;

  -- A payment approved after calculation must force an explicit recalculation.
  -- Approval never silently omits it from expenses/payroll.
  IF EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments AS payment
    WHERE payment.payroll_id = p_payroll_id
      AND (
        payment.status IS DISTINCT FROM 'approved'
        OR COALESCE(payment.currency, 'AED') IS DISTINCT FROM COALESCE(v_run.currency, 'AED')
        OR NOT EXISTS (
          SELECT 1
          FROM public.pyra_payroll_items AS item
          WHERE item.payroll_id = p_payroll_id
            AND item.username = payment.username
        )
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments AS payment
    WHERE payment.status = 'approved'
      AND payment.source_type <> 'final_settlement'
      AND payment.payroll_id IS DISTINCT FROM p_payroll_id
      AND COALESCE(payment.currency, 'AED') = COALESCE(v_run.currency, 'AED')
      AND (
        (payment.source_type = 'deduction' AND payment.effective_month = v_month_start)
        OR (
          payment.source_type <> 'deduction'
          AND
          payment.effective_month IS NULL
          AND payment.created_at >= v_period_start
          AND payment.created_at < v_period_end
        )
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.pyra_payroll_items AS item
    WHERE item.payroll_id = p_payroll_id
      AND (
        item.status IS DISTINCT FROM 'pending'
        OR item.currency IS DISTINCT FROM COALESCE(v_run.currency, 'AED')
      )
  ) OR (
    SELECT pg_catalog.count(*)::integer
    FROM public.pyra_payroll_items AS item
    WHERE item.payroll_id = p_payroll_id
  ) IS DISTINCT FROM COALESCE(v_run.employee_count, 0) OR (
    SELECT COALESCE(pg_catalog.round(pg_catalog.sum(item.net_pay), 2), 0)
    FROM public.pyra_payroll_items AS item
    WHERE item.payroll_id = p_payroll_id
  ) IS DISTINCT FROM pg_catalog.round(COALESCE(v_run.total_amount, 0), 2) THEN
    RETURN QUERY SELECT 'blocked_input'::text, false, pg_catalog.to_jsonb(v_run), NULL::jsonb;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pyra_expense_categories AS ec WHERE ec.id = 'ec_salaries'
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_expenses) AS expense(
      id varchar,
      username varchar,
      description text,
      amount numeric,
      currency varchar,
      project_id varchar,
      expense_date date,
      vendor text
    )
    LEFT JOIN public.pyra_payroll_items AS pi
      ON pi.payroll_id = p_payroll_id
     AND pi.username = expense.username
    LEFT JOIN public.pyra_projects AS project ON project.id = expense.project_id
    WHERE expense.id IS NULL
       OR pg_catalog.btrim(expense.id) = ''
       OR pg_catalog.length(expense.id) > 20
       OR expense.username IS NULL
       OR pg_catalog.btrim(expense.username) = ''
       OR expense.description IS NULL
       OR pg_catalog.btrim(expense.description) = ''
       OR expense.vendor IS NULL
       OR pg_catalog.btrim(expense.vendor) = ''
       OR expense.amount IS NULL
       OR expense.amount < 0
       OR expense.currency IS DISTINCT FROM COALESCE(v_run.currency, 'AED')
       OR expense.expense_date IS DISTINCT FROM v_month_end
       OR pi.id IS NULL
       OR pg_catalog.round(expense.amount, 2) IS DISTINCT FROM pg_catalog.round(pi.net_pay, 2)
       OR (expense.project_id IS NOT NULL AND project.id IS NULL)
  ) OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.jsonb_to_recordset(p_expenses) AS expense(id varchar)
  ) IS DISTINCT FROM (
    SELECT pg_catalog.count(*)
    FROM public.pyra_payroll_items AS pi
    WHERE pi.payroll_id = p_payroll_id
  ) OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.jsonb_to_recordset(p_expenses) AS expense(id varchar)
  ) IS DISTINCT FROM (
    SELECT pg_catalog.count(DISTINCT expense.id)
    FROM pg_catalog.jsonb_to_recordset(p_expenses) AS expense(id varchar)
  ) OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.jsonb_to_recordset(p_expenses) AS expense(username varchar)
  ) IS DISTINCT FROM (
    SELECT pg_catalog.count(DISTINCT expense.username)
    FROM pg_catalog.jsonb_to_recordset(p_expenses) AS expense(username varchar)
  ) THEN
    RETURN QUERY SELECT 'blocked_input'::text, false, pg_catalog.to_jsonb(v_run), NULL::jsonb;
    RETURN;
  END IF;

  DELETE FROM public.pyra_expenses WHERE payroll_run_id = p_payroll_id;

  INSERT INTO public.pyra_expenses (
    id,
    description,
    amount,
    currency,
    category_id,
    project_id,
    expense_date,
    vendor,
    status,
    payroll_run_id,
    created_by
  )
  SELECT
    expense.id,
    expense.description,
    pg_catalog.round(expense.amount, 2),
    COALESCE(v_run.currency, 'AED'),
    'ec_salaries',
    expense.project_id,
    expense.expense_date,
    expense.vendor,
    'approved',
    p_payroll_id,
    p_approved_by
  FROM pg_catalog.jsonb_to_recordset(p_expenses) AS expense(
    id varchar,
    username varchar,
    description text,
    amount numeric,
    currency varchar,
    project_id varchar,
    expense_date date,
    vendor text
  );

  UPDATE public.pyra_payroll_runs
  SET status = 'approved',
      approved_by = p_approved_by,
      approved_at = v_now,
      notes = COALESCE(p_notes, notes)
  WHERE id = p_payroll_id
  RETURNING * INTO v_run;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(pi) ORDER BY pi.username),
    '[]'::jsonb
  ) INTO v_items
  FROM public.pyra_payroll_items AS pi
  WHERE pi.payroll_id = p_payroll_id;

  RETURN QUERY SELECT 'ok'::text, true, pg_catalog.to_jsonb(v_run), v_items;
END;
$function$;

-- Harden migration 041's computed-case approval so the 25% ceiling applies to
-- the aggregate of already-approved manual and system deduction ledger rows.
CREATE OR REPLACE FUNCTION public.pyra_approve_employee_deduction(
  p_case_id varchar,
  p_payment_id varchar,
  p_employee_username varchar,
  p_period_month date,
  p_salary_snapshot numeric,
  p_salary_currency varchar,
  p_attendance_units numeric,
  p_attendance_amount numeric,
  p_delivery_on_time_pct numeric,
  p_delivery_band varchar,
  p_delivery_amount numeric,
  p_delivery_percentage numeric,
  p_quality_avg_rounds numeric,
  p_quality_outright_rejection_rate numeric,
  p_quality_below_band boolean,
  p_quality_consecutive_months integer,
  p_quality_eligible boolean,
  p_quality_amount numeric,
  p_monthly_cap_percentage numeric,
  p_evidence jsonb,
  p_policy_snapshot jsonb,
  p_admin_note text,
  p_payment_description text,
  p_approved_by varchar
)
RETURNS public.pyra_deduction_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
  v_case public.pyra_deduction_cases%ROWTYPE;
  v_payment public.pyra_employee_payments%ROWTYPE;
  v_user public.pyra_users%ROWTYPE;
  v_timestamp timestamptz := pg_catalog.clock_timestamp();
  v_current_month date := pg_catalog.date_trunc(
    'month',
    pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Dubai'
  )::date;
  v_salary_snapshot numeric(12,2) := pg_catalog.round(p_salary_snapshot, 2);
  v_attendance_amount numeric(12,2) := pg_catalog.round(p_attendance_amount, 2);
  v_delivery_amount numeric(12,2) := pg_catalog.round(p_delivery_amount, 2);
  v_quality_amount numeric(12,2) := pg_catalog.round(p_quality_amount, 2);
  v_monthly_cap_percentage numeric(5,2) := pg_catalog.round(p_monthly_cap_percentage, 2);
  v_requested_amount numeric(12,2);
  v_cap_subject_requested_amount numeric(12,2);
  v_cap_amount numeric(12,2);
  v_prior_approved_amount numeric(12,2);
  v_remaining_cap_amount numeric(12,2);
  v_approved_amount numeric(12,2);
BEGIN
  -- Current-month computed totals are still mutable. Reject before any existing
  -- case/user/payroll lookup so this temporary policy is deterministic.
  IF p_period_month = v_current_month THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'deduction_current_period';
  END IF;

  -- The unique computed case is the idempotency key. Validate its payment
  -- linkage before returning; never recreate or reinterpret the month.
  SELECT deduction_case.*
  INTO v_case
  FROM public.pyra_deduction_cases AS deduction_case
  WHERE deduction_case.employee_username = p_employee_username
    AND deduction_case.period_month = p_period_month
  FOR UPDATE;

  IF FOUND THEN
    SELECT payment.*
    INTO v_payment
    FROM public.pyra_employee_payments AS payment
    WHERE payment.id = v_case.payment_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_payment.username IS DISTINCT FROM v_case.employee_username
       OR v_payment.source_type IS DISTINCT FROM 'deduction'
       OR v_payment.source_id IS DISTINCT FROM v_case.id
       OR v_payment.effective_month IS DISTINCT FROM v_case.period_month
       OR v_payment.currency IS DISTINCT FROM v_case.salary_currency
       OR pg_catalog.round(v_payment.amount, 2) IS DISTINCT FROM v_case.approved_amount
       OR pg_catalog.round(v_payment.deduction_cap_exempt_amount, 2)
          IS DISTINCT FROM v_case.attendance_amount
       OR (
         v_payment.status IS DISTINCT FROM 'approved'
         AND v_payment.status IS DISTINCT FROM 'paid'
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'deduction_case_integrity_conflict';
    END IF;

    RETURN v_case;
  END IF;

  IF p_case_id IS NULL
     OR pg_catalog.btrim(p_case_id) = ''
     OR pg_catalog.length(p_case_id) > 20
     OR p_payment_id IS NULL
     OR pg_catalog.btrim(p_payment_id) = ''
     OR pg_catalog.length(p_payment_id) > 20
     OR p_employee_username IS NULL
     OR pg_catalog.btrim(p_employee_username) = ''
     OR p_period_month IS NULL
     OR p_period_month IS DISTINCT FROM
        pg_catalog.date_trunc('month', p_period_month::timestamp)::date
     OR v_salary_snapshot IS NULL
     OR v_salary_snapshot <= 0
     OR p_salary_currency IS NULL
     OR pg_catalog.length(p_salary_currency) <> 3
     OR v_attendance_amount IS NULL
     OR v_attendance_amount < 0
     OR v_delivery_amount IS NULL
     OR v_delivery_amount < 0
     OR v_quality_amount IS DISTINCT FROM 0
     OR v_monthly_cap_percentage IS NULL
     OR v_monthly_cap_percentage < 0
     OR v_monthly_cap_percentage > 100
     OR pg_catalog.jsonb_typeof(p_evidence) IS DISTINCT FROM 'object'
     OR p_evidence = '{}'::jsonb
     OR pg_catalog.jsonb_typeof(p_policy_snapshot) IS DISTINCT FROM 'object'
     OR p_payment_description IS NULL
     OR pg_catalog.btrim(p_payment_description) = ''
     OR p_approved_by IS NULL
     OR pg_catalog.btrim(p_approved_by) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_deduction_payload';
  END IF;

  v_requested_amount := pg_catalog.round(
    v_attendance_amount + v_delivery_amount + v_quality_amount,
    2
  );
  v_cap_subject_requested_amount := pg_catalog.round(
    v_delivery_amount + v_quality_amount,
    2
  );
  IF v_requested_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'zero_deduction_not_approvable';
  END IF;

  IF p_period_month > v_current_month THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'deduction_future_period';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'payroll_deduction_cap:' || p_employee_username || ':' ||
      p_period_month::text,
      46046
    )
  );

  -- Recheck after the absent-row advisory lock for a concurrent idempotent call.
  SELECT deduction_case.*
  INTO v_case
  FROM public.pyra_deduction_cases AS deduction_case
  WHERE deduction_case.employee_username = p_employee_username
    AND deduction_case.period_month = p_period_month
  FOR UPDATE;
  IF FOUND THEN
    SELECT payment.*
    INTO v_payment
    FROM public.pyra_employee_payments AS payment
    WHERE payment.id = v_case.payment_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_payment.username IS DISTINCT FROM v_case.employee_username
       OR v_payment.source_type IS DISTINCT FROM 'deduction'
       OR v_payment.source_id IS DISTINCT FROM v_case.id
       OR v_payment.effective_month IS DISTINCT FROM v_case.period_month
       OR v_payment.currency IS DISTINCT FROM v_case.salary_currency
       OR pg_catalog.round(v_payment.amount, 2) IS DISTINCT FROM v_case.approved_amount
       OR pg_catalog.round(v_payment.deduction_cap_exempt_amount, 2)
          IS DISTINCT FROM v_case.attendance_amount
       OR (
         v_payment.status IS DISTINCT FROM 'approved'
         AND v_payment.status IS DISTINCT FROM 'paid'
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'deduction_case_integrity_conflict';
    END IF;

    RETURN v_case;
  END IF;

  SELECT employee.*
  INTO v_user
  FROM public.pyra_users AS employee
  WHERE employee.username = p_employee_username
  FOR UPDATE;
  IF NOT FOUND
     OR v_user.role IS DISTINCT FROM 'employee'
     OR v_user.status IS DISTINCT FROM 'active'
     OR v_user.salary_currency IS DISTINCT FROM p_salary_currency
     OR pg_catalog.round(COALESCE(v_user.salary, 0), 2) IS DISTINCT FROM v_salary_snapshot THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'deduction_employee_state_conflict';
  END IF;

  PERFORM payroll.id
  FROM public.pyra_payroll_runs AS payroll
  WHERE payroll.year = EXTRACT(year FROM p_period_month)::integer
    AND payroll.month = EXTRACT(month FROM p_period_month)::integer
    AND COALESCE(payroll.currency, 'AED') = COALESCE(p_salary_currency, 'AED')
  ORDER BY payroll.id
  FOR UPDATE;
  IF EXISTS (
    SELECT 1
    FROM public.pyra_payroll_runs AS payroll
    WHERE payroll.year = EXTRACT(year FROM p_period_month)::integer
      AND payroll.month = EXTRACT(month FROM p_period_month)::integer
      AND COALESCE(payroll.currency, 'AED') = COALESCE(p_salary_currency, 'AED')
      AND payroll.status IN ('approved', 'paid')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'deduction_closed_period';
  END IF;

  PERFORM payment.id
  FROM public.pyra_employee_payments AS payment
  WHERE payment.username = p_employee_username
    AND payment.source_type = 'deduction'
    AND (payment.effective_month = p_period_month OR payment.effective_month IS NULL)
  ORDER BY payment.id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments AS payment
    WHERE payment.username = p_employee_username
      AND payment.source_type = 'deduction'
      AND payment.effective_month IS NULL
      AND payment.status IN ('pending', 'approved', 'paid')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'deduction_ambiguous_period';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments AS payment
    WHERE payment.username = p_employee_username
      AND payment.source_type = 'deduction'
      AND payment.effective_month = p_period_month
      AND payment.currency IS DISTINCT FROM p_salary_currency
      AND payment.status IN ('pending', 'approved', 'paid')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'deduction_currency_conflict';
  END IF;

  SELECT COALESCE(pg_catalog.round(pg_catalog.sum(
    GREATEST(
      0::numeric,
      payment.amount - payment.deduction_cap_exempt_amount
    )
  ), 2), 0)
  INTO v_prior_approved_amount
  FROM public.pyra_employee_payments AS payment
  WHERE payment.username = p_employee_username
    AND payment.source_type = 'deduction'
    AND COALESCE(payment.currency, 'AED') = COALESCE(p_salary_currency, 'AED')
    AND payment.effective_month = p_period_month
    AND payment.status IN ('approved', 'paid')
    AND payment.id <> p_payment_id
    AND payment.source_id IS DISTINCT FROM p_case_id;

  v_cap_amount := pg_catalog.round(
    v_salary_snapshot * v_monthly_cap_percentage / 100,
    2
  );
  v_remaining_cap_amount := GREATEST(
    0::numeric,
    pg_catalog.round(v_cap_amount - v_prior_approved_amount, 2)
  );
  IF v_remaining_cap_amount <= 0 AND v_attendance_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'deduction_cap_exhausted';
  END IF;

  v_approved_amount := pg_catalog.round(
    v_attendance_amount
    + LEAST(v_cap_subject_requested_amount, v_remaining_cap_amount),
    2
  );

  IF EXISTS (
    SELECT 1 FROM public.pyra_employee_payments WHERE id = p_payment_id
  ) OR EXISTS (
    SELECT 1 FROM public.pyra_deduction_cases WHERE id = p_case_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'deduction_idempotency_conflict';
  END IF;

  INSERT INTO public.pyra_deduction_cases (
    id,
    employee_username,
    period_month,
    salary_snapshot,
    salary_currency,
    attendance_units,
    attendance_amount,
    delivery_on_time_pct,
    delivery_band,
    delivery_amount,
    delivery_percentage,
    quality_avg_rounds,
    quality_outright_rejection_rate,
    quality_below_band,
    quality_consecutive_months,
    quality_eligible,
    quality_amount,
    monthly_cap_percentage,
    requested_amount,
    cap_amount,
    prior_approved_amount,
    remaining_cap_amount,
    approved_amount,
    evidence,
    policy_snapshot,
    admin_note,
    payment_id,
    approved_by,
    approved_at,
    created_at
  ) VALUES (
    p_case_id,
    p_employee_username,
    p_period_month,
    v_salary_snapshot,
    p_salary_currency,
    p_attendance_units,
    v_attendance_amount,
    p_delivery_on_time_pct,
    p_delivery_band,
    v_delivery_amount,
    p_delivery_percentage,
    p_quality_avg_rounds,
    p_quality_outright_rejection_rate,
    p_quality_below_band,
    p_quality_consecutive_months,
    p_quality_eligible,
    v_quality_amount,
    v_monthly_cap_percentage,
    v_requested_amount,
    v_cap_amount,
    v_prior_approved_amount,
    v_remaining_cap_amount,
    v_approved_amount,
    p_evidence || pg_catalog.jsonb_build_object(
      'aggregate_cap', pg_catalog.jsonb_build_object(
        'prior_approved_amount', v_prior_approved_amount,
        'remaining_cap_amount', v_remaining_cap_amount,
        'cap_subject_requested_amount', v_cap_subject_requested_amount,
        'cap_subject_approved_amount', pg_catalog.round(
          v_approved_amount - v_attendance_amount,
          2
        ),
        'attendance_cap_exempt_amount', v_attendance_amount,
        'unpaid_leave_included', false
      )
    ),
    p_policy_snapshot,
    p_admin_note,
    p_payment_id,
    p_approved_by,
    v_timestamp,
    v_timestamp
  )
  RETURNING * INTO v_case;

  INSERT INTO public.pyra_deduction_write_capabilities (
    transaction_id, payment_id, operation
  ) VALUES (
    pg_catalog.pg_current_xact_id()::text::bigint,
    p_payment_id,
    'insert'
  );

  INSERT INTO public.pyra_employee_payments (
    id,
    username,
    source_type,
    source_id,
    description,
    amount,
    deduction_cap_exempt_amount,
    currency,
    status,
    payroll_id,
    approved_by,
    approved_at,
    paid_at,
    created_at,
    effective_month
  ) VALUES (
    p_payment_id,
    p_employee_username,
    'deduction',
    p_case_id,
    pg_catalog.btrim(p_payment_description),
    v_approved_amount,
    v_attendance_amount,
    p_salary_currency,
    'approved',
    NULL,
    p_approved_by,
    v_timestamp,
    NULL,
    v_timestamp,
    p_period_month
  );

  DELETE FROM public.pyra_deduction_write_capabilities
  WHERE transaction_id = pg_catalog.pg_current_xact_id()::text::bigint
    AND payment_id = p_payment_id
    AND operation = 'insert';

  RETURN v_case;
END;
$function$;

-- The basis parameter is part of the immutable approval intent. Remove the
-- pre-basis overload explicitly so it cannot remain callable after an upgrade.
DROP FUNCTION IF EXISTS public.pyra_approve_manual_deduction(
  varchar, varchar, varchar, date, numeric, varchar, numeric, numeric,
  text, jsonb, varchar
);

CREATE OR REPLACE FUNCTION public.pyra_approve_manual_deduction(
  p_manual_id varchar,
  p_payment_id varchar,
  p_employee_username varchar,
  p_period_month date,
  p_salary_snapshot numeric,
  p_salary_currency varchar,
  p_requested_amount numeric,
  p_monthly_cap_percentage numeric,
  p_basis varchar,
  p_reason text,
  p_evidence jsonb,
  p_approved_by varchar
)
RETURNS TABLE(
  status text,
  changed boolean,
  manual_data jsonb,
  payment_data jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
  v_manual public.pyra_manual_deductions%ROWTYPE;
  v_payment public.pyra_employee_payments%ROWTYPE;
  v_user public.pyra_users%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_current_month date := pg_catalog.date_trunc(
    'month',
    pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Dubai'
  )::date;
  v_salary_snapshot numeric(12,2) := pg_catalog.round(p_salary_snapshot, 2);
  v_requested_amount numeric(12,2) := pg_catalog.round(p_requested_amount, 2);
  v_monthly_cap_percentage numeric(5,2) := pg_catalog.round(p_monthly_cap_percentage, 2);
  v_cap_amount numeric(12,2);
  v_prior_approved_amount numeric(12,2);
  v_remaining_cap_amount numeric(12,2);
  v_approved_amount numeric(12,2);
  v_task_ids varchar(20)[];
  v_task_id varchar(20);
BEGIN
  IF p_manual_id IS NULL
     OR pg_catalog.btrim(p_manual_id) = ''
     OR pg_catalog.length(p_manual_id) > 20
     OR p_payment_id IS NULL
     OR pg_catalog.btrim(p_payment_id) = ''
     OR pg_catalog.length(p_payment_id) > 20
     OR p_employee_username IS NULL
     OR pg_catalog.btrim(p_employee_username) = ''
     OR p_period_month IS NULL
     OR p_period_month IS DISTINCT FROM
        pg_catalog.date_trunc('month', p_period_month::timestamp)::date
     OR v_salary_snapshot IS NULL
     OR v_salary_snapshot <= 0
     OR p_salary_currency IS NULL
     OR pg_catalog.length(p_salary_currency) <> 3
     OR v_requested_amount IS NULL
     OR v_requested_amount <= 0
     OR v_monthly_cap_percentage IS NULL
     OR v_monthly_cap_percentage < 0
     OR v_monthly_cap_percentage > 100
     OR p_basis IS NULL
     OR p_basis NOT IN ('owner_attested_legacy_delivery', 'quality_repeated_pattern')
     OR p_reason IS NULL
     OR pg_catalog.btrim(p_reason) = ''
     OR pg_catalog.jsonb_typeof(p_evidence) IS DISTINCT FROM 'object'
     OR p_evidence = '{}'::jsonb
     OR p_approved_by IS NULL
     OR pg_catalog.btrim(p_approved_by) = '' THEN
    RETURN QUERY SELECT 'invalid_payload'::text, false, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF p_evidence ->> 'source' IS DISTINCT FROM 'employee_deductions_admin_approval'
     OR p_evidence ->> 'basis' IS DISTINCT FROM p_basis
     OR p_evidence ->> 'employee_username' IS DISTINCT FROM p_employee_username
     OR p_evidence ->> 'report_month' IS DISTINCT FROM pg_catalog.to_char(p_period_month, 'YYYY-MM')
     OR p_evidence -> 'schema_version' IS DISTINCT FROM '1'::jsonb THEN
    RETURN QUERY SELECT 'invalid_payload'::text, false, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF p_period_month IS DISTINCT FROM v_current_month THEN
    RETURN QUERY SELECT 'current_month_only'::text, false, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  -- The owner has not yet locked whether a repeated quality pattern is charged
  -- from the still-changing current month or from completed months. Preserve
  -- warning evidence, but fail closed on money until that timing is explicit.
  IF p_basis = 'quality_repeated_pattern' THEN
    RETURN QUERY SELECT
      'quality_timing_unconfirmed'::text,
      false,
      NULL::jsonb,
      NULL::jsonb;
    RETURN;
  END IF;

  IF p_basis = 'owner_attested_legacy_delivery' THEN
    IF pg_catalog.jsonb_typeof(p_evidence #> '{legacy_delivery,tasks}') IS DISTINCT FROM 'array'
       OR p_evidence #> '{legacy_delivery,owner_attested}' IS DISTINCT FROM 'true'::jsonb
       OR p_evidence #>> '{legacy_delivery,evaluation}'
          IS DISTINCT FROM 'submitted_after_due_calendar_day_dubai' THEN
      RETURN QUERY SELECT 'invalid_payload'::text, false, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;
    IF pg_catalog.jsonb_array_length(p_evidence #> '{legacy_delivery,tasks}') = 0
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.jsonb_array_elements(
           p_evidence #> '{legacy_delivery,tasks}'
         ) AS task(value)
         WHERE pg_catalog.jsonb_typeof(task.value) IS DISTINCT FROM 'object'
            OR pg_catalog.btrim(COALESCE(task.value ->> 'task_id', '')) = ''
            OR pg_catalog.length(task.value ->> 'task_id') > 20
       ) THEN
      RETURN QUERY SELECT 'invalid_payload'::text, false, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;

    SELECT pg_catalog.array_agg(task_id ORDER BY task_id)
    INTO v_task_ids
    FROM (
      SELECT DISTINCT task.value ->> 'task_id' AS task_id
      FROM pg_catalog.jsonb_array_elements(
        p_evidence #> '{legacy_delivery,tasks}'
      ) AS task(value)
    ) AS selected_tasks;

    IF pg_catalog.cardinality(v_task_ids)
       IS DISTINCT FROM pg_catalog.jsonb_array_length(
         p_evidence #> '{legacy_delivery,tasks}'
       ) THEN
      RETURN QUERY SELECT 'invalid_payload'::text, false, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;
  ELSE
    IF pg_catalog.jsonb_typeof(p_evidence -> 'quality') IS DISTINCT FROM 'object'
       OR p_evidence #> '{quality,eligibility,eligible}' IS DISTINCT FROM 'true'::jsonb
       OR pg_catalog.jsonb_typeof(p_evidence #> '{quality,months}') IS DISTINCT FROM 'array' THEN
      RETURN QUERY SELECT 'invalid_payload'::text, false, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;
    IF pg_catalog.jsonb_array_length(p_evidence #> '{quality,months}') < 2 THEN
      RETURN QUERY SELECT 'invalid_payload'::text, false, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;
  END IF;

  -- Stable-id serialization makes an HTTP retry idempotent even before a row
  -- exists. The cap lock below serializes all cooperating manual/computed
  -- approvals for this employee/currency/effective month.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('manual_deduction_id:' || p_manual_id, 46046)
  );

  SELECT manual.*
  INTO v_manual
  FROM public.pyra_manual_deductions AS manual
  WHERE manual.id = p_manual_id
  FOR UPDATE;

  IF FOUND THEN
    SELECT payment.*
    INTO v_payment
    FROM public.pyra_employee_payments AS payment
    WHERE payment.id = v_manual.payment_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_manual.payment_id IS DISTINCT FROM p_payment_id
       OR v_manual.employee_username IS DISTINCT FROM p_employee_username
       OR v_manual.period_month IS DISTINCT FROM p_period_month
       OR v_manual.salary_snapshot IS DISTINCT FROM v_salary_snapshot
       OR v_manual.salary_currency IS DISTINCT FROM p_salary_currency
       OR v_manual.monthly_cap_percentage IS DISTINCT FROM v_monthly_cap_percentage
       OR v_manual.requested_amount IS DISTINCT FROM v_requested_amount
       OR v_manual.basis IS DISTINCT FROM p_basis
       OR v_manual.reason IS DISTINCT FROM pg_catalog.btrim(p_reason)
       OR v_manual.evidence IS DISTINCT FROM p_evidence
       OR v_payment.username IS DISTINCT FROM v_manual.employee_username
       OR v_payment.source_type IS DISTINCT FROM 'deduction'
       OR v_payment.source_id IS DISTINCT FROM v_manual.id
       OR v_payment.effective_month IS DISTINCT FROM v_manual.period_month
       OR v_payment.currency IS DISTINCT FROM v_manual.salary_currency
       OR pg_catalog.round(v_payment.amount, 2) IS DISTINCT FROM v_manual.approved_amount
       OR v_payment.deduction_cap_exempt_amount IS DISTINCT FROM 0
       OR (
         v_payment.status IS DISTINCT FROM 'approved'
         AND v_payment.status IS DISTINCT FROM 'paid'
       ) THEN
      RETURN QUERY SELECT
        'idempotency_conflict'::text,
        false,
        pg_catalog.to_jsonb(v_manual),
        CASE WHEN v_payment.id IS NULL THEN NULL ELSE pg_catalog.to_jsonb(v_payment) END;
      RETURN;
    END IF;

    RETURN QUERY SELECT
      'already_approved'::text,
      false,
      pg_catalog.to_jsonb(v_manual),
      pg_catalog.to_jsonb(v_payment);
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pyra_employee_payments WHERE id = p_payment_id
  ) THEN
    RETURN QUERY SELECT 'idempotency_conflict'::text, false, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'payroll_deduction_cap:' || p_employee_username || ':' ||
      p_period_month::text,
      46046
    )
  );

  SELECT employee.*
  INTO v_user
  FROM public.pyra_users AS employee
  WHERE employee.username = p_employee_username
  FOR UPDATE;

  IF NOT FOUND
     OR v_user.role IS DISTINCT FROM 'employee'
     OR v_user.status IS DISTINCT FROM 'active'
     OR v_user.salary_currency IS DISTINCT FROM p_salary_currency
     OR pg_catalog.round(COALESCE(v_user.salary, 0), 2) IS DISTINCT FROM v_salary_snapshot THEN
    RETURN QUERY SELECT 'blocked_input'::text, false, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM payroll.id
  FROM public.pyra_payroll_runs AS payroll
  WHERE payroll.year = EXTRACT(year FROM p_period_month)::integer
    AND payroll.month = EXTRACT(month FROM p_period_month)::integer
    AND COALESCE(payroll.currency, 'AED') = COALESCE(p_salary_currency, 'AED')
  ORDER BY payroll.id
  FOR UPDATE;
  IF EXISTS (
    SELECT 1
    FROM public.pyra_payroll_runs AS payroll
    WHERE payroll.year = EXTRACT(year FROM p_period_month)::integer
      AND payroll.month = EXTRACT(month FROM p_period_month)::integer
      AND COALESCE(payroll.currency, 'AED') = COALESCE(p_salary_currency, 'AED')
      AND payroll.status IN ('approved', 'paid')
  ) THEN
    RETURN QUERY SELECT 'closed_period'::text, false, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM payment.id
  FROM public.pyra_employee_payments AS payment
  WHERE payment.username = p_employee_username
    AND payment.source_type = 'deduction'
    AND (payment.effective_month = p_period_month OR payment.effective_month IS NULL)
  ORDER BY payment.id
  FOR UPDATE;

  -- Legacy deductions without an attested effective month cannot safely be
  -- allocated using created_at. They must be classified explicitly first.
  IF EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments AS payment
    WHERE payment.username = p_employee_username
      AND payment.source_type = 'deduction'
      AND payment.effective_month IS NULL
      AND payment.status IN ('pending', 'approved', 'paid')
  ) THEN
    RETURN QUERY SELECT 'ambiguous_period'::text, false, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments AS payment
    WHERE payment.username = p_employee_username
      AND payment.source_type = 'deduction'
      AND payment.effective_month = p_period_month
      AND payment.currency IS DISTINCT FROM p_salary_currency
      AND payment.status IN ('pending', 'approved', 'paid')
  ) THEN
    RETURN QUERY SELECT 'currency_conflict'::text, false, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  SELECT COALESCE(pg_catalog.round(pg_catalog.sum(
    GREATEST(
      0::numeric,
      payment.amount - payment.deduction_cap_exempt_amount
    )
  ), 2), 0)
  INTO v_prior_approved_amount
  FROM public.pyra_employee_payments AS payment
  WHERE payment.username = p_employee_username
    AND payment.source_type = 'deduction'
    AND COALESCE(payment.currency, 'AED') = COALESCE(p_salary_currency, 'AED')
    AND payment.effective_month = p_period_month
    AND payment.status IN ('approved', 'paid')
    AND payment.id <> p_payment_id
    AND payment.source_id IS DISTINCT FROM p_manual_id;

  v_cap_amount := pg_catalog.round(
    v_salary_snapshot * v_monthly_cap_percentage / 100,
    2
  );
  v_remaining_cap_amount := GREATEST(
    0::numeric,
    pg_catalog.round(v_cap_amount - v_prior_approved_amount, 2)
  );

  IF v_remaining_cap_amount <= 0 THEN
    RETURN QUERY SELECT 'cap_exhausted'::text, false, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  -- Never silently approve less than the admin explicitly confirmed. A cap
  -- change between preview and approval requires a fresh review and retry.
  IF v_requested_amount > v_remaining_cap_amount THEN
    RETURN QUERY SELECT 'cap_changed'::text, false, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF p_basis = 'quality_repeated_pattern' THEN
    IF EXISTS (
      SELECT 1
      FROM public.pyra_manual_deductions AS manual
      WHERE manual.employee_username = p_employee_username
        AND manual.period_month = p_period_month
        AND manual.basis = 'quality_repeated_pattern'
    ) THEN
      RETURN QUERY SELECT 'duplicate_cause'::text, false, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;
  ELSE
    FOREACH v_task_id IN ARRAY v_task_ids LOOP
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('manual_deduction_task:' || v_task_id, 46046)
      );
    END LOOP;
    IF EXISTS (
      SELECT 1
      FROM public.pyra_manual_deduction_tasks AS linked_task
      WHERE linked_task.task_id = ANY(v_task_ids)
    ) THEN
      RETURN QUERY SELECT 'duplicate_cause'::text, false, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;
  END IF;

  v_approved_amount := v_requested_amount;

  INSERT INTO public.pyra_deduction_write_capabilities (
    transaction_id, payment_id, operation
  ) VALUES (
    pg_catalog.pg_current_xact_id()::text::bigint,
    p_payment_id,
    'insert'
  );

  INSERT INTO public.pyra_employee_payments (
    id,
    username,
    source_type,
    source_id,
    description,
    amount,
    deduction_cap_exempt_amount,
    currency,
    status,
    payroll_id,
    approved_by,
    approved_at,
    paid_at,
    created_at,
    effective_month
  ) VALUES (
    p_payment_id,
    p_employee_username,
    'deduction',
    p_manual_id,
    pg_catalog.btrim(p_reason),
    v_approved_amount,
    0,
    p_salary_currency,
    'approved',
    NULL,
    p_approved_by,
    v_now,
    NULL,
    v_now,
    p_period_month
  )
  RETURNING * INTO v_payment;

  DELETE FROM public.pyra_deduction_write_capabilities
  WHERE transaction_id = pg_catalog.pg_current_xact_id()::text::bigint
    AND payment_id = p_payment_id
    AND operation = 'insert';

  INSERT INTO public.pyra_manual_deductions (
    id,
    payment_id,
    employee_username,
    period_month,
    basis,
    salary_snapshot,
    salary_currency,
    monthly_cap_percentage,
    requested_amount,
    cap_amount,
    prior_approved_amount,
    approved_amount,
    reason,
    evidence,
    approved_by,
    approved_at,
    created_at
  ) VALUES (
    p_manual_id,
    p_payment_id,
    p_employee_username,
    p_period_month,
    p_basis,
    v_salary_snapshot,
    p_salary_currency,
    v_monthly_cap_percentage,
    v_requested_amount,
    v_cap_amount,
    v_prior_approved_amount,
    v_approved_amount,
    pg_catalog.btrim(p_reason),
    p_evidence,
    p_approved_by,
    v_now,
    v_now
  )
  RETURNING * INTO v_manual;

  IF p_basis = 'owner_attested_legacy_delivery' THEN
    INSERT INTO public.pyra_manual_deduction_tasks (
      manual_deduction_id,
      task_id,
      created_at
    )
    SELECT
      p_manual_id,
      task_id,
      v_now
    FROM pg_catalog.unnest(v_task_ids) AS selected(task_id);
  END IF;

  RETURN QUERY SELECT
    'ok'::text,
    true,
    pg_catalog.to_jsonb(v_manual),
    pg_catalog.to_jsonb(v_payment);
END;
$function$;

ALTER FUNCTION public.pyra_commit_payroll_calculation(
  varchar, timestamptz, jsonb, varchar[], numeric
) OWNER TO postgres;
ALTER FUNCTION public.pyra_approve_payroll_run(
  varchar, timestamptz, varchar, text, jsonb
) OWNER TO postgres;
ALTER FUNCTION public.pyra_pay_payroll_run(varchar, text) OWNER TO postgres;
ALTER FUNCTION public.pyra_pay_employee_payment(varchar) OWNER TO postgres;
ALTER FUNCTION public.pyra_approve_employee_payment(varchar, varchar) OWNER TO postgres;
ALTER FUNCTION public.pyra_delete_draft_payroll_run(varchar) OWNER TO postgres;
ALTER FUNCTION public.pyra_approve_manual_deduction(
  varchar, varchar, varchar, date, numeric, varchar, numeric, numeric,
  varchar, text, jsonb, varchar
) OWNER TO postgres;
ALTER FUNCTION public.pyra_approve_employee_deduction(
  varchar, varchar, varchar, date, numeric, varchar, numeric, numeric,
  numeric, varchar, numeric, numeric, numeric, numeric, boolean, integer,
  boolean, numeric, numeric, jsonb, jsonb, text, text, varchar
) OWNER TO postgres;

REVOKE ALL ON TABLE public.pyra_manual_deductions FROM PUBLIC;
REVOKE ALL ON TABLE public.pyra_manual_deductions FROM anon;
REVOKE ALL ON TABLE public.pyra_manual_deductions FROM authenticated;
REVOKE ALL ON TABLE public.pyra_manual_deductions FROM service_role;
GRANT SELECT ON TABLE public.pyra_manual_deductions TO service_role;

REVOKE ALL ON TABLE public.pyra_manual_deduction_tasks FROM PUBLIC;
REVOKE ALL ON TABLE public.pyra_manual_deduction_tasks FROM anon;
REVOKE ALL ON TABLE public.pyra_manual_deduction_tasks FROM authenticated;
REVOKE ALL ON TABLE public.pyra_manual_deduction_tasks FROM service_role;
GRANT SELECT ON TABLE public.pyra_manual_deduction_tasks TO service_role;

REVOKE ALL ON FUNCTION public.pyra_approve_manual_deduction(
  varchar, varchar, varchar, date, numeric, varchar, numeric, numeric,
  varchar, text, jsonb, varchar
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pyra_approve_manual_deduction(
  varchar, varchar, varchar, date, numeric, varchar, numeric, numeric,
  varchar, text, jsonb, varchar
) FROM anon;
REVOKE ALL ON FUNCTION public.pyra_approve_manual_deduction(
  varchar, varchar, varchar, date, numeric, varchar, numeric, numeric,
  varchar, text, jsonb, varchar
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pyra_approve_manual_deduction(
  varchar, varchar, varchar, date, numeric, varchar, numeric, numeric,
  varchar, text, jsonb, varchar
) TO service_role;

-- CREATE OR REPLACE preserves ACLs in PostgreSQL, but repeat the complete
-- service-role-only contract so the hardening is independently auditable.
REVOKE ALL ON FUNCTION public.pyra_approve_employee_deduction(
  varchar, varchar, varchar, date, numeric, varchar, numeric, numeric,
  numeric, varchar, numeric, numeric, numeric, numeric, boolean, integer,
  boolean, numeric, numeric, jsonb, jsonb, text, text, varchar
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pyra_approve_employee_deduction(
  varchar, varchar, varchar, date, numeric, varchar, numeric, numeric,
  numeric, varchar, numeric, numeric, numeric, numeric, boolean, integer,
  boolean, numeric, numeric, jsonb, jsonb, text, text, varchar
) FROM anon;
REVOKE ALL ON FUNCTION public.pyra_approve_employee_deduction(
  varchar, varchar, varchar, date, numeric, varchar, numeric, numeric,
  numeric, varchar, numeric, numeric, numeric, numeric, boolean, integer,
  boolean, numeric, numeric, jsonb, jsonb, text, text, varchar
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pyra_approve_employee_deduction(
  varchar, varchar, varchar, date, numeric, varchar, numeric, numeric,
  numeric, varchar, numeric, numeric, numeric, numeric, boolean, integer,
  boolean, numeric, numeric, jsonb, jsonb, text, text, varchar
) TO service_role;

REVOKE ALL ON FUNCTION public.pyra_commit_payroll_calculation(
  varchar, timestamptz, jsonb, varchar[], numeric
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pyra_commit_payroll_calculation(
  varchar, timestamptz, jsonb, varchar[], numeric
) FROM anon;
REVOKE ALL ON FUNCTION public.pyra_commit_payroll_calculation(
  varchar, timestamptz, jsonb, varchar[], numeric
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pyra_commit_payroll_calculation(
  varchar, timestamptz, jsonb, varchar[], numeric
) TO service_role;

REVOKE ALL ON FUNCTION public.pyra_approve_payroll_run(
  varchar, timestamptz, varchar, text, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pyra_approve_payroll_run(
  varchar, timestamptz, varchar, text, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.pyra_approve_payroll_run(
  varchar, timestamptz, varchar, text, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pyra_approve_payroll_run(
  varchar, timestamptz, varchar, text, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.pyra_pay_payroll_run(varchar, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pyra_pay_payroll_run(varchar, text) FROM anon;
REVOKE ALL ON FUNCTION public.pyra_pay_payroll_run(varchar, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pyra_pay_payroll_run(varchar, text) TO service_role;

REVOKE ALL ON FUNCTION public.pyra_approve_employee_payment(varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pyra_approve_employee_payment(varchar, varchar) FROM anon;
REVOKE ALL ON FUNCTION public.pyra_approve_employee_payment(varchar, varchar) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pyra_approve_employee_payment(varchar, varchar) TO service_role;

REVOKE ALL ON FUNCTION public.pyra_pay_employee_payment(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pyra_pay_employee_payment(varchar) FROM anon;
REVOKE ALL ON FUNCTION public.pyra_pay_employee_payment(varchar) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pyra_pay_employee_payment(varchar) TO service_role;

REVOKE ALL ON FUNCTION public.pyra_delete_draft_payroll_run(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pyra_delete_draft_payroll_run(varchar) FROM anon;
REVOKE ALL ON FUNCTION public.pyra_delete_draft_payroll_run(varchar) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pyra_delete_draft_payroll_run(varchar) TO service_role;

COMMIT;

-- -- DOWN (informational only; never auto-run):
-- -- DROP FUNCTION IF EXISTS public.pyra_approve_manual_deduction(varchar, varchar, varchar, date, numeric, varchar, numeric, numeric, varchar, text, jsonb, varchar);
-- -- DROP FUNCTION IF EXISTS public.pyra_delete_draft_payroll_run(varchar);
-- -- DROP FUNCTION IF EXISTS public.pyra_pay_employee_payment(varchar);
-- -- DROP FUNCTION IF EXISTS public.pyra_approve_employee_payment(varchar, varchar);
-- -- DROP FUNCTION IF EXISTS public.pyra_pay_payroll_run(varchar, text);
-- -- DROP FUNCTION IF EXISTS public.pyra_approve_payroll_run(varchar, timestamptz, varchar, text, jsonb);
-- -- DROP FUNCTION IF EXISTS public.pyra_commit_payroll_calculation(varchar, timestamptz, jsonb, varchar[], numeric);
-- -- DROP TABLE IF EXISTS public.pyra_manual_deduction_tasks;
-- -- DROP TABLE IF EXISTS public.pyra_manual_deductions;
-- -- DROP TABLE IF EXISTS public.pyra_deduction_write_capabilities;
-- -- ALTER TABLE public.pyra_deduction_cases DROP CONSTRAINT IF EXISTS ck_deduction_cases_approved_formula;
-- -- ALTER TABLE public.pyra_deduction_cases DROP CONSTRAINT IF EXISTS ck_deduction_cases_quality_manual_only;
-- -- ALTER TABLE public.pyra_deduction_cases DROP CONSTRAINT IF EXISTS ck_deduction_cases_remaining_cap;
-- -- ALTER TABLE public.pyra_deduction_cases DROP COLUMN IF EXISTS remaining_cap_amount;
-- -- ALTER TABLE public.pyra_deduction_cases DROP COLUMN IF EXISTS prior_approved_amount;
-- -- ALTER TABLE public.pyra_deduction_cases ADD CONSTRAINT ck_deduction_cases_approved_formula CHECK (approved_amount = LEAST(requested_amount, cap_amount));
-- -- ALTER TABLE public.pyra_payroll_items DROP CONSTRAINT IF EXISTS uq_payroll_items_run_username;
