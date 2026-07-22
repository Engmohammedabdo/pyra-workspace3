-- Read-only, fail-closed postflight for migration 043 atomic task review.

DO $do$
DECLARE
  v_review_oid pg_catalog.oid;
  v_project_delete_oid pg_catalog.oid;
  v_validator_oid pg_catalog.oid;
  v_delete_guard_oid pg_catalog.oid;
  v_review_source text;
  v_project_delete_source text;
  v_schema_errors text;
  v_global_lock integer;
  v_task_lock integer;
  v_activity_write integer;
  v_decision_write integer;
BEGIN
  SELECT pg_catalog.string_agg(
    expected.table_name || '.' || expected.column_name,
    ', ' ORDER BY expected.table_name, expected.column_name
  )
  INTO v_schema_errors
  FROM (
    VALUES
      ('pyra_boards', 'id', 'character varying', 'NO'),
      ('pyra_boards', 'project_id', 'character varying', 'YES'),
      ('pyra_boards', 'is_pipeline', 'boolean', 'YES'),
      ('pyra_board_columns', 'id', 'character varying', 'NO'),
      ('pyra_board_columns', 'board_id', 'character varying', 'NO'),
      ('pyra_board_columns', 'name', 'character varying', 'NO'),
      ('pyra_board_columns', 'position', 'integer', 'YES'),
      ('pyra_board_columns', 'is_done_column', 'boolean', 'YES'),
      ('pyra_board_columns', 'requires_approval', 'boolean', 'YES'),
      ('pyra_board_columns', 'default_assignee', 'character varying', 'YES'),
      ('pyra_board_columns', 'column_type', 'character varying', 'YES'),
      ('pyra_projects', 'id', 'character varying', 'NO'),
      ('pyra_project_files', 'id', 'character varying', 'NO'),
      ('pyra_project_files', 'project_id', 'character varying', 'NO'),
      ('pyra_file_approvals', 'file_id', 'character varying', 'NO'),
      ('pyra_client_comments', 'project_id', 'character varying', 'NO'),
      ('pyra_tasks', 'id', 'character varying', 'NO'),
      ('pyra_tasks', 'board_id', 'character varying', 'NO'),
      ('pyra_tasks', 'column_id', 'character varying', 'NO'),
      ('pyra_tasks', 'title', 'character varying', 'NO'),
      ('pyra_tasks', 'updated_at', 'timestamp with time zone', 'YES'),
      ('pyra_tasks', 'stage_entered_at', 'timestamp with time zone', 'YES'),
      ('pyra_tasks', 'completion_percentage', 'integer', 'YES'),
      ('pyra_task_stage_history', 'id', 'character varying', 'NO'),
      ('pyra_task_stage_history', 'task_id', 'character varying', 'NO'),
      ('pyra_task_stage_history', 'board_id', 'character varying', 'NO'),
      ('pyra_task_stage_history', 'from_column_id', 'character varying', 'YES'),
      ('pyra_task_stage_history', 'to_column_id', 'character varying', 'NO'),
      ('pyra_task_stage_history', 'moved_by', 'character varying', 'NO'),
      ('pyra_task_stage_history', 'approved_by', 'character varying', 'YES'),
      ('pyra_task_stage_history', 'time_in_stage', 'interval', 'YES'),
      ('pyra_task_stage_history', 'created_at', 'timestamp with time zone', 'YES'),
      ('pyra_task_assignees', 'id', 'character varying', 'NO'),
      ('pyra_task_assignees', 'task_id', 'character varying', 'NO'),
      ('pyra_task_assignees', 'username', 'character varying', 'NO'),
      ('pyra_task_assignees', 'assigned_by', 'character varying', 'NO'),
      ('pyra_task_assignees', 'column_id', 'character varying', 'YES'),
      ('pyra_task_assignees', 'is_stage_assignee', 'boolean', 'YES'),
      ('pyra_task_comments', 'id', 'character varying', 'NO'),
      ('pyra_task_comments', 'task_id', 'character varying', 'NO'),
      ('pyra_task_comments', 'author_username', 'character varying', 'NO'),
      ('pyra_task_comments', 'author_name', 'character varying', 'NO'),
      ('pyra_task_comments', 'content', 'text', 'NO'),
      ('pyra_task_comments', 'created_at', 'timestamp with time zone', 'YES'),
      ('pyra_task_comments', 'updated_at', 'timestamp with time zone', 'YES'),
      ('pyra_task_activity', 'id', 'character varying', 'NO'),
      ('pyra_task_activity', 'task_id', 'character varying', 'NO'),
      ('pyra_task_activity', 'username', 'character varying', 'NO'),
      ('pyra_task_activity', 'display_name', 'character varying', 'NO'),
      ('pyra_task_activity', 'action', 'character varying', 'NO'),
      ('pyra_task_activity', 'details', 'jsonb', 'YES'),
      ('pyra_task_activity', 'created_at', 'timestamp with time zone', 'YES'),
      ('pyra_task_review_decisions', 'history_id', 'character varying', 'NO'),
      ('pyra_task_review_decisions', 'task_id', 'character varying', 'NO'),
      ('pyra_task_review_decisions', 'board_id', 'character varying', 'NO'),
      ('pyra_task_review_decisions', 'action', 'character varying', 'NO'),
      ('pyra_task_review_decisions', 'rejection_kind', 'character varying', 'YES'),
      ('pyra_task_review_decisions', 'note', 'text', 'YES'),
      ('pyra_task_review_decisions', 'decided_by', 'character varying', 'NO'),
      ('pyra_task_review_decisions', 'decided_at', 'timestamp with time zone', 'NO'),
      ('pyra_task_review_decisions', 'activity_id', 'character varying', 'NO'),
      ('pyra_task_review_decisions', 'comment_id', 'character varying', 'YES')
  ) AS expected(table_name, column_name, data_type, is_nullable)
  LEFT JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
   AND actual.table_name = expected.table_name
   AND actual.column_name = expected.column_name
   AND actual.data_type = expected.data_type
   AND actual.is_nullable = expected.is_nullable
  WHERE actual.column_name IS NULL;

  IF v_schema_errors IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 043 postflight: missing or mismatched columns: %', v_schema_errors;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'pyra_task_review_decisions'
      AND relation.relkind = 'r'
      AND relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Migration 043 postflight: review decision table or RLS is missing';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.pyra_task_review_decisions'::pg_catalog.regclass
      AND con.contype = 'f'
  ) <> 3 OR EXISTS (
    SELECT expected.constraint_name
    FROM (
      VALUES
        ('fk_task_review_decision_history', 'pyra_task_stage_history'),
        ('fk_task_review_decision_activity', 'pyra_task_activity'),
        ('fk_task_review_decision_comment', 'pyra_task_comments')
    ) AS expected(constraint_name, target_table)
    LEFT JOIN pg_catalog.pg_constraint AS con
      ON con.conrelid = 'public.pyra_task_review_decisions'::pg_catalog.regclass
     AND con.conname = expected.constraint_name
     AND con.contype = 'f'
     AND con.convalidated
    LEFT JOIN pg_catalog.pg_class AS target ON target.oid = con.confrelid
    WHERE con.oid IS NULL OR target.relname IS DISTINCT FROM expected.target_table
  ) THEN
    RAISE EXCEPTION 'Migration 043 postflight: exact review linkage foreign keys are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.pyra_task_review_decisions'::pg_catalog.regclass
      AND con.conname = 'ck_task_review_decision_shape'
      AND con.convalidated
      AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(con.oid), 'outright') > 0
      AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(con.oid), 'revision') > 0
      AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(con.oid), 'comment_id') > 0
  ) THEN
    RAISE EXCEPTION 'Migration 043 postflight: review decision shape constraint is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.pyra_task_activity'::pg_catalog.regclass
      AND con.conname = 'ck_task_activity_rejection_kind'
      AND NOT con.convalidated
      AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(con.oid), 'outright') > 0
      AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(con.oid), 'revision') > 0
  ) THEN
    RAISE EXCEPTION 'Migration 043 postflight: rejection-kind activity constraint is missing';
  END IF;

  v_review_oid := pg_catalog.to_regprocedure(
    'public.pyra_review_task_atomic(character varying,character varying,character varying,timestamp with time zone,character varying,character varying,character varying,text,character varying,character varying,character varying,character varying,character varying)'
  );
  v_project_delete_oid := pg_catalog.to_regprocedure(
    'public.pyra_delete_project_atomic(character varying)'
  );
  v_validator_oid := pg_catalog.to_regprocedure(
    'public.pyra_validate_task_review_decision()'
  );
  v_delete_guard_oid := pg_catalog.to_regprocedure(
    'public.pyra_guard_reviewed_production_delete()'
  );
  IF v_review_oid IS NULL
     OR v_project_delete_oid IS NULL
     OR v_validator_oid IS NULL
     OR v_delete_guard_oid IS NULL THEN
    RAISE EXCEPTION 'Migration 043 postflight: required writer or guard function is missing';
  END IF;

  SELECT p.prosrc
  INTO v_review_source
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = v_review_oid
    AND p.prosecdef
    AND p.proconfig = ARRAY['search_path=""']::text[];
  IF v_review_source IS NULL THEN
    RAISE EXCEPTION 'Migration 043 postflight: review function security contract is incorrect';
  END IF;

  SELECT p.prosrc
  INTO v_project_delete_source
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = v_project_delete_oid
    AND p.prosecdef
    AND p.proconfig = ARRAY['search_path=""']::text[];
  IF v_project_delete_source IS NULL THEN
    RAISE EXCEPTION 'Migration 043 postflight: project delete function security contract is incorrect';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    WHERE p.oid IN (v_validator_oid, v_delete_guard_oid)
      AND (NOT p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[])
  ) THEN
    RAISE EXCEPTION 'Migration 043 postflight: trigger function security contract is incorrect';
  END IF;

  -- Required function source: hashtextextended('pyra_task_assignees', 42042)
  -- must appear before hashtextextended(p_task_id, 42042).
  v_global_lock := pg_catalog.strpos(
    v_review_source,
    'hashtextextended(''pyra_task_assignees'', 42042)'
  );
  v_task_lock := pg_catalog.strpos(v_review_source, 'hashtextextended(p_task_id, 42042)');
  IF v_global_lock = 0 OR v_task_lock <= v_global_lock THEN
    RAISE EXCEPTION 'Migration 043 postflight: writer lock order is incorrect';
  END IF;

  v_activity_write := pg_catalog.strpos(
    v_review_source,
    'INSERT INTO public.pyra_task_activity'
  );
  v_decision_write := pg_catalog.strpos(
    v_review_source,
    'INSERT INTO public.pyra_task_review_decisions'
  );
  IF pg_catalog.strpos(v_review_source, 'p_expected_updated_at') = 0
     OR pg_catalog.strpos(v_review_source, 'UPDATE public.pyra_tasks') = 0
     OR pg_catalog.strpos(v_review_source, 'INSERT INTO public.pyra_task_stage_history') = 0
     OR pg_catalog.strpos(v_review_source, 'INSERT INTO public.pyra_task_comments') = 0
     OR v_activity_write = 0
     OR v_decision_write <= v_activity_write
     OR pg_catalog.strpos(v_review_source, 'rejection_kind') = 0
     OR pg_catalog.strpos(v_review_source, 'p_history_id') = 0
     OR pg_catalog.strpos(v_review_source, 'p_board_id') = 0 THEN
    RAISE EXCEPTION 'Migration 043 postflight: atomic review write contract is incomplete';
  END IF;

  IF pg_catalog.strpos(v_project_delete_source, 'DELETE FROM public.pyra_file_approvals') = 0
     OR pg_catalog.strpos(v_project_delete_source, 'DELETE FROM public.pyra_client_comments') = 0
     OR pg_catalog.strpos(v_project_delete_source, 'DELETE FROM public.pyra_project_files') = 0
     OR pg_catalog.strpos(v_project_delete_source, 'DELETE FROM public.pyra_projects') = 0
     OR pg_catalog.strpos(
       v_project_delete_source,
       'hashtextextended(''pyra_task_assignees'', 42042)'
     ) = 0 THEN
    RAISE EXCEPTION 'Migration 043 postflight: atomic project delete contract is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger
    WHERE trigger.tgrelid = 'public.pyra_task_review_decisions'::pg_catalog.regclass
      AND trigger.tgname = 'trg_validate_task_review_decision'
      AND trigger.tgfoid = v_validator_oid
      AND trigger.tgenabled <> 'D'
  ) OR EXISTS (
    SELECT expected.trigger_name
    FROM (
      VALUES
        ('trg_tasks_reviewed_production_delete_guard', 'pyra_tasks'),
        ('trg_boards_reviewed_production_delete_guard', 'pyra_boards'),
        ('trg_projects_reviewed_production_delete_guard', 'pyra_projects')
    ) AS expected(trigger_name, table_name)
    LEFT JOIN pg_catalog.pg_class AS relation ON relation.relname = expected.table_name
    LEFT JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
     AND namespace.nspname = 'public'
    LEFT JOIN pg_catalog.pg_trigger AS trigger
      ON trigger.tgrelid = relation.oid
     AND trigger.tgname = expected.trigger_name
     AND trigger.tgfoid = v_delete_guard_oid
     AND trigger.tgenabled <> 'D'
    WHERE trigger.oid IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration 043 postflight: validation or delete guard trigger is missing';
  END IF;

  IF pg_catalog.has_function_privilege('anon', v_review_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_review_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', v_review_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_project_delete_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_project_delete_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', v_project_delete_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Migration 043 postflight: function role privileges are incorrect';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p,
         LATERAL pg_catalog.aclexplode(
           COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
         ) AS acl
    WHERE p.oid IN (v_review_oid, v_project_delete_oid)
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Migration 043 postflight: PUBLIC can execute a writer function';
  END IF;

  IF NOT pg_catalog.has_table_privilege('service_role', 'public.pyra_task_review_decisions', 'SELECT')
     OR pg_catalog.has_table_privilege('service_role', 'public.pyra_task_review_decisions', 'INSERT')
     OR pg_catalog.has_table_privilege('service_role', 'public.pyra_task_review_decisions', 'UPDATE')
     OR pg_catalog.has_table_privilege('service_role', 'public.pyra_task_review_decisions', 'DELETE')
     OR pg_catalog.has_table_privilege('anon', 'public.pyra_task_review_decisions', 'SELECT')
     OR pg_catalog.has_table_privilege('anon', 'public.pyra_task_review_decisions', 'INSERT')
     OR pg_catalog.has_table_privilege('anon', 'public.pyra_task_review_decisions', 'UPDATE')
     OR pg_catalog.has_table_privilege('anon', 'public.pyra_task_review_decisions', 'DELETE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.pyra_task_review_decisions', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.pyra_task_review_decisions', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.pyra_task_review_decisions', 'UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.pyra_task_review_decisions', 'DELETE') THEN
    RAISE EXCEPTION 'Migration 043 postflight: review decision table privileges are incorrect';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation,
         LATERAL pg_catalog.aclexplode(
           COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
         ) AS acl
    WHERE relation.oid = 'public.pyra_task_review_decisions'::pg_catalog.regclass
      AND acl.grantee = 0
      AND acl.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'Migration 043 postflight: PUBLIC has a review decision table privilege';
  END IF;
END;
$do$;

SELECT pg_catalog.jsonb_build_object(
  'status', 'ok',
  'review_function', pg_catalog.to_regprocedure(
    'public.pyra_review_task_atomic(character varying,character varying,character varying,timestamp with time zone,character varying,character varying,character varying,text,character varying,character varying,character varying,character varying,character varying)'
  ),
  'project_delete_function', pg_catalog.to_regprocedure(
    'public.pyra_delete_project_atomic(character varying)'
  ),
  'decision_table', pg_catalog.to_regclass('public.pyra_task_review_decisions'),
  'linkage_foreign_keys', 3,
  'function_only_write', true,
  'reviewed_production_archive_only', true
) AS migration_043_postflight;
