-- Read-only postflight for migration 042 atomic task transitions.

DO $do$
DECLARE
  v_create_oid pg_catalog.oid;
  v_duplicate_oid pg_catalog.oid;
  v_add_assignees_oid pg_catalog.oid;
  v_remove_assignee_oid pg_catalog.oid;
  v_label_oid pg_catalog.oid;
  v_checklist_oid pg_catalog.oid;
  v_advance_oid pg_catalog.oid;
  v_move_oid pg_catalog.oid;
  v_create_board_oid pg_catalog.oid;
  v_create_column_oid pg_catalog.oid;
  v_update_columns_oid pg_catalog.oid;
  v_delete_column_oid pg_catalog.oid;
  v_entry_lock_oid pg_catalog.oid;
  v_assignee_lock_oid pg_catalog.oid;
BEGIN
  v_create_oid := pg_catalog.to_regprocedure(
    'public.pyra_create_task_atomic(character varying,character varying,character varying,character varying,text,character varying,date,timestamp with time zone,date,numeric,character varying,jsonb)'
  );
  v_duplicate_oid := pg_catalog.to_regprocedure(
    'public.pyra_duplicate_task_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,date,timestamp with time zone,character varying,character varying,jsonb,jsonb,character varying)'
  );
  v_add_assignees_oid := pg_catalog.to_regprocedure(
    'public.pyra_add_task_assignees_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,jsonb)'
  );
  v_remove_assignee_oid := pg_catalog.to_regprocedure(
    'public.pyra_remove_task_assignee_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying)'
  );
  v_label_oid := pg_catalog.to_regprocedure(
    'public.pyra_mutate_task_label_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,character varying)'
  );
  v_checklist_oid := pg_catalog.to_regprocedure(
    'public.pyra_mutate_task_checklist_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,jsonb,character varying,character varying,character varying)'
  );
  v_advance_oid := pg_catalog.to_regprocedure(
    'public.pyra_advance_task_atomic(character varying,character varying,character varying,character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,character varying,text,character varying,character varying)'
  );
  v_move_oid := pg_catalog.to_regprocedure(
    'public.pyra_move_task_atomic(character varying,character varying,character varying,timestamp with time zone,character varying,character varying,integer,character varying,character varying,date,timestamp with time zone,character varying,character varying)'
  );
  v_create_board_oid := pg_catalog.to_regprocedure(
    'public.pyra_create_board_atomic(character varying,character varying,text,character varying,text,character varying,boolean,boolean,character varying,jsonb,jsonb)'
  );
  v_create_column_oid := pg_catalog.to_regprocedure(
    'public.pyra_create_board_column_atomic(character varying,character varying,character varying,character varying,integer)'
  );
  v_update_columns_oid := pg_catalog.to_regprocedure(
    'public.pyra_update_board_columns_atomic(character varying,jsonb)'
  );
  v_delete_column_oid := pg_catalog.to_regprocedure(
    'public.pyra_delete_board_column_atomic(character varying,character varying)'
  );
  v_entry_lock_oid := pg_catalog.to_regprocedure(
    'public.pyra_lock_task_write_entry()'
  );
  v_assignee_lock_oid := pg_catalog.to_regprocedure(
    'public.pyra_lock_task_assignee_write()'
  );

  IF v_create_oid IS NULL
     OR v_duplicate_oid IS NULL
     OR v_add_assignees_oid IS NULL
     OR v_remove_assignee_oid IS NULL
     OR v_label_oid IS NULL
     OR v_checklist_oid IS NULL
     OR v_advance_oid IS NULL
     OR v_move_oid IS NULL
     OR v_create_board_oid IS NULL
     OR v_create_column_oid IS NULL
     OR v_update_columns_oid IS NULL
     OR v_delete_column_oid IS NULL
     OR v_entry_lock_oid IS NULL
     OR v_assignee_lock_oid IS NULL THEN
    RAISE EXCEPTION 'Migration 042 postflight: atomic task function is missing or has a different signature';
  END IF;

  IF NOT EXISTS (
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
      AND c.column_default = 'false'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'pyra_task_stage_history'
      AND c.column_name = 'task_created_at_snapshot'
      AND c.udt_name = 'timestamptz'
      AND c.is_nullable = 'YES'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'pyra_task_stage_history'
      AND c.column_name = 'assignees_snapshot'
      AND c.udt_name = 'jsonb'
      AND c.is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'Migration 042 postflight: immutable attribution columns are missing or mistyped';
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
    RAISE EXCEPTION 'Migration 042 postflight: stage-history column lookup indexes are missing or incorrect';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    WHERE p.oid IN (
      v_create_oid,
      v_duplicate_oid,
      v_add_assignees_oid,
      v_remove_assignee_oid,
      v_label_oid,
      v_checklist_oid,
      v_advance_oid,
      v_move_oid,
      v_create_board_oid,
      v_create_column_oid,
      v_update_columns_oid,
      v_delete_column_oid
    )
      AND (
        p.prosecdef
        OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
      )
  ) THEN
    RAISE EXCEPTION 'Migration 042 postflight: function security configuration is not hardened';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    WHERE p.oid IN (
      v_create_oid,
      v_duplicate_oid,
      v_add_assignees_oid,
      v_remove_assignee_oid,
      v_label_oid,
      v_checklist_oid
    )
      AND (
        pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(p.oid),
          'hashtextextended(''pyra_task_assignees'', 42042)'
        ) = 0
        OR pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(p.oid),
          'hashtextextended(''pyra_task_assignees'', 42042)'
        ) >= pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(p.oid),
          CASE
            WHEN p.oid = v_duplicate_oid THEN 'hashtextextended(v_lock_task_id, 42042)'
            ELSE 'hashtextextended(p_task_id, 42042)'
          END
        )
      )
  ) THEN
    RAISE EXCEPTION 'Migration 042 postflight: writer advisory-lock order is incorrect';
  END IF;

  IF pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_label_oid),
       'bl.board_id = p_expected_board_id'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_label_oid),
       'INSERT INTO public.pyra_task_labels'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_label_oid),
       'DELETE FROM public.pyra_task_labels'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_checklist_oid),
       'MAX(c.position)'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_checklist_oid),
       'INSERT INTO public.pyra_task_checklist'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_checklist_oid),
       'UPDATE public.pyra_task_checklist'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_checklist_oid),
       'DELETE FROM public.pyra_task_checklist'
     ) = 0
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS p
       WHERE p.oid IN (v_label_oid, v_checklist_oid)
         AND (
           pg_catalog.strpos(p.prosrc, 'v_task.board_id IS DISTINCT FROM p_expected_board_id') = 0
           OR pg_catalog.strpos(p.prosrc, 'v_task.updated_at IS DISTINCT FROM p_expected_updated_at') = 0
           OR pg_catalog.strpos(p.prosrc, 'INSERT INTO public.pyra_task_activity') = 0
         )
     ) THEN
    RAISE EXCEPTION 'Migration 042 postflight: relation writer contract is incomplete';
  END IF;

  IF pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_create_board_oid),
       'hashtextextended(''pyra_task_assignees'', 42042)'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_create_board_oid),
       'hashtextextended(''pyra_task_assignees'', 42042)'
     ) >= pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_create_board_oid),
       'FROM public.pyra_projects AS p'
     )
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_create_board_oid),
       'FROM public.pyra_projects AS p'
     ) >= pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_create_board_oid),
       'INSERT INTO public.pyra_boards'
     )
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_create_board_oid),
       'INSERT INTO public.pyra_board_columns'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_create_board_oid),
       'INSERT INTO public.pyra_board_labels'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_create_board_oid),
       'WHEN unique_violation THEN'
     ) = 0 THEN
    RAISE EXCEPTION 'Migration 042 postflight: atomic board-create contract is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    WHERE p.oid IN (v_create_column_oid, v_update_columns_oid, v_delete_column_oid)
      AND (
        pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(p.oid),
          'hashtextextended(''pyra_task_assignees'', 42042)'
        ) = 0
        OR pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(p.oid),
          'hashtextextended(''pyra_task_assignees'', 42042)'
        ) >= pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(p.oid),
          'FROM public.pyra_boards AS b'
        )
        OR pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(p.oid),
          'FROM public.pyra_boards AS b'
        ) >= pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(p.oid),
          'FROM public.pyra_board_columns AS c'
        )
        OR pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(p.oid),
          'ORDER BY c.id'
        ) = 0
      )
  ) THEN
    RAISE EXCEPTION 'Migration 042 postflight: board-column writer lock order is incorrect';
  END IF;

  IF pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_update_columns_oid),
       'count(DISTINCT patch.item ->> ''id'')'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_update_columns_oid),
       '''column_not_in_board'''
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_update_columns_oid),
       'WITH patch AS'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_update_columns_oid),
       'UPDATE public.pyra_board_columns AS c'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_update_columns_oid),
       'LOOP'
     ) > 0 THEN
    RAISE EXCEPTION 'Migration 042 postflight: atomic board-column batch contract is incomplete';
  END IF;

  IF pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_delete_column_oid),
       'FROM public.pyra_tasks AS t'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_delete_column_oid),
       'is_archived'
     ) > 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_delete_column_oid),
       'h.from_column_id = p_column_id'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_delete_column_oid),
       'h.to_column_id = p_column_id'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_delete_column_oid),
       'DELETE FROM public.pyra_board_columns AS c'
     ) = 0 THEN
    RAISE EXCEPTION 'Migration 042 postflight: guarded board-column delete contract is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    WHERE p.oid = v_entry_lock_oid
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
     AND tg.tgfoid = v_entry_lock_oid
     AND NOT tg.tgisinternal
     AND tg.tgenabled = 'O'
  ) IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'Migration 042 postflight: statement-entry advisory-lock triggers are missing or incorrect';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS tg
    JOIN pg_catalog.pg_proc AS p ON p.oid = tg.tgfoid
    WHERE tg.tgrelid = 'public.pyra_task_assignees'::pg_catalog.regclass
      AND tg.tgname = 'trg_task_assignees_atomic_lock'
      AND tg.tgtype = 31
      AND NOT tg.tgisinternal
      AND tg.tgenabled = 'O'
      AND p.oid = v_assignee_lock_oid
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
    RAISE EXCEPTION 'Migration 042 postflight: per-task assignee row-lock trigger is missing or incorrect';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    WHERE p.oid IN (v_advance_oid, v_move_oid)
      AND pg_catalog.regexp_replace(
        p.prosrc,
        '[[:space:]]+',
        ' ',
        'g'
      ) NOT LIKE '%INSERT INTO public.pyra_task_stage_history (%created_at%) VALUES (%v_moved_at%'
  ) THEN
    RAISE EXCEPTION 'Migration 042 postflight: history created_at is not DB-derived';
  END IF;

  IF pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_advance_oid),
       'INSERT INTO public.pyra_task_activity'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_advance_oid),
       '''stage_advanced'''
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_advance_oid),
       'p_actor_display_name'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_advance_oid),
       'p_activity_id'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_advance_oid),
       'jsonb_build_object'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_advance_oid),
       'v_moved_at'
     ) = 0 THEN
    RAISE EXCEPTION 'Migration 042 postflight: advance activity is not atomic or DB-timestamped';
  END IF;

  IF pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_move_oid),
       'INSERT INTO public.pyra_task_activity'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_move_oid),
       '''moved'''
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_move_oid),
       'p_actor_display_name'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_move_oid),
       'p_activity_id'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_move_oid),
       'jsonb_build_object'
     ) = 0
     OR pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(v_move_oid),
       'v_moved_at'
     ) = 0 THEN
    RAISE EXCEPTION 'Migration 042 postflight: move activity is not atomic or DB-timestamped';
  END IF;

  IF pg_catalog.has_function_privilege('anon', v_advance_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_advance_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', v_advance_oid, 'EXECUTE')
      OR pg_catalog.has_function_privilege('anon', v_move_oid, 'EXECUTE')
      OR pg_catalog.has_function_privilege('authenticated', v_move_oid, 'EXECUTE')
      OR NOT pg_catalog.has_function_privilege('service_role', v_move_oid, 'EXECUTE')
      OR pg_catalog.has_function_privilege('anon', v_assignee_lock_oid, 'EXECUTE')
      OR pg_catalog.has_function_privilege('authenticated', v_assignee_lock_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', v_assignee_lock_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_entry_lock_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_entry_lock_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', v_entry_lock_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_create_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_create_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', v_create_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_duplicate_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_duplicate_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', v_duplicate_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_add_assignees_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_add_assignees_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', v_add_assignees_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_remove_assignee_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_remove_assignee_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', v_remove_assignee_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_label_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_label_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', v_label_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_checklist_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_checklist_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', v_checklist_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_create_board_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_create_board_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', v_create_board_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_create_column_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_create_column_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', v_create_column_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_update_columns_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_update_columns_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', v_update_columns_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_delete_column_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_delete_column_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', v_delete_column_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Migration 042 postflight: function role privileges are incorrect';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p,
         LATERAL pg_catalog.aclexplode(
           COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
         ) AS acl
    WHERE p.oid IN (
      v_create_oid,
      v_duplicate_oid,
      v_add_assignees_oid,
      v_remove_assignee_oid,
      v_label_oid,
      v_checklist_oid,
      v_advance_oid,
      v_move_oid,
      v_create_board_oid,
      v_create_column_oid,
      v_update_columns_oid,
      v_delete_column_oid,
      v_entry_lock_oid,
      v_assignee_lock_oid
    )
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Migration 042 postflight: PUBLIC can execute an atomic transition function';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('pyra_tasks', 'SELECT'),
        ('pyra_tasks', 'INSERT'),
        ('pyra_tasks', 'UPDATE'),
        ('pyra_tasks', 'DELETE'),
        ('pyra_projects', 'SELECT'),
        ('pyra_boards', 'SELECT'),
        ('pyra_boards', 'INSERT'),
        ('pyra_boards', 'UPDATE'),
        ('pyra_users', 'SELECT'),
        ('pyra_users', 'UPDATE'),
        ('pyra_board_columns', 'SELECT'),
        ('pyra_board_columns', 'INSERT'),
        ('pyra_board_columns', 'UPDATE'),
        ('pyra_board_columns', 'DELETE'),
        ('pyra_task_stage_history', 'SELECT'),
        ('pyra_task_stage_history', 'INSERT'),
        ('pyra_task_stage_history', 'UPDATE'),
        ('pyra_task_stage_history', 'DELETE'),
        ('pyra_task_attachments', 'SELECT'),
        ('pyra_task_attachments', 'INSERT'),
        ('pyra_task_attachments', 'UPDATE'),
        ('pyra_task_attachments', 'DELETE'),
        ('pyra_task_labels', 'SELECT'),
        ('pyra_task_labels', 'INSERT'),
        ('pyra_task_labels', 'UPDATE'),
        ('pyra_task_labels', 'DELETE'),
        ('pyra_task_assignees', 'SELECT'),
        ('pyra_task_assignees', 'INSERT'),
        ('pyra_task_assignees', 'UPDATE'),
        ('pyra_task_assignees', 'DELETE'),
        ('pyra_task_checklist', 'SELECT'),
        ('pyra_task_checklist', 'INSERT'),
        ('pyra_task_checklist', 'UPDATE'),
        ('pyra_task_checklist', 'DELETE'),
        ('pyra_board_labels', 'SELECT'),
        ('pyra_board_labels', 'INSERT'),
        ('pyra_board_labels', 'UPDATE'),
        ('pyra_task_activity', 'INSERT')
    ) AS required(table_name, privilege_name)
    WHERE NOT pg_catalog.has_table_privilege(
      'service_role',
      'public.' || required.table_name,
      required.privilege_name
    )
  ) THEN
    RAISE EXCEPTION 'Migration 042 postflight: service_role lacks required table privileges';
  END IF;
