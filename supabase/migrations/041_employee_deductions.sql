-- =============================================================
-- Migration 041: Exact production deadlines and employee deductions
-- =============================================================
-- Adds exact Dubai-time production deadlines, immutable review-deadline
-- snapshots, payroll effective-month attribution, and the approved monthly
-- deduction-case ledger. The approval RPC is the only write surface for a
-- deduction case and creates its employee-payment row atomically.
--
-- Risk tier: 1 (additive objects plus NULL-only backfills into new columns).
-- Backup note: the recommended pre-041 backup was attempted, but the project
-- does not currently provide SUPABASE_DB_URL. See the implementation plan.
-- Forward-only (Phase 14.2).
-- =============================================================

BEGIN;

ALTER TABLE public.pyra_tasks
  ADD COLUMN IF NOT EXISTS due_at timestamptz;

ALTER TABLE public.pyra_task_stage_history
  ADD COLUMN IF NOT EXISTS due_at_snapshot timestamptz;

ALTER TABLE public.pyra_employee_payments
  ADD COLUMN IF NOT EXISTS effective_month date;

CREATE INDEX IF NOT EXISTS idx_tasks_due_at
  ON public.pyra_tasks(due_at)
  WHERE due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_emp_payments_effective_month
  ON public.pyra_employee_payments(effective_month, currency, username)
  WHERE effective_month IS NOT NULL AND payroll_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_emp_payments_deduction_source
  ON public.pyra_employee_payments(source_type, source_id)
  WHERE source_type = 'deduction' AND source_id IS NOT NULL;

UPDATE public.pyra_tasks
SET due_at = (
  (due_date::timestamp + interval '1 day' - interval '1 millisecond')
  AT TIME ZONE 'Asia/Dubai'
)
WHERE board_id = 'bd_production'
  AND due_at IS NULL
  AND due_date IS NOT NULL;

