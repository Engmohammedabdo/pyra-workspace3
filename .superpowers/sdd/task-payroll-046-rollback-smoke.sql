-- RUNNER-ONLY: this file intentionally mutates isolated fixtures and must only
-- run through run-rollback-migration-smoke.ts, which wraps it in BEGIN/ROLLBACK.
DO $smoke$
DECLARE
  v_username varchar;
  v_currency varchar;
  v_original_currency varchar;
  v_salary numeric;
  v_cap numeric;
  v_net numeric;
  v_status text;
  v_changed boolean;
  v_calculated_at timestamptz;
  v_item_before jsonb;
  v_manual_cap numeric;
  v_expected_manual numeric;
  v_manual_data jsonb;
  v_payment_data jsonb;
  v_current_quality_evidence jsonb;
  v_current_legacy_evidence jsonb;
  v_future_legacy_evidence jsonb;
  v_legacy_task jsonb;
  v_task_id varchar(20);
  v_task_title text;
  v_task_due_date date;
  v_task_due_at timestamptz;
  v_case public.pyra_deduction_cases%ROWTYPE;
  v_other_currency varchar;
  v_computed_current_blocked boolean := false;
  v_missing_task_blocked boolean := false;
  v_current_month date := pg_catalog.date_trunc(
    'month',
    pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Dubai'
  )::date;
  v_future_month date := (
    pg_catalog.date_trunc(
      'month',
      pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Dubai'
    ) + INTERVAL '1 month'
  )::date;