END;
$do$;

SELECT pg_catalog.jsonb_build_object(
  'status', 'ok',
  'create_function', pg_catalog.to_regprocedure(
    'public.pyra_create_task_atomic(character varying,character varying,character varying,character varying,text,character varying,date,timestamp with time zone,date,numeric,character varying,jsonb)'
  ),
  'duplicate_function', pg_catalog.to_regprocedure(
    'public.pyra_duplicate_task_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,date,timestamp with time zone,character varying,character varying,jsonb,jsonb,character varying)'
  ),
  'add_assignees_function', pg_catalog.to_regprocedure(
    'public.pyra_add_task_assignees_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,jsonb)'
  ),
  'remove_assignee_function', pg_catalog.to_regprocedure(
    'public.pyra_remove_task_assignee_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying)'
  ),
  'label_function', pg_catalog.to_regprocedure(
    'public.pyra_mutate_task_label_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,character varying)'
  ),
  'checklist_function', pg_catalog.to_regprocedure(
    'public.pyra_mutate_task_checklist_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,jsonb,character varying,character varying,character varying)'
  ),
  'advance_function', pg_catalog.to_regprocedure(
    'public.pyra_advance_task_atomic(character varying,character varying,character varying,character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,character varying,text,character varying,character varying)'
  ),
  'move_function', pg_catalog.to_regprocedure(
    'public.pyra_move_task_atomic(character varying,character varying,character varying,timestamp with time zone,character varying,character varying,integer,character varying,character varying,date,timestamp with time zone,character varying,character varying)'
  ),
  'create_board_function', pg_catalog.to_regprocedure(
    'public.pyra_create_board_atomic(character varying,character varying,text,character varying,text,character varying,boolean,boolean,character varying,jsonb,jsonb)'
  ),
  'create_board_column_function', pg_catalog.to_regprocedure(
    'public.pyra_create_board_column_atomic(character varying,character varying,character varying,character varying,integer)'
  ),
  'update_board_columns_function', pg_catalog.to_regprocedure(
    'public.pyra_update_board_columns_atomic(character varying,jsonb)'
  ),
  'delete_board_column_function', pg_catalog.to_regprocedure(
    'public.pyra_delete_board_column_atomic(character varying,character varying)'
  ),
  'from_column_history_index', pg_catalog.to_regclass(
    'public.idx_task_stage_history_from_column'
  ),
  'to_column_history_index', pg_catalog.to_regclass(
    'public.idx_task_stage_history_to_column'
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
  'service_role_only', true
) AS migration_042_postflight;
