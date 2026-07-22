-- Read-only postflight for migration 044.
-- Run only after every protected-table writer is deployed and migration 044 is applied.

DO $do$
DECLARE
  v_constraint_definition text;
  v_constraint_validated boolean;
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'pyra_tasks'
      AND c.column_name = 'due_at'
      AND c.udt_name = 'timestamptz'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'pyra_tasks'
      AND c.column_name = 'production_deadline_locked_at'
      AND c.udt_name = 'timestamptz'
      AND c.is_nullable = 'YES'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'pyra_tasks'
      AND c.column_name = 'production_deadline_exempt'
      AND c.udt_name = 'bool'
      AND c.is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'pyra_task_stage_history'
      AND c.column_name = 'due_at_snapshot'
      AND c.udt_name = 'timestamptz'
  ) THEN
    RAISE EXCEPTION 'Migration 044 postflight: deadline columns are missing or mistyped';
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(c.oid), c.convalidated
  INTO v_constraint_definition, v_constraint_validated
  FROM pg_catalog.pg_constraint AS c
  WHERE c.conrelid = 'public.pyra_tasks'::pg_catalog.regclass
    AND c.conname = 'ck_tasks_production_exact_deadline'
    AND c.contype = 'c';

  IF v_constraint_definition IS NULL OR NOT v_constraint_validated THEN
    RAISE EXCEPTION 'Migration 044 postflight: exact-deadline CHECK is missing or unvalidated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS tg
    JOIN pg_catalog.pg_proc AS p ON p.oid = tg.tgfoid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE tg.tgrelid = 'public.pyra_tasks'::pg_catalog.regclass
      AND tg.tgname = 'trg_tasks_production_deadline_immutable'
      AND NOT tg.tgisinternal
      AND tg.tgenabled = 'O'
      AND n.nspname = 'public'
      AND p.proname = 'pyra_guard_production_deadline_immutable'
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']::text[]
      AND pg_catalog.strpos(
        pg_catalog.pg_get_triggerdef(tg.oid),
        'production_deadline_exempt'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_triggerdef(tg.oid),
        'UPDATE OF board_id'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'OLD.production_deadline_exempt IS DISTINCT FROM NEW.production_deadline_exempt'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'OLD.board_id IS DISTINCT FROM NEW.board_id'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'NEW.production_deadline_exempt := false'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'can only be cleared by a genuine exact deadline before first review'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'Legacy deadline exemptions require a genuine exact deadline before production entry'
      ) > 0
  ) THEN
    RAISE EXCEPTION 'Migration 044 postflight: immutable deadline trigger/function is missing or not hardened';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS tg
    JOIN pg_catalog.pg_proc AS p ON p.oid = tg.tgfoid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE tg.tgrelid = 'public.pyra_tasks'::pg_catalog.regclass
      AND tg.tgname = 'trg_tasks_production_deadline_insert_guard'
      AND NOT tg.tgisinternal
      AND tg.tgenabled = 'O'
      AND n.nspname = 'public'
      AND p.proname = 'pyra_guard_production_deadline_immutable'
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']::text[]
      AND pg_catalog.strpos(
        pg_catalog.pg_get_triggerdef(tg.oid),
        'BEFORE INSERT'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'New tasks cannot create a legacy production deadline exemption'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'New production tasks require a genuine exact deadline'
      ) > 0
  ) THEN
    RAISE EXCEPTION 'Migration 044 postflight: production deadline insert guard is missing or not hardened';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS tg
    JOIN pg_catalog.pg_proc AS p ON p.oid = tg.tgfoid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE tg.tgrelid = 'public.pyra_tasks'::pg_catalog.regclass
      AND tg.tgname = 'trg_tasks_production_deadline_lock_evidence'
      AND NOT tg.tgisinternal
      AND tg.tgenabled = 'O'
      AND tg.tgdeferrable
      AND tg.tginitdeferred
      AND n.nspname = 'public'
      AND p.proname = 'pyra_validate_production_deadline_lock_evidence'
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']::text[]
      AND pg_catalog.strpos(
        pg_catalog.pg_get_triggerdef(tg.oid),
        'AFTER UPDATE OF production_deadline_locked_at'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'pg_catalog.min(h.created_at)'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'Production deadline lock requires matching first-review evidence'
      ) > 0
  ) THEN
    RAISE EXCEPTION 'Migration 044 postflight: deferred production deadline lock evidence guard is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS tg
    JOIN pg_catalog.pg_proc AS p ON p.oid = tg.tgfoid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE tg.tgrelid = 'public.pyra_task_stage_history'::pg_catalog.regclass
      AND tg.tgname = 'trg_production_review_deadline_guard'
      AND NOT tg.tgisinternal
      AND tg.tgenabled = 'O'
      AND n.nspname = 'public'
      AND p.proname = 'pyra_guard_production_review_deadline'
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']::text[]
      AND pg_catalog.strpos(
        pg_catalog.pg_get_triggerdef(tg.oid),
        'BEFORE INSERT OR UPDATE'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'production_deadline_exempt'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'v_target_column_board_id'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'WHERE c.id = NEW.to_column_id;'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'Production review history board must match its target column'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'interval ''1 day'' - interval ''1 millisecond'''
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'NEW.due_at_snapshot IS DISTINCT FROM v_task.due_at'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'Production review requires a verified exact deadline snapshot'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'Production review requires the persistent deadline lock'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'Production review deadline evidence is immutable'
      ) > 0
  ) THEN
    RAISE EXCEPTION 'Migration 044 postflight: production review deadline guard is missing or not hardened';
  END IF;

  IF pg_catalog.to_regclass('public.idx_task_stage_history_from_column') IS NULL
     OR pg_catalog.to_regclass('public.idx_task_stage_history_to_column') IS NULL
     OR pg_catalog.strpos(
       pg_catalog.pg_get_indexdef(
         pg_catalog.to_regclass('public.idx_task_stage_history_from_column')
       ),
       '(from_column_id) WHERE (from_column_id IS NOT NULL)'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_indexdef(
         pg_catalog.to_regclass('public.idx_task_stage_history_to_column')
       ),
       '(to_column_id)'
     ) = 0 THEN
    RAISE EXCEPTION 'Migration 044 postflight: stage-history column lookup indexes regressed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'pyra_lock_task_write_entry'
      AND p.pronargs = 0
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']::text[]
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'hashtextextended(''pyra_task_assignees'', 42042)'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'hashtextextended(v_task_id, 42042)'
      ) = 0
  ) OR (
    SELECT pg_catalog.count(*)
    FROM (
      VALUES
        ('pyra_projects', 'trg_projects_task_write_entry', 10::smallint),
        ('pyra_boards', 'trg_boards_task_write_entry', 30::smallint),
        ('pyra_tasks', 'trg_tasks_task_write_entry', 30::smallint),
        ('pyra_task_assignees', 'trg_task_assignees_write_entry', 30::smallint),
        ('pyra_board_columns', 'trg_board_columns_write_entry', 30::smallint),
        ('pyra_task_stage_history', 'trg_task_stage_history_write_entry', 30::smallint)
    ) AS expected(table_name, trigger_name, trigger_type)
    JOIN pg_catalog.pg_class AS cls ON cls.relname = expected.table_name
    JOIN pg_catalog.pg_namespace AS n ON n.oid = cls.relnamespace AND n.nspname = 'public'
    JOIN pg_catalog.pg_trigger AS tg
      ON tg.tgrelid = cls.oid
     AND tg.tgname = expected.trigger_name
     AND tg.tgtype = expected.trigger_type
     AND tg.tgfoid = pg_catalog.to_regprocedure('public.pyra_lock_task_write_entry()')
     AND NOT tg.tgisinternal
     AND tg.tgenabled = 'O'
  ) IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'Migration 044 postflight: statement-entry advisory-lock triggers are missing or incorrect';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS tg
    JOIN pg_catalog.pg_proc AS p ON p.oid = tg.tgfoid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE tg.tgrelid = 'public.pyra_task_assignees'::pg_catalog.regclass
      AND tg.tgname = 'trg_task_assignees_atomic_lock'
      AND tg.tgtype = 31
      AND NOT tg.tgisinternal
      AND tg.tgenabled = 'O'
      AND n.nspname = 'public'
      AND p.proname = 'pyra_lock_task_assignee_write'
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']::text[]
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'hashtextextended(''pyra_task_assignees'', 42042)'
      ) = 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'hashtextextended(v_task_id, 42042)'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(p.oid),
        'ORDER BY task_id'
      ) > 0
  ) THEN
    RAISE EXCEPTION 'Migration 044 postflight: per-task assignee row-lock trigger is missing or incorrect';
  END IF;

  IF pg_catalog.has_function_privilege(
       'anon',
       'public.pyra_guard_production_deadline_immutable()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'public.pyra_guard_production_deadline_immutable()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'public.pyra_guard_production_deadline_immutable()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'public.pyra_guard_production_review_deadline()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'public.pyra_guard_production_review_deadline()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'public.pyra_guard_production_review_deadline()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'public.pyra_validate_production_deadline_lock_evidence()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'public.pyra_validate_production_deadline_lock_evidence()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'public.pyra_validate_production_deadline_lock_evidence()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'public.pyra_lock_task_assignee_write()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'public.pyra_lock_task_assignee_write()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'public.pyra_lock_task_assignee_write()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'public.pyra_lock_task_write_entry()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'public.pyra_lock_task_write_entry()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'public.pyra_lock_task_write_entry()',
       'EXECUTE'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS p
       JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace,
            LATERAL pg_catalog.aclexplode(
              COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
            ) AS acl
        WHERE n.nspname = 'public'
          AND p.proname IN (
            'pyra_guard_production_deadline_immutable',
            'pyra_guard_production_review_deadline',
            'pyra_validate_production_deadline_lock_evidence',
            'pyra_lock_task_write_entry',
            'pyra_lock_task_assignee_write'
          )
         AND p.pronargs = 0
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Migration 044 postflight: protected trigger function is directly executable';
  END IF;

  IF pg_catalog.strpos(v_constraint_definition, 'bd_production') = 0
     OR pg_catalog.strpos(v_constraint_definition, 'tk_IOhdJMui9uW0bblj') = 0
     OR pg_catalog.strpos(v_constraint_definition, 'production_deadline_exempt') = 0
     OR pg_catalog.strpos(v_constraint_definition, 'NOT production_deadline_exempt') = 0
     OR pg_catalog.strpos(v_constraint_definition, 'due_at IS NULL') = 0
     OR pg_catalog.strpos(v_constraint_definition, 'due_date IS NOT NULL') = 0
     OR pg_catalog.strpos(v_constraint_definition, 'due_at IS NOT NULL') = 0
     OR pg_catalog.strpos(v_constraint_definition, 'Asia/Dubai') = 0
     OR pg_catalog.strpos(v_constraint_definition, '00:00:00.001') = 0 THEN
    RAISE EXCEPTION 'Migration 044 postflight: exact-deadline CHECK has the wrong definition';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_count
  FROM public.pyra_tasks AS t
  WHERE t.board_id = 'bd_production'
    AND NOT (
      (
        t.production_deadline_exempt
        AND (
          (
            t.id = 'tk_IOhdJMui9uW0bblj'
            AND t.due_date IS NULL
            AND t.due_at IS NULL
          )
          OR (
            t.due_date IS NOT NULL
            AND t.due_at = (
              (t.due_date::timestamp + interval '1 day' - interval '1 millisecond')
              AT TIME ZONE 'Asia/Dubai'
            )
          )
        )
      )
      OR (
        NOT t.production_deadline_exempt
        AND t.due_date IS NOT NULL
        AND t.due_at IS NOT NULL
        AND (t.due_at AT TIME ZONE 'Asia/Dubai')::date = t.due_date
        AND t.due_at <> (
          (t.due_date::timestamp + interval '1 day' - interval '1 millisecond')
          AT TIME ZONE 'Asia/Dubai'
        )
      )
    );

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Migration 044 postflight: % invalid production deadline provenance rows remain', v_count;
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_count
  FROM public.pyra_tasks AS t
  WHERE t.production_deadline_exempt
    AND NOT (
      (
        t.id = 'tk_IOhdJMui9uW0bblj'
        AND t.due_date IS NULL
        AND t.due_at IS NULL
      )
      OR (
        t.due_date IS NOT NULL
        AND t.due_at = (
          (t.due_date::timestamp + interval '1 day' - interval '1 millisecond')
          AT TIME ZONE 'Asia/Dubai'
        )
      )
    );

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Migration 044 postflight: % unauthorized production deadline exemptions remain', v_count;
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_count
  FROM public.pyra_tasks AS t
  WHERE t.due_date IS NOT NULL
    AND t.due_at = (
      (t.due_date::timestamp + interval '1 day' - interval '1 millisecond')
      AT TIME ZONE 'Asia/Dubai'
    )
    AND NOT t.production_deadline_exempt;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Migration 044 postflight: % legacy sentinel deadlines remain falsely verified', v_count;
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_count
  FROM public.pyra_task_stage_history AS h
  LEFT JOIN public.pyra_board_columns AS c ON c.id = h.to_column_id
  WHERE (
      h.board_id = 'bd_production'
      AND c.board_id IS DISTINCT FROM 'bd_production'
    ) OR (
      c.board_id = 'bd_production'
      AND h.board_id IS DISTINCT FROM 'bd_production'
    );

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Migration 044 postflight: % production history board/column mismatches remain', v_count;
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_count
  FROM public.pyra_task_stage_history AS h
  JOIN public.pyra_tasks AS t ON t.id = h.task_id
  JOIN public.pyra_board_columns AS c ON c.id = h.to_column_id
  WHERE h.board_id = 'bd_production'
    AND c.board_id = 'bd_production'
    AND c.column_type = 'review'
    AND NOT t.production_deadline_exempt
    AND h.due_at_snapshot IS DISTINCT FROM t.due_at;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Migration 044 postflight: % review deadline snapshots are missing or mismatched', v_count;
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_count
  FROM public.pyra_task_stage_history AS h
  JOIN public.pyra_tasks AS t ON t.id = h.task_id
  JOIN public.pyra_board_columns AS c ON c.id = h.to_column_id
  WHERE h.board_id = 'bd_production'
    AND c.board_id = 'bd_production'
    AND c.column_type = 'review'
    AND t.production_deadline_locked_at IS NULL;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Migration 044 postflight: % reviewed production tasks lack a persistent lock', v_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES ('anon'), ('authenticated')) AS protected_role(role_name)
    CROSS JOIN (
      VALUES
        ('pyra_tasks'),
        ('pyra_task_stage_history'),
        ('pyra_board_columns'),
        ('pyra_task_assignees')
    ) AS protected_table(table_name)
    CROSS JOIN (
      VALUES
        ('INSERT'),
        ('UPDATE'),
        ('DELETE'),
        ('TRUNCATE'),
        ('REFERENCES'),
        ('TRIGGER')
    ) AS forbidden_privilege(privilege_type)
    WHERE pg_catalog.has_table_privilege(
      protected_role.role_name,
      pg_catalog.format('public.%I', protected_table.table_name),
      forbidden_privilege.privilege_type
    )
  ) THEN
    RAISE EXCEPTION 'Migration 044 postflight: anon/authenticated retains protected-table write/control privileges';
  END IF;

  IF NOT pg_catalog.has_table_privilege(
       'authenticated', 'public.pyra_tasks', 'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'authenticated', 'public.pyra_task_stage_history', 'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'authenticated', 'public.pyra_board_columns', 'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'authenticated', 'public.pyra_task_assignees', 'SELECT'
     ) THEN
    RAISE EXCEPTION 'Migration 044 postflight: authenticated protected-table SELECT was not preserved';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('service_role', 'pyra_tasks', 'SELECT'),
        ('service_role', 'pyra_tasks', 'INSERT'),
        ('service_role', 'pyra_tasks', 'UPDATE'),
        ('service_role', 'pyra_tasks', 'DELETE'),
        ('service_role', 'pyra_task_stage_history', 'SELECT'),
        ('service_role', 'pyra_task_stage_history', 'INSERT'),
        ('service_role', 'pyra_task_stage_history', 'UPDATE'),
        ('service_role', 'pyra_task_stage_history', 'DELETE'),
        ('service_role', 'pyra_board_columns', 'SELECT'),
        ('service_role', 'pyra_board_columns', 'INSERT'),
        ('service_role', 'pyra_board_columns', 'UPDATE'),
        ('service_role', 'pyra_board_columns', 'DELETE'),
        ('service_role', 'pyra_task_assignees', 'SELECT'),
        ('service_role', 'pyra_task_assignees', 'INSERT'),
        ('service_role', 'pyra_task_assignees', 'UPDATE'),
        ('service_role', 'pyra_task_assignees', 'DELETE')
    ) AS required(role_name, table_name, privilege_name)
    WHERE NOT pg_catalog.has_table_privilege(
      required.role_name,
      'public.' || required.table_name,
      required.privilege_name
    )
  ) THEN
    RAISE EXCEPTION 'Migration 044 postflight: service_role lacks protected-table DML';
  END IF;

  IF pg_catalog.to_regclass('public.pyra_deduction_cases') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.pyra_approve_employee_deduction(character varying,character varying,character varying,date,numeric,character varying,numeric,numeric,numeric,character varying,numeric,numeric,numeric,numeric,boolean,integer,boolean,numeric,numeric,jsonb,jsonb,text,text,character varying)'
     ) IS NULL THEN
    RAISE EXCEPTION 'Migration 044 postflight: migration 041 deduction objects are missing';
  END IF;
