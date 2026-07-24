-- RUNNER ONLY: this smoke deliberately updates a real employee's currency and
-- writes rollback-only financial fixtures. It MUST run through
-- run-rollback-migration-smoke.ts, inside its outer BEGIN ... ROLLBACK. Never
-- execute this file directly or through pnpm db:query.
DO $smoke$
DECLARE
  v_username varchar;
  v_currency varchar := 'XTS';
  v_salary numeric;
  v_task_id varchar(20);
  v_task_title text;
  v_status text;
  v_changed boolean;
  v_manual_data jsonb;
  v_payment_data jsonb;
  v_legacy_evidence jsonb;
  v_direct_write_blocked boolean := false;
  v_direct_update_blocked boolean := false;
  v_direct_delete_blocked boolean := false;
  v_current_month date := pg_catalog.date_trunc(
    'month',
    pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Dubai'
  )::date;
BEGIN
  SELECT employee.username, pg_catalog.round(employee.salary, 2)
  INTO v_username, v_salary
  FROM public.pyra_users AS employee
  WHERE employee.role = 'employee'
    AND employee.status = 'active'
    AND employee.payment_type = 'monthly_salary'
    AND employee.salary >= 100
    AND employee.salary_currency IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.pyra_employee_payments AS legacy_deduction
      WHERE legacy_deduction.username = employee.username
        AND legacy_deduction.source_type = 'deduction'
        AND legacy_deduction.effective_month IS NULL
        AND legacy_deduction.status IN ('pending', 'approved', 'paid')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.pyra_employee_payments AS existing_deduction
      WHERE existing_deduction.username = employee.username
        AND existing_deduction.source_type = 'deduction'
        AND existing_deduction.effective_month = v_current_month
        AND existing_deduction.status IN ('pending', 'approved', 'paid')
    )
  ORDER BY employee.username
  LIMIT 1;

  IF v_username IS NULL THEN
    RAISE EXCEPTION '047 rollback smoke: active employee fixture is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_users AS existing_employee
    WHERE existing_employee.salary_currency = v_currency
  ) OR EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments AS existing_payment
    WHERE existing_payment.currency = v_currency
  ) OR EXISTS (
    SELECT 1
    FROM public.pyra_payroll_runs AS current_run
    WHERE current_run.year = EXTRACT(year FROM v_current_month)::integer
      AND current_run.month = EXTRACT(month FROM v_current_month)::integer
      AND current_run.currency = v_currency
  ) THEN
    RAISE EXCEPTION '047 rollback smoke: isolated XTS fixture currency is unavailable';
  END IF;

  SELECT task.id, COALESCE(task.title, '047 rollback-only task fixture')
  INTO v_task_id, v_task_title
  FROM public.pyra_tasks AS task
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.pyra_manual_deduction_tasks AS linked_task
    WHERE linked_task.task_id = task.id
  )
  ORDER BY task.id
  LIMIT 1;

  IF v_task_id IS NULL THEN
    RAISE EXCEPTION '047 rollback smoke: unlinked real task fixture is missing';
  END IF;

  -- XTS is the ISO 4217 testing code. The outer rollback restores this real
  -- employee row; using an isolated currency prevents the smoke from touching
  -- an operational payroll period or cross-currency deduction ledger.
  UPDATE public.pyra_users
  SET salary_currency = v_currency
  WHERE username = v_username;

  -- Structurally parser-valid legacy evidence for the SQL writer smoke only.
  -- This does not claim the selected real task was actually late: the dedicated
  -- API proves business evidence before calling the service-role-only RPC, and
  -- the runner rolls this synthetic snapshot back unconditionally.
  v_legacy_evidence := pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'source', 'employee_deductions_admin_approval',
    'basis', 'owner_attested_legacy_delivery',
    'employee_username', v_username,
    'report_month', pg_catalog.to_char(v_current_month, 'YYYY-MM'),
    'legacy_delivery', pg_catalog.jsonb_build_object(
      'evaluation', 'submitted_after_due_calendar_day_dubai',
      'owner_attested', true,
      'tasks', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'task_id', v_task_id,
          'title', v_task_title,
          'due_date', pg_catalog.to_char(v_current_month, 'YYYY-MM-DD'),
          'due_at', NULL,
          'first_submitted_at',
            pg_catalog.to_char(v_current_month + 1, 'YYYY-MM-DD') || 'T12:00:00.000Z',
          'outcome', 'excluded',
          'exclusion_reason', 'unverified_legacy_deadline',
          'attribution_status', 'verified'
        )
      )
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments
    WHERE id IN ('epsmk047direct', 'mdsmk047rpc')
  ) OR EXISTS (
    SELECT 1
    FROM public.pyra_manual_deductions
    WHERE id = 'mdsmk047rpc'
  ) OR EXISTS (
    SELECT 1
    FROM public.pyra_payroll_items
    WHERE id = 'pismk047guard'
  ) THEN
    RAISE EXCEPTION '047 rollback smoke: synthetic fixture IDs or period collide';
  END IF;

  -- A caller-controlled custom setting must have no authority. This is the
  -- exact spoof that bypassed the previous GUC-based guard design.
  PERFORM pg_catalog.set_config('pyra.deduction_writer', 'spoofed', true);

  BEGIN
    INSERT INTO public.pyra_employee_payments (
      id,
      username,
      source_type,
      source_id,
      description,
      amount,
      currency,
      status,
      created_at,
      effective_month
    ) VALUES (
      'epsmk047direct',
      v_username,
      'deduction',
      'smk047direct',
      '047 guard rollback smoke',
      1,
      v_currency,
      'approved',
      pg_catalog.clock_timestamp(),
      pg_catalog.date_trunc(
        'month',
        pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Dubai'
      )::date
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM IS DISTINCT FROM 'deduction_payment_write_requires_atomic_rpc' THEN
        RAISE;
      END IF;
      v_direct_write_blocked := true;
  END;

  IF NOT v_direct_write_blocked THEN
    RAISE EXCEPTION '047 rollback smoke: spoofed session state bypassed deduction guard';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments
    WHERE id = 'epsmk047direct'
  ) THEN
    RAISE EXCEPTION '047 rollback smoke: blocked deduction insert persisted';
  END IF;

  INSERT INTO public.pyra_payroll_runs (
    id,
    month,
    year,
    status,
    total_amount,
    currency,
    employee_count,
    calculated_at,
    created_by,
    created_at
  ) VALUES (
    'prsmk047guard',
    EXTRACT(month FROM v_current_month)::integer,
    EXTRACT(year FROM v_current_month)::integer,
    'draft',
    0,
    v_currency,
    0,
    NULL,
    v_username,
    pg_catalog.clock_timestamp()
  );

  -- The dedicated approval RPC must still create its evidence + payment row
  -- while the trigger is active.
  SELECT result.status, result.changed, result.manual_data, result.payment_data
  INTO v_status, v_changed, v_manual_data, v_payment_data
  FROM public.pyra_approve_manual_deduction(
    'mdsmk047rpc',
    'mdsmk047rpc',
    v_username,
    v_current_month,
    v_salary,
    v_currency,
    1,
    25,
    'owner_attested_legacy_delivery',
    '047 legitimate atomic writer smoke',
    v_legacy_evidence,
    'smoke-047'
  ) AS result;

  IF v_status IS DISTINCT FROM 'ok'
     OR NOT v_changed
     OR (v_manual_data ->> 'id') IS DISTINCT FROM 'mdsmk047rpc'
     OR (v_manual_data ->> 'basis') IS DISTINCT FROM 'owner_attested_legacy_delivery'
     OR (v_payment_data ->> 'id') IS DISTINCT FROM 'mdsmk047rpc'
     OR (v_payment_data ->> 'source_type') IS DISTINCT FROM 'deduction'
     OR (v_payment_data ->> 'source_id') IS DISTINCT FROM 'mdsmk047rpc'
     OR (v_payment_data ->> 'currency') IS DISTINCT FROM v_currency THEN
    RAISE EXCEPTION '047 rollback smoke: legitimate atomic deduction RPC was blocked';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pyra_manual_deductions AS manual
    WHERE manual.id = 'mdsmk047rpc'
      AND manual.payment_id = 'mdsmk047rpc'
      AND manual.employee_username = v_username
      AND manual.period_month = v_current_month
      AND manual.basis = 'owner_attested_legacy_delivery'
      AND manual.salary_currency = v_currency
      AND manual.requested_amount = 1
      AND manual.approved_amount = 1
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments AS payment
    WHERE payment.id = 'mdsmk047rpc'
      AND payment.username = v_username
      AND payment.source_type = 'deduction'
      AND payment.source_id = 'mdsmk047rpc'
      AND payment.amount = 1
      AND payment.currency = v_currency
      AND payment.status = 'approved'
      AND payment.effective_month = v_current_month
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.pyra_manual_deduction_tasks AS linked_task
    WHERE linked_task.manual_deduction_id = 'mdsmk047rpc'
      AND linked_task.task_id = v_task_id
  ) THEN
    RAISE EXCEPTION '047 rollback smoke: atomic manual/payment/task linkage is incomplete';
  END IF;

  -- The exact insert capability must be consumed by the trigger. The direct
  -- probes intentionally run in this same outer transaction, proving that a
  -- successful RPC cannot leak writer authority to later statements.
  IF EXISTS (
    SELECT 1
    FROM public.pyra_deduction_write_capabilities
    WHERE transaction_id = pg_catalog.pg_current_xact_id()::text::bigint
  ) THEN
    RAISE EXCEPTION '047 rollback smoke: one-shot capability leaked after atomic RPC';
  END IF;

  -- Exercise the calculation issuer against the active trigger. It must link
  -- the approved deduction only after minting the exact one-shot UPDATE
  -- capability; all payroll fixtures remain inside the runner rollback.
  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_commit_payroll_calculation(
    'prsmk047guard',
    NULL,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', 'pismk047guard',
        'username', v_username,
        'salary_snapshot', v_salary,
        'base_salary', v_salary,
        'task_payments', 0,
        'overtime_amount', 0,
        'bonus', 0,
        'commission', 0,
        'monetary_deductions', 1,
        'unpaid_leave_deductions', 0,
        'deductions', 1,
        'deduction_details', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('source_type', 'deduction', 'amount', 1)
        ),
        'net_pay', v_salary - 1
      )
    ),
    ARRAY['mdsmk047rpc']::varchar[],
    25
  ) AS result;

  IF v_status IS DISTINCT FROM 'ok'
     OR NOT v_changed
     OR NOT EXISTS (
       SELECT 1
       FROM public.pyra_employee_payments AS payment
       WHERE payment.id = 'mdsmk047rpc'
         AND payment.payroll_id = 'prsmk047guard'
         AND payment.status = 'approved'
     )
     OR EXISTS (
       SELECT 1
       FROM public.pyra_deduction_write_capabilities
       WHERE transaction_id = pg_catalog.pg_current_xact_id()::text::bigint
     ) THEN
    RAISE EXCEPTION '047 rollback smoke: payroll calculation capability path failed';
  END IF;

  -- Approval itself does not write the deduction row, so this rollback-only
  -- transition isolates pyra_pay_payroll_run's guarded UPDATE capability.
  UPDATE public.pyra_payroll_runs
  SET status = 'approved',
      approved_by = 'smoke-047',
      approved_at = pg_catalog.clock_timestamp()
  WHERE id = 'prsmk047guard';

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_pay_payroll_run(
    'prsmk047guard',
    '047 rollback-only capability smoke'
  ) AS result;

  IF v_status IS DISTINCT FROM 'ok'
     OR NOT v_changed
     OR NOT EXISTS (
       SELECT 1
       FROM public.pyra_employee_payments AS payment
       WHERE payment.id = 'mdsmk047rpc'
         AND payment.payroll_id = 'prsmk047guard'
         AND payment.status = 'paid'
         AND payment.paid_at IS NOT NULL
     )
     OR EXISTS (
       SELECT 1
       FROM public.pyra_deduction_write_capabilities
       WHERE transaction_id = pg_catalog.pg_current_xact_id()::text::bigint
     ) THEN
    RAISE EXCEPTION '047 rollback smoke: payroll payment capability path failed';
  END IF;

  BEGIN
    UPDATE public.pyra_employee_payments
    SET description = description
    WHERE id = 'mdsmk047rpc';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM IS DISTINCT FROM 'deduction_payment_write_requires_atomic_rpc' THEN
        RAISE;
      END IF;
      v_direct_update_blocked := true;
  END;

  BEGIN
    DELETE FROM public.pyra_employee_payments
    WHERE id = 'mdsmk047rpc';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM IS DISTINCT FROM 'deduction_payment_write_requires_atomic_rpc' THEN
        RAISE;
      END IF;
      v_direct_delete_blocked := true;
  END;

  IF NOT v_direct_update_blocked OR NOT v_direct_delete_blocked THEN
    RAISE EXCEPTION '047 rollback smoke: one-shot capability leaked after atomic RPC';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments
    WHERE id = 'mdsmk047rpc'
      AND source_type = 'deduction'
  ) THEN
    RAISE EXCEPTION '047 rollback smoke: blocked update/delete changed the deduction row';
  END IF;
END;
$smoke$;

SELECT pg_catalog.jsonb_build_object(
  'status', 'ok',
  'direct_deduction_insert_update_delete_blocked', true,
  'runtime_capability_issuers', pg_catalog.jsonb_build_array(
    'pyra_approve_manual_deduction',
    'pyra_commit_payroll_calculation',
    'pyra_pay_payroll_run'
  ),
  'static_only_capability_issuers', pg_catalog.jsonb_build_array(
    'pyra_delete_draft_payroll_run',
    'pyra_approve_employee_deduction'
  ),
  'rollback_required', true
) AS migration_047_rollback_smoke;