BEGIN
  SELECT u.username, u.salary_currency, pg_catalog.round(u.salary, 2)
  INTO v_username, v_original_currency, v_salary
  FROM public.pyra_users AS u
  WHERE u.role = 'employee'
    AND u.status = 'active'
    AND u.payment_type = 'monthly_salary'
    AND u.salary >= 100
    AND u.salary_currency IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.pyra_employee_payments AS legacy_deduction
      WHERE legacy_deduction.username = u.username
        AND legacy_deduction.source_type = 'deduction'
        AND legacy_deduction.effective_month IS NULL
        AND legacy_deduction.status IN ('pending', 'approved', 'paid')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.pyra_employee_payments AS current_deduction
      WHERE current_deduction.username = u.username
        AND current_deduction.source_type = 'deduction'
        AND current_deduction.effective_month = v_current_month
        AND current_deduction.status IN ('pending', 'approved', 'paid')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.pyra_deduction_cases AS current_case
      WHERE current_case.employee_username = u.username
        AND current_case.period_month = v_current_month
    )
  ORDER BY u.username
  LIMIT 1;

  IF v_username IS NULL THEN
    RAISE EXCEPTION '046 rollback smoke: active salaried employee fixture is missing';
  END IF;

  -- Decouple the rollback smoke from real current-month payroll runs. The
  -- selected employee currency change is transaction-local and always rolled
  -- back by the runner; no concurrent session can observe it.
  SELECT candidate.currency
  INTO v_currency
  FROM pg_catalog.unnest(ARRAY['XQA', 'XQB', 'XQC']::varchar[]) AS candidate(currency)
  WHERE candidate.currency IS DISTINCT FROM v_original_currency
    AND NOT EXISTS (
      SELECT 1
      FROM public.pyra_payroll_runs AS payroll
      WHERE payroll.currency = candidate.currency
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.pyra_employee_payments AS payment
      WHERE payment.currency = candidate.currency
    )
  ORDER BY candidate.currency
  LIMIT 1;

  IF v_currency IS NULL THEN
    RAISE EXCEPTION '046 rollback smoke: isolated transaction currency fixture is missing';
  END IF;

  UPDATE public.pyra_users
  SET salary_currency = v_currency
  WHERE username = v_username;
  IF NOT FOUND THEN
    RAISE EXCEPTION '046 rollback smoke: employee currency fixture update failed';
  END IF;

  v_other_currency := v_original_currency;

  -- The task is only an existing FK/uniqueness fixture. Business attribution
  -- is verified by the API's trusted report builder, not re-inferred here.
  SELECT task.id, task.title, task.due_date, task.due_at
  INTO v_task_id, v_task_title, v_task_due_date, v_task_due_at
  FROM public.pyra_tasks AS task
  WHERE task.due_date IS NOT NULL
    AND task.title IS NOT NULL
    AND pg_catalog.btrim(task.id) <> ''
    AND pg_catalog.length(task.id) <= 20
    AND task.due_date < v_current_month
    AND NOT EXISTS (
      SELECT 1
      FROM public.pyra_manual_deduction_tasks AS linked_task
      WHERE linked_task.task_id = task.id
    )
  ORDER BY task.id
  LIMIT 1;

  IF v_task_id IS NULL THEN
    RAISE EXCEPTION '046 rollback smoke: unlinked historical task fixture is missing';
  END IF;

  v_legacy_task := pg_catalog.jsonb_build_object(
    'task_id', v_task_id,
    'title', v_task_title,
    'due_date', v_task_due_date::text,
    'due_at', v_task_due_at,
    'first_submitted_at', v_current_month::timestamp AT TIME ZONE 'Asia/Dubai',
    'outcome', 'excluded',
    'exclusion_reason', 'legacy_unverified_attribution',
    'attribution_status', 'legacy_unverified'
  );
  v_current_legacy_evidence := pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'source', 'employee_deductions_admin_approval',
    'basis', 'owner_attested_legacy_delivery',
    'employee_username', v_username,
    'report_month', pg_catalog.to_char(v_current_month, 'YYYY-MM'),
    'legacy_delivery', pg_catalog.jsonb_build_object(
      'evaluation', 'submitted_after_due_calendar_day_dubai',
      'owner_attested', true,
      'tasks', pg_catalog.jsonb_build_array(v_legacy_task)
    )
  );
  v_future_legacy_evidence := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      v_current_legacy_evidence,
      '{report_month}',
      pg_catalog.to_jsonb(pg_catalog.to_char(v_future_month, 'YYYY-MM'))
    ),
    '{legacy_delivery,tasks,0,first_submitted_at}',
    pg_catalog.to_jsonb(v_future_month::timestamp AT TIME ZONE 'Asia/Dubai')
  );

  v_current_quality_evidence := pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'source', 'employee_deductions_admin_approval',
    'basis', 'quality_repeated_pattern',
    'employee_username', v_username,
    'report_month', pg_catalog.to_char(v_current_month, 'YYYY-MM'),
    'quality', pg_catalog.jsonb_build_object(
      'policy', pg_catalog.jsonb_build_object(
        'avg_rounds_above', 2,
        'rejection_rate_at_least_percent', 20,
        'consecutive_months_required', 2
      ),
      'eligibility', pg_catalog.jsonb_build_object(
        'current_below_band', true,
        'consecutive_months', 2,
        'eligible', true
      ),
      'months', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'month', pg_catalog.to_char(v_current_month - INTERVAL '1 month', 'YYYY-MM'),
          'avg_rounds', 3,
          'review_rounds_total', 6,
          'reviewed_task_count', 2,
          'outright_rejection_count', 0,
          'outright_rejection_rate', 0
        ),
        pg_catalog.jsonb_build_object(
          'month', pg_catalog.to_char(v_current_month, 'YYYY-MM'),
          'avg_rounds', 3,
          'review_rounds_total', 6,
          'reviewed_task_count', 2,
          'outright_rejection_count', 0,
          'outright_rejection_rate', 0
        )
      )
    )
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.pyra_expense_categories WHERE id = 'ec_salaries'
  ) THEN
    RAISE EXCEPTION '046 rollback smoke: salaries expense category is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_payroll_runs
    WHERE id IN ('prsmk046calc', 'prsmk046delete', 'prsmk046current')
       OR (year = 1996 AND month IN (11, 12) AND currency = v_currency)
       OR (year = 1995 AND month = 7 AND currency = v_currency)
  ) OR EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments
    WHERE id IN (
      'epsmk046deduct', 'epsmk046bonus', 'epsmk046late',
      'epsmk046direct', 'epsmk046delete', 'epsmk046prior',
      'epsmk046caseprior', 'epsmk046computed', 'mdsmk046manual',
      'mdsmk046full', 'mdsmk046closed', 'epsmk046currprior',
      'mdsmk046currency', 'mdsmk046future', 'epsmk046fxcurrency',
      'mdsmk046current', 'mdsmk046capchg', 'dcsmk046current',
      'epsmk046current', 'epsmk046postpay', 'mdsmk046badtype',
      'mdsmk046badbool', 'mdsmk046dupids', 'mdsmk046quality',
      'mdsmk046duptask', 'mdsmk046missing'
    )
  ) OR EXISTS (
    SELECT 1
    FROM public.pyra_payroll_items
    WHERE id IN ('pismk046calc', 'pismk046delete')
  ) OR EXISTS (
    SELECT 1
    FROM public.pyra_expenses
    WHERE id IN ('expsmk046calc', 'expsmk046delete')
  ) OR EXISTS (
    SELECT 1
    FROM public.pyra_manual_deductions
    WHERE id IN (
      'mdsmk046manual', 'mdsmk046full', 'mdsmk046closed',
      'mdsmk046currency', 'mdsmk046future', 'mdsmk046current',
      'mdsmk046capchg', 'mdsmk046badtype', 'mdsmk046badbool',
      'mdsmk046dupids', 'mdsmk046quality', 'mdsmk046duptask',
      'mdsmk046missing'
    )
  ) OR EXISTS (
    SELECT 1
    FROM public.pyra_deduction_cases
    WHERE id IN ('dcsmk046computed', 'dcsmk046current')
  ) OR EXISTS (
    SELECT 1
    FROM public.pyra_tasks
    WHERE id = 'tk_smk046_missing'
  ) THEN
    RAISE EXCEPTION '046 rollback smoke: synthetic fixture IDs collide';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments AS ep
    WHERE ep.status = 'approved'
      AND ep.source_type <> 'final_settlement'
      AND ep.payroll_id IS NULL
      AND COALESCE(ep.currency, 'AED') = COALESCE(v_currency, 'AED')
      AND (
        (ep.source_type = 'deduction' AND ep.effective_month = DATE '1996-12-01')
        OR (
          ep.effective_month IS NULL
          AND ep.created_at >= '1996-12-01 00:00:00+04'::timestamptz
          AND ep.created_at < '1997-01-01 00:00:00+04'::timestamptz
        )
      )
  ) THEN
    RAISE EXCEPTION '046 rollback smoke: future payment period is not isolated';
  END IF;

  v_cap := pg_catalog.round(LEAST(300::numeric, v_salary * 0.25), 2);
  v_net := pg_catalog.round(v_salary + 100 - v_cap, 2);

  IF EXISTS (
    SELECT 1
    FROM public.pyra_payroll_runs
    WHERE year = 1995 AND month = 9 AND currency = v_currency
  ) OR EXISTS (
    SELECT 1
    FROM public.pyra_employee_payments AS ep
    WHERE ep.username = v_username
      AND ep.source_type = 'deduction'
      AND COALESCE(ep.currency, 'AED') = COALESCE(v_currency, 'AED')
      AND ep.effective_month = DATE '1995-09-01'
      AND ep.status IN ('pending', 'approved', 'paid')
  ) THEN
    RAISE EXCEPTION '046 rollback smoke: aggregate-cap historical period is not isolated';
  END IF;

  -- Quality remains warning-only until the owner locks the timing basis. Even
  -- otherwise-valid repeated-pattern evidence must never create money.
  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_approve_manual_deduction(
    'mdsmk046quality',
    'mdsmk046quality',
    v_username,
    v_current_month,
    v_salary,
    v_currency,
    1,
    25,
    'quality_repeated_pattern',
    'Quality timing must remain fail closed',
    v_current_quality_evidence,
    'smoke-046'
  ) AS result;
  IF v_status IS DISTINCT FROM 'quality_timing_unconfirmed' OR v_changed
     OR EXISTS (SELECT 1 FROM public.pyra_manual_deductions WHERE id = 'mdsmk046quality')
     OR EXISTS (SELECT 1 FROM public.pyra_employee_payments WHERE id = 'mdsmk046quality') THEN
    RAISE EXCEPTION '046 rollback smoke: unconfirmed quality timing created money';
  END IF;

  -- JSON scalar types are part of the immutable evidence contract. Text that
  -- merely looks like the required number/boolean must fail without writes.
  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_approve_manual_deduction(
    'mdsmk046badtype',
    'mdsmk046badtype',
    v_username,
    v_current_month,
    v_salary,
    v_currency,
    1,
    25,
    'owner_attested_legacy_delivery',
    'Schema version type smoke',
    pg_catalog.jsonb_set(
      v_current_legacy_evidence,
      '{schema_version}',
      '"1"'::jsonb
    ),
    'smoke-046'
  ) AS result;
  IF v_status IS DISTINCT FROM 'invalid_payload' OR v_changed
     OR EXISTS (SELECT 1 FROM public.pyra_manual_deductions WHERE id = 'mdsmk046badtype')
     OR EXISTS (SELECT 1 FROM public.pyra_employee_payments WHERE id = 'mdsmk046badtype')
     OR EXISTS (
       SELECT 1 FROM public.pyra_manual_deduction_tasks
       WHERE manual_deduction_id = 'mdsmk046badtype'
     ) THEN
    RAISE EXCEPTION '046 rollback smoke: text schema version passed typed evidence validation';
  END IF;

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_approve_manual_deduction(
    'mdsmk046badbool',
    'mdsmk046badbool',
    v_username,
    v_current_month,
    v_salary,
    v_currency,
    1,
    25,
    'owner_attested_legacy_delivery',
    'Owner attestation type smoke',
    pg_catalog.jsonb_set(
      v_current_legacy_evidence,
      '{legacy_delivery,owner_attested}',
      '"true"'::jsonb
    ),
    'smoke-046'
  ) AS result;
  IF v_status IS DISTINCT FROM 'invalid_payload' OR v_changed
     OR EXISTS (SELECT 1 FROM public.pyra_manual_deductions WHERE id = 'mdsmk046badbool')
     OR EXISTS (SELECT 1 FROM public.pyra_employee_payments WHERE id = 'mdsmk046badbool')
     OR EXISTS (
       SELECT 1 FROM public.pyra_manual_deduction_tasks
       WHERE manual_deduction_id = 'mdsmk046badbool'
     ) THEN
    RAISE EXCEPTION '046 rollback smoke: text owner attestation passed typed evidence validation';
  END IF;

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_approve_manual_deduction(
    'mdsmk046dupids',
    'mdsmk046dupids',
    v_username,
    v_current_month,
    v_salary,
    v_currency,
    1,
    25,
    'owner_attested_legacy_delivery',
    'Duplicate task ids in one evidence payload',
    pg_catalog.jsonb_set(
      v_current_legacy_evidence,
      '{legacy_delivery,tasks}',
      pg_catalog.jsonb_build_array(v_legacy_task, v_legacy_task)
    ),
    'smoke-046'
  ) AS result;
  IF v_status IS DISTINCT FROM 'invalid_payload' OR v_changed
     OR EXISTS (SELECT 1 FROM public.pyra_manual_deductions WHERE id = 'mdsmk046dupids')
     OR EXISTS (SELECT 1 FROM public.pyra_employee_payments WHERE id = 'mdsmk046dupids')
     OR EXISTS (
       SELECT 1 FROM public.pyra_manual_deduction_tasks
       WHERE manual_deduction_id = 'mdsmk046dupids'
     ) THEN
    RAISE EXCEPTION '046 rollback smoke: duplicate task ids passed evidence validation';
  END IF;

  -- The child-task FK failure must roll back the payment and immutable manual
  -- row created earlier inside the same RPC call.
  BEGIN
    PERFORM public.pyra_approve_manual_deduction(
      'mdsmk046missing',
      'mdsmk046missing',
      v_username,
      v_current_month,
      v_salary,
      v_currency,
      1,
      25,
      'owner_attested_legacy_delivery',
      'Missing task FK atomicity smoke',
      pg_catalog.jsonb_set(
        v_current_legacy_evidence,
        '{legacy_delivery,tasks,0,task_id}',
        pg_catalog.to_jsonb('tk_smk046_missing'::text)
      ),
      'smoke-046'
    );
  EXCEPTION
    WHEN foreign_key_violation THEN
      v_missing_task_blocked := true;
  END;
  IF NOT v_missing_task_blocked
     OR EXISTS (SELECT 1 FROM public.pyra_manual_deductions WHERE id = 'mdsmk046missing')
     OR EXISTS (SELECT 1 FROM public.pyra_employee_payments WHERE id = 'mdsmk046missing')
     OR EXISTS (
       SELECT 1 FROM public.pyra_manual_deduction_tasks
       WHERE manual_deduction_id = 'mdsmk046missing'
     ) THEN
    RAISE EXCEPTION '046 rollback smoke: missing task FK left a partial deduction';
  END IF;

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_approve_manual_deduction(
    'mdsmk046future',
    'mdsmk046future',
    v_username,
    v_future_month,
    v_salary,
    v_currency,
    1,
    25,
    'owner_attested_legacy_delivery',
    'Future month must be rejected',
    v_future_legacy_evidence,
    'smoke-046'
  ) AS result;
  IF v_status IS DISTINCT FROM 'current_month_only' OR v_changed
     OR EXISTS (SELECT 1 FROM public.pyra_manual_deductions WHERE id = 'mdsmk046future')
     OR EXISTS (SELECT 1 FROM public.pyra_employee_payments WHERE id = 'mdsmk046future') THEN
    RAISE EXCEPTION '046 rollback smoke: non-current manual month did not fail closed';
  END IF;

  INSERT INTO public.pyra_employee_payments (
    id, username, source_type, source_id, description, amount, currency,
    status, approved_by, approved_at, created_at, effective_month
  ) VALUES (
    'epsmk046currprior', v_username, 'deduction', 'srcsmk046curr',
    '046 cross-currency integrity smoke', 1, v_other_currency, 'approved',
    'smoke-046', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(),
    v_current_month
  );

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_approve_manual_deduction(
    'mdsmk046currency',
    'mdsmk046currency',
    v_username,
    v_current_month,
    v_salary,
    v_currency,
    1,
    25,
    'owner_attested_legacy_delivery',
    'Cross-currency month must be rejected',
    v_current_legacy_evidence,
    'smoke-046'
  ) AS result;
  IF v_status IS DISTINCT FROM 'currency_conflict' OR v_changed
     OR EXISTS (SELECT 1 FROM public.pyra_manual_deductions WHERE id = 'mdsmk046currency')
     OR EXISTS (SELECT 1 FROM public.pyra_employee_payments WHERE id = 'mdsmk046currency') THEN
    RAISE EXCEPTION '046 rollback smoke: cross-currency month did not fail closed';
  END IF;

  DELETE FROM public.pyra_employee_payments WHERE id = 'epsmk046currprior';

  -- Aggregate cap: a documented manual approval consumes only the
  -- remaining 25% after an already-approved same-month system/manual row.
  v_manual_cap := pg_catalog.round(v_salary * 0.25, 2);
  v_expected_manual := pg_catalog.round(v_manual_cap - 10, 2);
  INSERT INTO public.pyra_employee_payments (
    id, username, source_type, source_id, description, amount, currency,
    status, approved_by, approved_at, created_at, effective_month
  ) VALUES (
    'epsmk046prior', v_username, 'deduction', 'srcsmk046prior',
    '046 prior deduction cap smoke', 10, v_currency, 'approved',
    'smoke-046', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(),
    v_current_month
  );

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_approve_manual_deduction(
    'mdsmk046capchg',
    'mdsmk046capchg',
    v_username,
    v_current_month,
    v_salary,
    v_currency,
    v_manual_cap,
    25,
    'owner_attested_legacy_delivery',
    'Stale preview must be reconfirmed',
    v_current_legacy_evidence,
    'smoke-046'
  ) AS result;
  IF v_status IS DISTINCT FROM 'cap_changed' OR v_changed
     OR EXISTS (SELECT 1 FROM public.pyra_manual_deductions WHERE id = 'mdsmk046capchg')
     OR EXISTS (SELECT 1 FROM public.pyra_employee_payments WHERE id = 'mdsmk046capchg') THEN
    RAISE EXCEPTION '046 rollback smoke: stale manual amount was silently reduced or written';
  END IF;

  SELECT result.status, result.changed, result.manual_data, result.payment_data
  INTO v_status, v_changed, v_manual_data, v_payment_data
  FROM public.pyra_approve_manual_deduction(
    'mdsmk046manual',
    'mdsmk046manual',
    v_username,
    v_current_month,
    v_salary,
    v_currency,
    v_expected_manual,
    25,
    'owner_attested_legacy_delivery',
    'Owner-attested legacy delivery decision',
    v_current_legacy_evidence,
    'smoke-046'
  ) AS result;

  IF v_status IS DISTINCT FROM 'ok' OR NOT v_changed
     OR pg_catalog.round((v_manual_data ->> 'prior_approved_amount')::numeric, 2) <> 10
     OR pg_catalog.round((v_manual_data ->> 'approved_amount')::numeric, 2) <> v_expected_manual
     OR (v_manual_data ->> 'basis') IS DISTINCT FROM 'owner_attested_legacy_delivery'
     OR pg_catalog.round((v_payment_data ->> 'amount')::numeric, 2) <> v_expected_manual
     OR (v_payment_data ->> 'status') IS DISTINCT FROM 'approved'
     OR (v_payment_data ->> 'effective_month') IS DISTINCT FROM v_current_month::text
     OR (v_payment_data ->> 'source_id') IS DISTINCT FROM 'mdsmk046manual'
     OR (v_payment_data ->> 'currency') IS DISTINCT FROM v_currency
     OR (
       SELECT pg_catalog.count(*)
       FROM public.pyra_manual_deduction_tasks AS linked_task
       WHERE linked_task.manual_deduction_id = 'mdsmk046manual'
     ) <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM public.pyra_manual_deduction_tasks AS linked_task
       WHERE linked_task.manual_deduction_id = 'mdsmk046manual'
         AND linked_task.task_id = v_task_id
     ) THEN
    RAISE EXCEPTION '046 rollback smoke: aggregate manual approval postconditions failed';
  END IF;

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_approve_manual_deduction(
    'mdsmk046manual',
    'mdsmk046manual',
    v_username,
    v_current_month,
    v_salary,
    v_currency,
    v_expected_manual,
    25,
    'owner_attested_legacy_delivery',
    'Owner-attested legacy delivery decision',
    v_current_legacy_evidence,
    'smoke-046'
  ) AS result;
  IF v_status IS DISTINCT FROM 'already_approved' OR v_changed THEN
    RAISE EXCEPTION '046 rollback smoke: manual approval retry is not idempotent';
  END IF;

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_approve_manual_deduction(
    'mdsmk046manual',
    'mdsmk046manual',
    v_username,
    v_current_month,
    v_salary,
    v_currency,
    v_expected_manual,
    25,
    'owner_attested_legacy_delivery',
    'Different reason must conflict',
    v_current_legacy_evidence,
    'smoke-046'
  ) AS result;
  IF v_status IS DISTINCT FROM 'idempotency_conflict' OR v_changed THEN
    RAISE EXCEPTION '046 rollback smoke: changed idempotency payload was accepted';
  END IF;

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_approve_manual_deduction(
    'mdsmk046full',
    'mdsmk046full',
    v_username,
    v_current_month,
    v_salary,
    v_currency,
    1,
    25,
    'owner_attested_legacy_delivery',
    'Cap exhausted smoke',
    v_current_legacy_evidence,
    'smoke-046'
  ) AS result;
  IF v_status IS DISTINCT FROM 'cap_exhausted' OR v_changed
     OR EXISTS (SELECT 1 FROM public.pyra_manual_deductions WHERE id = 'mdsmk046full')
     OR EXISTS (SELECT 1 FROM public.pyra_employee_payments WHERE id = 'mdsmk046full') THEN
    RAISE EXCEPTION '046 rollback smoke: exhausted cap created a partial manual deduction';
  END IF;

  -- The computed case uses the same aggregate ledger ceiling and persists the
  -- prior/remaining snapshots required by its new formula constraint.
  BEGIN
    PERFORM public.pyra_approve_employee_deduction(
      'dcsmk046current', 'epsmk046current', v_username, v_current_month,
      v_salary, v_currency, 1, 1, NULL, 'none', 0, 0, NULL, NULL,
      false, 0, false, 0, 25,
      '{"kind":"computed-current-policy-smoke"}'::jsonb,
      '{}'::jsonb,
      'current month must remain at risk only',
      '046 computed current deduction smoke',
      'smoke-046'
    );
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM IS DISTINCT FROM 'deduction_current_period' THEN
        RAISE;
      END IF;
      v_computed_current_blocked := true;
  END;
  IF NOT v_computed_current_blocked
     OR EXISTS (SELECT 1 FROM public.pyra_deduction_cases WHERE id = 'dcsmk046current')
     OR EXISTS (SELECT 1 FROM public.pyra_employee_payments WHERE id = 'epsmk046current') THEN
    RAISE EXCEPTION '046 rollback smoke: current computed deduction was accepted';
  END IF;

  INSERT INTO public.pyra_employee_payments (
    id, username, source_type, source_id, description, amount, currency,
    status, approved_by, approved_at, created_at, effective_month
  ) VALUES (
    'epsmk046caseprior', v_username, 'deduction', 'srcsmk046case',
    '046 computed prior deduction smoke', 10, v_currency, 'approved',
    'smoke-046', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(),
    DATE '1995-09-01'
  );

  SELECT computed_case.*
  INTO v_case
  FROM public.pyra_approve_employee_deduction(
    'dcsmk046computed',
    'epsmk046computed',
    v_username,
    DATE '1995-09-01',
    v_salary,
    v_currency,
    1,
    100,
    NULL,
    'none',
    0,
    0,
    NULL,
    NULL,
    false,
    0,
    false,
    0,
    25,
    '{"kind":"computed-cap-smoke"}'::jsonb,
    '{}'::jsonb,
    'aggregate cap smoke',
    '046 computed deduction smoke',
    'smoke-046'
  ) AS computed_case;

  IF v_case.id IS DISTINCT FROM 'dcsmk046computed'
     OR v_case.prior_approved_amount <> 10
     OR v_case.remaining_cap_amount <> v_expected_manual
     OR v_case.approved_amount <> LEAST(100::numeric, v_expected_manual)
     OR (SELECT pg_catalog.round(amount, 2) FROM public.pyra_employee_payments
         WHERE id = 'epsmk046computed') <> LEAST(100::numeric, v_expected_manual) THEN
    RAISE EXCEPTION '046 rollback smoke: computed aggregate cap snapshots failed';
  END IF;

  INSERT INTO public.pyra_payroll_runs (
    id, month, year, status, total_amount, currency, employee_count, created_by
  ) VALUES (
    'prsmk046calc', 12, 1996, 'draft', 0, v_currency, 0, 'smoke-046'
  );

  INSERT INTO public.pyra_employee_payments (
    id, username, source_type, description, amount, currency, status,
    approved_by, approved_at, created_at, effective_month
  ) VALUES
    (
      'epsmk046deduct', v_username, 'deduction', '046 capped deduction smoke',
      v_cap + 1, v_currency, 'approved', 'smoke-046', pg_catalog.clock_timestamp(),
      '1996-12-15 12:00:00+04'::timestamptz, DATE '1996-12-01'
    ),
    (
      'epsmk046bonus', v_username, 'bonus', '046 bonus smoke',
      100, v_currency, 'approved', 'smoke-046', pg_catalog.clock_timestamp(),
      '1996-12-15 12:00:00+04'::timestamptz, NULL
    );

  -- An over-cap legacy ledger amount cannot be linked and silently settled at
  -- the lower submitted cap. The whole calculation must remain untouched.
  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_commit_payroll_calculation(
    'prsmk046calc',
    NULL::timestamptz,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', 'pismk046calc',
      'username', v_username,
      'salary_snapshot', v_salary,
      'base_salary', v_salary,
      'task_payments', 0,
      'overtime_amount', 0,
      'bonus', 100,
      'commission', 0,
      'monetary_deductions', v_cap,
      'unpaid_leave_deductions', 0,
      'deductions', v_cap,
      'deduction_details', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('type', 'deduction', 'amount', v_cap)
      ),
      'net_pay', v_net
    )),
    ARRAY['epsmk046deduct', 'epsmk046bonus']::varchar[],
    25
  ) AS result;

  IF v_status IS DISTINCT FROM 'blocked_input' OR v_changed
     OR EXISTS (SELECT 1 FROM public.pyra_payroll_items WHERE payroll_id = 'prsmk046calc')
     OR EXISTS (SELECT 1 FROM public.pyra_employee_payments WHERE payroll_id = 'prsmk046calc') THEN
    RAISE EXCEPTION '046 rollback smoke: unapplied deduction excess was linked or partially written';
  END IF;

  UPDATE public.pyra_employee_payments
  SET amount = v_cap
  WHERE id = 'epsmk046deduct';

  INSERT INTO public.pyra_employee_payments (
    id, username, source_type, description, amount, currency, status,
    approved_by, approved_at, created_at
  ) VALUES (
    'epsmk046fxcurrency', v_username, 'bonus', '046 payroll currency conflict',
    1, v_other_currency, 'approved', 'smoke-046', pg_catalog.clock_timestamp(),
    '1996-12-15 12:00:00+04'::timestamptz
  );

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_commit_payroll_calculation(
    'prsmk046calc',
    NULL::timestamptz,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', 'pismk046calc',
      'username', v_username,
      'salary_snapshot', v_salary,
      'base_salary', v_salary,
      'task_payments', 0,
      'overtime_amount', 0,
      'bonus', 100,
      'commission', 0,
      'monetary_deductions', v_cap,
      'unpaid_leave_deductions', 0,
      'deductions', v_cap,
      'deduction_details', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('type', 'deduction', 'amount', v_cap)
      ),
      'net_pay', v_net
    )),
    ARRAY['epsmk046deduct', 'epsmk046bonus']::varchar[],
    25
  ) AS result;

  IF v_status IS DISTINCT FROM 'blocked_input' OR v_changed
     OR EXISTS (SELECT 1 FROM public.pyra_payroll_items WHERE payroll_id = 'prsmk046calc')
     OR (SELECT payroll_id FROM public.pyra_employee_payments WHERE id = 'epsmk046fxcurrency') IS NOT NULL THEN
    RAISE EXCEPTION '046 rollback smoke: cross-currency payroll input was skipped or partially written';
  END IF;

  DELETE FROM public.pyra_employee_payments WHERE id = 'epsmk046fxcurrency';

  -- A stale salary snapshot must block before replacing payroll items or
  -- linking any payment. The employee row is the authoritative fixed salary.
  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_commit_payroll_calculation(
    'prsmk046calc',
    NULL::timestamptz,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', 'pismk046calc',
      'username', v_username,
      'salary_snapshot', v_salary + 1,
      'base_salary', v_salary,
      'task_payments', 0,
      'overtime_amount', 0,
      'bonus', 100,
      'commission', 0,
      'monetary_deductions', v_cap,
      'unpaid_leave_deductions', 0,
      'deductions', v_cap,
      'deduction_details', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('type', 'deduction', 'amount', v_cap)
      ),
      'net_pay', v_net
    )),
    ARRAY['epsmk046deduct', 'epsmk046bonus']::varchar[],
    25
  ) AS result;

  IF v_status IS DISTINCT FROM 'blocked_input' OR v_changed
     OR EXISTS (SELECT 1 FROM public.pyra_payroll_items WHERE payroll_id = 'prsmk046calc')
     OR NOT EXISTS (
       SELECT 1
       FROM public.pyra_payroll_runs AS payroll
       WHERE payroll.id = 'prsmk046calc'
         AND payroll.status IS NOT DISTINCT FROM 'draft'
         AND payroll.total_amount IS NOT DISTINCT FROM 0
         AND payroll.employee_count IS NOT DISTINCT FROM 0
         AND payroll.calculated_at IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM public.pyra_employee_payments
       WHERE id IN ('epsmk046deduct', 'epsmk046bonus')
         AND payroll_id = 'prsmk046calc'
     ) THEN
    RAISE EXCEPTION '046 rollback smoke: stale salary snapshot wrote payroll state';
  END IF;

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_commit_payroll_calculation(
    'prsmk046calc',
    NULL::timestamptz,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', 'pismk046calc',
      'username', v_username,
      'salary_snapshot', v_salary,
      'base_salary', v_salary,
      'task_payments', 0,
      'overtime_amount', 0,
      'bonus', 100,
      'commission', 0,
      'monetary_deductions', v_cap,
      'unpaid_leave_deductions', 0,
      'deductions', v_cap,
      'deduction_details', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('type', 'deduction', 'amount', v_cap)
      ),
      'net_pay', v_net
    )),
    ARRAY['epsmk046deduct', 'epsmk046bonus']::varchar[],
    25
  ) AS result;

  IF v_status IS DISTINCT FROM 'ok' OR NOT v_changed THEN
    RAISE EXCEPTION '046 rollback smoke: calculate failed with status %', v_status;
  END IF;

  SELECT pr.calculated_at
  INTO v_calculated_at
  FROM public.pyra_payroll_runs AS pr
  WHERE pr.id = 'prsmk046calc'
    AND pr.status = 'calculated'
    AND pr.employee_count = 1
    AND pg_catalog.round(pr.total_amount, 2) = v_net;

  SELECT pg_catalog.to_jsonb(pi)
  INTO v_item_before
  FROM public.pyra_payroll_items AS pi
  WHERE pi.id = 'pismk046calc'
    AND pi.payroll_id = 'prsmk046calc'
    AND pi.username = v_username
    AND pg_catalog.round(pi.deductions, 2) = v_cap
    AND pg_catalog.round(pi.net_pay, 2) = v_net;

  IF v_calculated_at IS NULL OR v_item_before IS NULL OR (
    SELECT pg_catalog.count(*)
    FROM public.pyra_employee_payments
    WHERE id IN ('epsmk046deduct', 'epsmk046bonus')
      AND payroll_id = 'prsmk046calc'
  ) <> 2 THEN
    RAISE EXCEPTION '046 rollback smoke: calculate postconditions failed';
  END IF;

  -- A newly-approved same-period deduction must block stale recalculation and
  -- leave the existing calculated item/payment links untouched.
  INSERT INTO public.pyra_employee_payments (
    id, username, source_type, description, amount, currency, status,
    approved_by, approved_at, created_at, effective_month
  ) VALUES (
    'epsmk046late', v_username, 'deduction', '046 late deduction conflict',
    10, v_currency, 'approved', 'smoke-046', pg_catalog.clock_timestamp(),
    '1997-01-02 12:00:00+04'::timestamptz, DATE '1996-12-01'
  );

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_commit_payroll_calculation(
    'prsmk046calc',
    v_calculated_at,
    pg_catalog.jsonb_build_array(v_item_before || pg_catalog.jsonb_build_object(
      'salary_snapshot', v_salary,
      'monetary_deductions', v_cap,
      'unpaid_leave_deductions', 0
    )),
    ARRAY['epsmk046deduct', 'epsmk046bonus']::varchar[],
    25
  ) AS result;

  IF v_status IS DISTINCT FROM 'blocked_input' OR v_changed THEN
    RAISE EXCEPTION '046 rollback smoke: stale payment set was not blocked';
  END IF;

  IF (SELECT pg_catalog.to_jsonb(pi) FROM public.pyra_payroll_items AS pi WHERE pi.id = 'pismk046calc')
       IS DISTINCT FROM v_item_before
     OR (SELECT payroll_id FROM public.pyra_employee_payments WHERE id = 'epsmk046late') IS NOT NULL
     OR (SELECT pg_catalog.count(*) FROM public.pyra_employee_payments
         WHERE id IN ('epsmk046deduct', 'epsmk046bonus') AND payroll_id = 'prsmk046calc') <> 2 THEN
    RAISE EXCEPTION '046 rollback smoke: blocked calculation partially mutated state';
  END IF;

  -- Remove only the synthetic conflicting row after proving the recalculation
  -- guard, so the following approval success path starts from an exact set.
  DELETE FROM public.pyra_employee_payments WHERE id = 'epsmk046late';

  -- Invalid expense payload must not approve the run or create a partial expense.
  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_approve_payroll_run(
    'prsmk046calc',
    v_calculated_at,
    'smoke-046',
    NULL,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', 'expsmk046calc',
      'username', v_username,
      'description', '046 salary expense smoke',
      'amount', v_net + 1,
      'currency', v_currency,
      'project_id', NULL,
      'expense_date', DATE '1996-12-31',
      'vendor', v_username
    ))
  ) AS result;

  IF v_status IS DISTINCT FROM 'blocked_input' OR v_changed
     OR (SELECT status FROM public.pyra_payroll_runs WHERE id = 'prsmk046calc') <> 'calculated'
     OR EXISTS (SELECT 1 FROM public.pyra_expenses WHERE payroll_run_id = 'prsmk046calc') THEN
    RAISE EXCEPTION '046 rollback smoke: invalid approval partially mutated state';
  END IF;

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_approve_payroll_run(
    'prsmk046calc',
    v_calculated_at,
    'smoke-046',
    'atomic smoke',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', 'expsmk046calc',
      'username', v_username,
      'description', '046 salary expense smoke',
      'amount', v_net,
      'currency', v_currency,
      'project_id', NULL,
      'expense_date', DATE '1996-12-31',
      'vendor', v_username
    ))
  ) AS result;

  IF v_status IS DISTINCT FROM 'ok' OR NOT v_changed
     OR (SELECT status FROM public.pyra_payroll_runs WHERE id = 'prsmk046calc') <> 'approved'
     OR (SELECT pg_catalog.count(*) FROM public.pyra_expenses WHERE payroll_run_id = 'prsmk046calc') <> 1 THEN
    RAISE EXCEPTION '046 rollback smoke: atomic approval postconditions failed';
  END IF;

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_pay_payroll_run('prsmk046calc', 'paid smoke') AS result;

  IF v_status IS DISTINCT FROM 'ok' OR NOT v_changed
     OR (SELECT status FROM public.pyra_payroll_runs WHERE id = 'prsmk046calc') <> 'paid'
     OR (SELECT status FROM public.pyra_payroll_items WHERE id = 'pismk046calc') <> 'paid'
     OR (SELECT pg_catalog.count(*) FROM public.pyra_employee_payments
         WHERE id IN ('epsmk046deduct', 'epsmk046bonus')
           AND payroll_id = 'prsmk046calc' AND status = 'paid' AND paid_at IS NOT NULL) <> 2 THEN
    RAISE EXCEPTION '046 rollback smoke: atomic pay postconditions failed';
  END IF;

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_pay_payroll_run('prsmk046calc', 'retry') AS result;
  IF v_status IS DISTINCT FROM 'already_paid' OR v_changed THEN
    RAISE EXCEPTION '046 rollback smoke: paid-run retry is not idempotent';
  END IF;

  INSERT INTO public.pyra_employee_payments (
    id, username, source_type, description, amount, currency, status, created_at
  ) VALUES (
    'epsmk046postpay', v_username, 'bonus', '046 closed-period approval race smoke',
    5, v_currency, 'pending', '1996-12-20 12:00:00+04'::timestamptz
  );
  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_approve_employee_payment(
    'epsmk046postpay', 'smoke-046'
  ) AS result;
  IF v_status IS DISTINCT FROM 'closed_period' OR v_changed
     OR (SELECT status FROM public.pyra_employee_payments WHERE id = 'epsmk046postpay')
        IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION '046 rollback smoke: payment approval crossed a paid payroll period';
  END IF;

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_pay_employee_payment('epsmk046bonus') AS result;
  IF v_status IS DISTINCT FROM 'payment_linked' OR v_changed THEN
    RAISE EXCEPTION '046 rollback smoke: linked direct pay was not rejected';
  END IF;

  INSERT INTO public.pyra_employee_payments (
    id, username, source_type, description, amount, currency, status,
    approved_by, approved_at, created_at, effective_month
  ) VALUES (
    'epsmk046late', v_username, 'deduction', '046 direct deduction smoke',
    10, v_currency, 'approved', 'smoke-046', pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp(), DATE '1996-12-01'
  );

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_pay_employee_payment('epsmk046late') AS result;
  IF v_status IS DISTINCT FROM 'direct_pay_disallowed' OR v_changed THEN
    RAISE EXCEPTION '046 rollback smoke: direct deduction pay was not rejected';
  END IF;

  INSERT INTO public.pyra_employee_payments (
    id, username, source_type, description, amount, currency, status, created_at
  ) VALUES (
    'epsmk046direct', v_username, 'bonus', '046 direct payment smoke',
    25, v_currency, 'pending', '1995-07-15 12:00:00+04'::timestamptz
  );

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_approve_employee_payment(
    'epsmk046direct', 'smoke-046'
  ) AS result;
  IF v_status IS DISTINCT FROM 'ok' OR NOT v_changed
     OR (SELECT status FROM public.pyra_employee_payments WHERE id = 'epsmk046direct')
        IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION '046 rollback smoke: atomic generic payment approval failed';
  END IF;

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_pay_employee_payment('epsmk046direct') AS result;
  IF v_status IS DISTINCT FROM 'ok' OR NOT v_changed
     OR (SELECT status FROM public.pyra_employee_payments WHERE id = 'epsmk046direct') <> 'paid' THEN
    RAISE EXCEPTION '046 rollback smoke: direct non-deduction pay failed';
  END IF;

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_pay_employee_payment('epsmk046direct') AS result;
  IF v_status IS DISTINCT FROM 'already_paid' OR v_changed THEN
    RAISE EXCEPTION '046 rollback smoke: direct-pay retry is not idempotent';
  END IF;

  INSERT INTO public.pyra_payroll_runs (
    id, month, year, status, total_amount, currency, employee_count, created_by
  ) VALUES (
    'prsmk046current',
    EXTRACT(month FROM v_current_month)::integer,
    EXTRACT(year FROM v_current_month)::integer,
    'paid',
    0,
    v_currency,
    0,
    'smoke-046'
  );

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_approve_manual_deduction(
    'mdsmk046closed',
    'mdsmk046closed',
    v_username,
    v_current_month,
    v_salary,
    v_currency,
    1,
    25,
    'owner_attested_legacy_delivery',
    'Closed payroll period smoke',
    v_current_legacy_evidence,
    'smoke-046'
  ) AS result;
  IF v_status IS DISTINCT FROM 'closed_period' OR v_changed
     OR EXISTS (SELECT 1 FROM public.pyra_manual_deductions WHERE id = 'mdsmk046closed')
     OR EXISTS (SELECT 1 FROM public.pyra_employee_payments WHERE id = 'mdsmk046closed') THEN
    RAISE EXCEPTION '046 rollback smoke: paid-period deduction was not blocked atomically';
  END IF;

  -- Free only the prior 10-unit ledger amount. The original manual deduction
  -- remains linked to the task, so a second manual ID must fail on cause
  -- uniqueness (not on the already-exhausted cap).
  DELETE FROM public.pyra_payroll_runs WHERE id = 'prsmk046current';
  DELETE FROM public.pyra_employee_payments WHERE id = 'epsmk046prior';

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_approve_manual_deduction(
    'mdsmk046duptask',
    'mdsmk046duptask',
    v_username,
    v_current_month,
    v_salary,
    v_currency,
    1,
    25,
    'owner_attested_legacy_delivery',
    'Cross-manual duplicate task smoke',
    v_current_legacy_evidence,
    'smoke-046'
  ) AS result;
  IF v_status IS DISTINCT FROM 'duplicate_cause' OR v_changed
     OR EXISTS (SELECT 1 FROM public.pyra_manual_deductions WHERE id = 'mdsmk046duptask')
     OR EXISTS (SELECT 1 FROM public.pyra_employee_payments WHERE id = 'mdsmk046duptask')
     OR EXISTS (
       SELECT 1 FROM public.pyra_manual_deduction_tasks
       WHERE manual_deduction_id = 'mdsmk046duptask'
     )
     OR (
       SELECT pg_catalog.count(*)
       FROM public.pyra_manual_deduction_tasks AS linked_task
       WHERE linked_task.manual_deduction_id = 'mdsmk046manual'
     ) <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM public.pyra_manual_deduction_tasks AS linked_task
       WHERE linked_task.manual_deduction_id = 'mdsmk046manual'
         AND linked_task.task_id = v_task_id
     ) THEN
    RAISE EXCEPTION '046 rollback smoke: cross-manual duplicate task was accepted or mutated state';
  END IF;

  -- Leave the following 047 smoke an isolated current-month employee fixture.
  DELETE FROM public.pyra_manual_deduction_tasks
  WHERE manual_deduction_id = 'mdsmk046manual';
  DELETE FROM public.pyra_manual_deductions WHERE id = 'mdsmk046manual';
  DELETE FROM public.pyra_employee_payments WHERE id = 'mdsmk046manual';

  INSERT INTO public.pyra_payroll_runs (
    id, month, year, status, total_amount, currency, employee_count, created_by
  ) VALUES (
    'prsmk046delete', 11, 1996, 'draft', v_salary, v_currency, 1, 'smoke-046'
  );
  INSERT INTO public.pyra_payroll_items (
    id, payroll_id, username, base_salary, task_payments, overtime_amount,
    bonus, commission, deductions, deduction_details, net_pay, currency, status
  ) VALUES (
    'pismk046delete', 'prsmk046delete', v_username, v_salary, 0, 0,
    0, 0, 0, '[]'::jsonb, v_salary, v_currency, 'pending'
  );
  INSERT INTO public.pyra_employee_payments (
    id, username, source_type, description, amount, currency, status,
    payroll_id, approved_by, approved_at, created_at
  ) VALUES (
    'epsmk046delete', v_username, 'bonus', '046 delete unlink smoke',
    5, v_currency, 'approved', 'prsmk046delete', 'smoke-046',
    pg_catalog.clock_timestamp(), '1996-11-15 12:00:00+04'::timestamptz
  );
  INSERT INTO public.pyra_expenses (
    id, category_id, description, amount, currency, expense_date, vendor,
    status, payroll_run_id, created_by
  ) VALUES (
    'expsmk046delete', 'ec_salaries', '046 delete expense smoke', v_salary,
    v_currency, DATE '1996-11-30', v_username, 'approved', 'prsmk046delete', 'smoke-046'
  );

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_delete_draft_payroll_run('prsmk046delete') AS result;
  IF v_status IS DISTINCT FROM 'ok' OR NOT v_changed
     OR EXISTS (SELECT 1 FROM public.pyra_payroll_runs WHERE id = 'prsmk046delete')
     OR EXISTS (SELECT 1 FROM public.pyra_payroll_items WHERE payroll_id = 'prsmk046delete')
     OR EXISTS (SELECT 1 FROM public.pyra_expenses WHERE payroll_run_id = 'prsmk046delete')
     OR (SELECT payroll_id FROM public.pyra_employee_payments WHERE id = 'epsmk046delete') IS NOT NULL THEN
    RAISE EXCEPTION '046 rollback smoke: atomic draft delete postconditions failed';
  END IF;

  SELECT result.status, result.changed
  INTO v_status, v_changed
  FROM public.pyra_delete_draft_payroll_run('prsmk046calc') AS result;
  IF v_status IS DISTINCT FROM 'invalid_status' OR v_changed THEN
    RAISE EXCEPTION '046 rollback smoke: non-draft delete was not rejected';
  END IF;

  -- Defense in depth: restore the real fixture even though the canonical
  -- runner also rolls the entire smoke transaction back.
  UPDATE public.pyra_users
  SET salary_currency = v_original_currency
  WHERE username = v_username;
  IF NOT FOUND THEN
    RAISE EXCEPTION '046 rollback smoke: employee currency fixture restore failed';
  END IF;
END;
$smoke$;