END;
$do$;

SELECT pg_catalog.jsonb_build_object(
  'status', 'ok',
  'constraint', (
    SELECT pg_catalog.pg_get_constraintdef(c.oid)
    FROM pg_catalog.pg_constraint AS c
    WHERE c.conrelid = 'public.pyra_tasks'::pg_catalog.regclass
      AND c.conname = 'ck_tasks_production_exact_deadline'
  ),
  'immutable_trigger', (
    SELECT tg.tgname
    FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgrelid = 'public.pyra_tasks'::pg_catalog.regclass
      AND tg.tgname = 'trg_tasks_production_deadline_immutable'
      AND NOT tg.tgisinternal
  ),
  'deadline_insert_guard', (
    SELECT tg.tgname
    FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgrelid = 'public.pyra_tasks'::pg_catalog.regclass
      AND tg.tgname = 'trg_tasks_production_deadline_insert_guard'
      AND NOT tg.tgisinternal
  ),
  'deadline_lock_evidence_guard', (
    SELECT tg.tgname
    FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgrelid = 'public.pyra_tasks'::pg_catalog.regclass
      AND tg.tgname = 'trg_tasks_production_deadline_lock_evidence'
      AND NOT tg.tgisinternal
  ),
  'production_review_guard', (
    SELECT tg.tgname
    FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgrelid = 'public.pyra_task_stage_history'::pg_catalog.regclass
      AND tg.tgname = 'trg_production_review_deadline_guard'
      AND NOT tg.tgisinternal
  ),
  'assignee_lock_trigger', (
    SELECT tg.tgname
    FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgrelid = 'public.pyra_task_assignees'::pg_catalog.regclass
      AND tg.tgname = 'trg_task_assignees_atomic_lock'
      AND NOT tg.tgisinternal
  ),
  'task_write_entry_triggers', (
    SELECT pg_catalog.jsonb_agg(tg.tgname ORDER BY tg.tgname)
    FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgname IN (
      'trg_projects_task_write_entry',
      'trg_boards_task_write_entry',
      'trg_tasks_task_write_entry',
      'trg_task_assignees_write_entry',
      'trg_board_columns_write_entry',
      'trg_task_stage_history_write_entry'
    )
      AND NOT tg.tgisinternal
  ),
  'from_column_history_index', pg_catalog.to_regclass(
    'public.idx_task_stage_history_from_column'
  ),
  'to_column_history_index', pg_catalog.to_regclass(
    'public.idx_task_stage_history_to_column'
  ),
  'production_exact_deadlines', (
    SELECT pg_catalog.count(*)
    FROM public.pyra_tasks AS t
    WHERE t.board_id = 'bd_production'
      AND NOT t.production_deadline_exempt
      AND t.due_date IS NOT NULL
      AND t.due_at IS NOT NULL
      AND (t.due_at AT TIME ZONE 'Asia/Dubai')::date = t.due_date
      AND t.due_at <> (
        (t.due_date::timestamp + interval '1 day' - interval '1 millisecond')
        AT TIME ZONE 'Asia/Dubai'
      )
  ),
  'explicit_deadline_exemptions', (
    SELECT pg_catalog.count(*)
    FROM public.pyra_tasks AS t
    WHERE t.production_deadline_exempt
  ),
  'review_deadline_snapshots', (
    SELECT pg_catalog.count(*)
    FROM public.pyra_task_stage_history AS h
    JOIN public.pyra_tasks AS t ON t.id = h.task_id
    JOIN public.pyra_board_columns AS c ON c.id = h.to_column_id
    WHERE h.board_id = 'bd_production'
      AND c.board_id = 'bd_production'
      AND c.column_type = 'review'
      AND NOT t.production_deadline_exempt
      AND h.due_at_snapshot IS NOT DISTINCT FROM t.due_at
  )
) AS migration_044_postflight;