UPDATE public.pyra_task_stage_history AS h
SET due_at_snapshot = t.due_at
FROM public.pyra_tasks AS t, public.pyra_board_columns AS c
WHERE h.task_id = t.id
  AND h.to_column_id = c.id
  AND c.column_type = 'review'
  AND h.due_at_snapshot IS NULL
  AND t.due_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pyra_deduction_cases (
  id                               varchar(20) NOT NULL,
  employee_username                varchar NOT NULL,
  period_month                     date NOT NULL,
  salary_snapshot                  numeric(12,2) NOT NULL,
  salary_currency                  varchar(3) NOT NULL,
  attendance_units                 numeric(8,2) NOT NULL,
  attendance_amount                numeric(12,2) NOT NULL,
  delivery_on_time_pct             numeric(5,2),
  delivery_band                    varchar(20),
  delivery_amount                  numeric(12,2) NOT NULL,
  delivery_percentage              numeric(5,2) NOT NULL,
  quality_avg_rounds               numeric(8,2),
  quality_outright_rejection_rate  numeric(5,2),
  quality_below_band               boolean NOT NULL,
  quality_consecutive_months       integer NOT NULL,
  quality_eligible                 boolean NOT NULL,
  quality_amount                   numeric(12,2) NOT NULL,
  monthly_cap_percentage           numeric(5,2) NOT NULL,
  requested_amount                 numeric(12,2) NOT NULL,
  cap_amount                       numeric(12,2) NOT NULL,
  approved_amount                  numeric(12,2) NOT NULL,
  evidence                         jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_snapshot                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  admin_note                       text,
  payment_id                       varchar(20) NOT NULL,
  approved_by                      varchar NOT NULL,
  approved_at                      timestamptz NOT NULL DEFAULT now(),
  created_at                       timestamptz NOT NULL DEFAULT now()
);

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'pyra_deduction_cases_pkey'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT pyra_deduction_cases_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'uq_deduction_cases_employee_period'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT uq_deduction_cases_employee_period
      UNIQUE (employee_username, period_month);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'uq_deduction_cases_payment'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT uq_deduction_cases_payment UNIQUE (payment_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'fk_deduction_cases_payment'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT fk_deduction_cases_payment
      FOREIGN KEY (payment_id)
      REFERENCES public.pyra_employee_payments(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'ck_deduction_cases_period_month'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_period_month
      CHECK (period_month = pg_catalog.date_trunc('month', period_month::timestamp)::date);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'ck_deduction_cases_nonnegative_money'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_nonnegative_money CHECK (
        salary_snapshot >= 0
        AND attendance_amount >= 0
        AND delivery_amount >= 0
        AND quality_amount >= 0
        AND requested_amount >= 0
        AND cap_amount >= 0
        AND approved_amount >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'ck_deduction_cases_requested_components'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_requested_components
      CHECK (requested_amount = attendance_amount + delivery_amount + quality_amount);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'ck_deduction_cases_cap_formula'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_cap_formula CHECK (
        cap_amount = pg_catalog.round(salary_snapshot * monthly_cap_percentage / 100, 2)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'ck_deduction_cases_approved_formula'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_approved_formula
      CHECK (approved_amount = LEAST(requested_amount, cap_amount));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'ck_deduction_cases_approved_cap'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_approved_cap
      CHECK (approved_amount <= cap_amount);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'ck_deduction_cases_approved_requested'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_approved_requested
      CHECK (approved_amount <= requested_amount);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'ck_deduction_cases_attendance_units'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_attendance_units
      CHECK (attendance_units >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'ck_deduction_cases_delivery_pct'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_delivery_pct CHECK (
        delivery_on_time_pct IS NULL OR delivery_on_time_pct BETWEEN 0 AND 100
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'ck_deduction_cases_delivery_percentage'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_delivery_percentage
      CHECK (delivery_percentage BETWEEN 0 AND 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'ck_deduction_cases_delivery_band'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_delivery_band CHECK (
        delivery_band IS NULL OR delivery_band IN ('none', 'minor', 'moderate', 'major')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'ck_deduction_cases_quality_metrics'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_quality_metrics CHECK (
        (quality_avg_rounds IS NULL OR quality_avg_rounds >= 0)
        AND (
          quality_outright_rejection_rate IS NULL
          OR quality_outright_rejection_rate BETWEEN 0 AND 100
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'ck_deduction_cases_quality_consecutive_months'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_quality_consecutive_months
      CHECK (quality_consecutive_months >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'ck_deduction_cases_quality_amount_eligibility'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_quality_amount_eligibility
      CHECK (quality_amount = 0 OR quality_eligible);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'ck_deduction_cases_quality_eligibility_band'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_quality_eligibility_band
      CHECK (NOT quality_eligible OR quality_below_band);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'ck_deduction_cases_monthly_cap_percentage'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_monthly_cap_percentage
      CHECK (monthly_cap_percentage BETWEEN 0 AND 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_deduction_cases'::regclass
      AND conname = 'ck_deduction_cases_salary_currency'
  ) THEN
    ALTER TABLE public.pyra_deduction_cases
      ADD CONSTRAINT ck_deduction_cases_salary_currency
      CHECK (pg_catalog.char_length(salary_currency) = 3);
  END IF;
END;
$do$;

CREATE INDEX IF NOT EXISTS idx_deduction_cases_period_month
  ON public.pyra_deduction_cases(period_month DESC);

ALTER TABLE public.pyra_deduction_cases ENABLE ROW LEVEL SECURITY;

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
AS $function$
DECLARE
  v_case public.pyra_deduction_cases%ROWTYPE;
  v_timestamp timestamptz := pg_catalog.now();
  v_salary_snapshot numeric(12,2) := pg_catalog.round(p_salary_snapshot, 2);
  v_attendance_amount numeric(12,2) := pg_catalog.round(p_attendance_amount, 2);
  v_delivery_amount numeric(12,2) := pg_catalog.round(p_delivery_amount, 2);
  v_quality_amount numeric(12,2) := pg_catalog.round(p_quality_amount, 2);
  v_monthly_cap_percentage numeric(5,2) := pg_catalog.round(p_monthly_cap_percentage, 2);
  v_requested_amount numeric(12,2);
  v_cap_amount numeric(12,2);
  v_approved_amount numeric(12,2);
BEGIN
  SELECT c.*
  INTO v_case
  FROM public.pyra_deduction_cases AS c
  WHERE c.employee_username = p_employee_username
    AND c.period_month = p_period_month;

  IF FOUND THEN
    RETURN v_case;
  END IF;

  v_requested_amount := pg_catalog.round(
    v_attendance_amount + v_delivery_amount + v_quality_amount,
    2
  );
  v_cap_amount := pg_catalog.round(
    v_salary_snapshot * v_monthly_cap_percentage / 100,
    2
  );
  v_approved_amount := LEAST(v_requested_amount, v_cap_amount);

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
    v_approved_amount,
    p_evidence,
    p_policy_snapshot,
    p_admin_note,
    p_payment_id,
    p_approved_by,
    v_timestamp,
    v_timestamp
  )
  ON CONFLICT (employee_username, period_month) DO NOTHING
  RETURNING * INTO v_case;

  IF NOT FOUND THEN
    SELECT c.*
    INTO v_case
    FROM public.pyra_deduction_cases AS c
    WHERE c.employee_username = p_employee_username
      AND c.period_month = p_period_month;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Concurrent deduction case was not visible after conflict';
    END IF;

    RETURN v_case;
  END IF;

  INSERT INTO public.pyra_employee_payments (
    id,
    username,
    source_type,
    source_id,
    description,
    amount,
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
    p_payment_description,
    v_approved_amount,
    p_salary_currency,
    'approved',
    NULL,
    p_approved_by,
    v_timestamp,
    NULL,
    v_timestamp,
    p_period_month
  );

  RETURN v_case;
END;
$function$;

REVOKE ALL ON TABLE public.pyra_deduction_cases FROM PUBLIC;
REVOKE ALL ON TABLE public.pyra_deduction_cases FROM anon;
REVOKE ALL ON TABLE public.pyra_deduction_cases FROM authenticated;
REVOKE ALL ON TABLE public.pyra_deduction_cases FROM service_role;
GRANT SELECT ON TABLE public.pyra_deduction_cases TO service_role;

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

COMMIT;

-- -- DOWN (informational only; never auto-run — use a new forward migration):
-- -- DROP FUNCTION IF EXISTS public.pyra_approve_employee_deduction(
-- --   varchar, varchar, varchar, date, numeric, varchar, numeric, numeric,
-- --   numeric, varchar, numeric, numeric, numeric, numeric, boolean, integer,
-- --   boolean, numeric, numeric, jsonb, jsonb, text, text, varchar
-- -- );
-- -- DROP TABLE IF EXISTS public.pyra_deduction_cases;
-- -- DROP INDEX IF EXISTS public.uq_emp_payments_deduction_source;
-- -- DROP INDEX IF EXISTS public.idx_emp_payments_effective_month;
-- -- DROP INDEX IF EXISTS public.idx_tasks_due_at;
-- -- ALTER TABLE public.pyra_employee_payments DROP COLUMN IF EXISTS effective_month;
-- -- ALTER TABLE public.pyra_task_stage_history DROP COLUMN IF EXISTS due_at_snapshot;
-- -- ALTER TABLE public.pyra_tasks DROP COLUMN IF EXISTS due_at;
