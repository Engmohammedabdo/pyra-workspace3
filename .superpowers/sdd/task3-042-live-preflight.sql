-- Read-only, fail-closed preflight for migration 042. Run before applying 042.
DO $preflight$
DECLARE
  v_missing_required_columns text;
  v_existing_functions text;
  v_existing_triggers text;
  v_existing_additive_columns text;
  v_existing_indexes text;
  v_041_record_count bigint;
  v_smoke_boards bigint;
  v_smoke_columns bigint;
  v_smoke_board_labels bigint;
  v_smoke_tasks bigint;
  v_smoke_assignees bigint;
  v_smoke_task_labels bigint;
  v_smoke_checklist bigint;
  v_smoke_activity bigint;
  v_smoke_stage_history bigint;
BEGIN
  SELECT pg_catalog.string_agg(
    pg_catalog.format('%I.%I', required.table_name, required.column_name),
    ', ' ORDER BY required.table_name, required.column_name
  )
  INTO v_missing_required_columns
  FROM (
    VALUES
      ('pyra_boards', 'id'),
      ('pyra_boards', 'is_pipeline'),
      ('pyra_board_columns', 'id'),
      ('pyra_board_columns', 'board_id'),
      ('pyra_board_columns', 'position'),
      ('pyra_board_columns', 'requires_approval'),
      ('pyra_board_columns', 'default_assignee'),
      ('pyra_board_columns', 'column_type'),
      ('pyra_board_columns', 'name'),
      ('pyra_tasks', 'id'),
      ('pyra_tasks', 'board_id'),
      ('pyra_tasks', 'column_id'),
      ('pyra_tasks', 'position'),
      ('pyra_tasks', 'updated_at'),
      ('pyra_tasks', 'created_at'),
      ('pyra_tasks', 'stage_entered_at'),
      ('pyra_tasks', 'completion_percentage'),
      ('pyra_tasks', 'due_date'),
      ('pyra_tasks', 'due_at'),
      ('pyra_task_stage_history', 'id'),
      ('pyra_task_stage_history', 'task_id'),
      ('pyra_task_stage_history', 'board_id'),
      ('pyra_task_stage_history', 'from_column_id'),
      ('pyra_task_stage_history', 'to_column_id'),
      ('pyra_task_stage_history', 'moved_by'),
      ('pyra_task_stage_history', 'created_at'),
      ('pyra_task_stage_history', 'time_in_stage'),
      ('pyra_task_stage_history', 'due_at_snapshot'),
      ('pyra_task_attachments', 'id'),
      ('pyra_task_attachments', 'task_id'),
      ('pyra_task_attachments', 'file_name'),
      ('pyra_task_attachments', 'file_url'),
      ('pyra_task_attachments', 'uploaded_by'),
      ('pyra_task_labels', 'task_id'),
      ('pyra_task_assignees', 'id'),
      ('pyra_task_assignees', 'task_id'),
      ('pyra_task_assignees', 'username'),
      ('pyra_task_assignees', 'assigned_by'),
      ('pyra_task_assignees', 'column_id'),
      ('pyra_task_assignees', 'is_stage_assignee')
  ) AS required(table_name, column_name)
  LEFT JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
   AND actual.table_name = required.table_name
   AND actual.column_name = required.column_name
  WHERE actual.column_name IS NULL;
  IF v_missing_required_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 042 preflight: required columns are missing: %',
      v_missing_required_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'pyra_tasks'
      AND c.column_name = 'due_at'
      AND c.udt_name = 'timestamptz'
      AND c.is_nullable = 'YES'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'pyra_task_stage_history'
      AND c.column_name = 'due_at_snapshot'
      AND c.udt_name = 'timestamptz'
      AND c.is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'Migration 042 preflight: migration 041 deadline columns are missing or mistyped';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_041_record_count
  FROM public.pyra_schema_migrations AS m
  WHERE m.version = '041_employee_deductions'
    AND m.checksum = '52e36f0942f183e91c3fcc8e83ebd2765cd487207adb0252b3010039876f54d0';
  IF v_041_record_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Migration 042 preflight: exact migration 041 prerequisite is missing or checksum-mismatched';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.pyra_schema_migrations AS m
    WHERE m.version LIKE '042%'
  ) THEN
    RAISE EXCEPTION 'Migration 042 preflight: a migration 042 record already exists';
  END IF;

  SELECT pg_catalog.string_agg(expected.signature, ', ' ORDER BY expected.signature)
  INTO v_existing_functions
  FROM (
    VALUES
      ('public.pyra_create_task_atomic(character varying,character varying,character varying,character varying,text,character varying,date,timestamp with time zone,date,numeric,character varying,jsonb)'),
      ('public.pyra_duplicate_task_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,date,timestamp with time zone,character varying,character varying,jsonb,jsonb,character varying)'),
      ('public.pyra_add_task_assignees_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,jsonb)'),
      ('public.pyra_remove_task_assignee_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying)'),
      ('public.pyra_mutate_task_label_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,character varying)'),
      ('public.pyra_mutate_task_checklist_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,jsonb,character varying,character varying,character varying)'),
      ('public.pyra_advance_task_atomic(character varying,character varying,character varying,character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,character varying,text,character varying,character varying)'),
      ('public.pyra_move_task_atomic(character varying,character varying,character varying,timestamp with time zone,character varying,character varying,integer,character varying,character varying,date,timestamp with time zone,character varying,character varying)'),
      ('public.pyra_create_board_atomic(character varying,character varying,text,character varying,text,character varying,boolean,boolean,character varying,jsonb,jsonb)'),
      ('public.pyra_create_board_column_atomic(character varying,character varying,character varying,character varying,integer)'),
      ('public.pyra_update_board_columns_atomic(character varying,jsonb)'),
      ('public.pyra_delete_board_column_atomic(character varying,character varying)'),
      ('public.pyra_lock_task_write_entry()'),
      ('public.pyra_lock_task_assignee_write()')
  ) AS expected(signature)
  WHERE pg_catalog.to_regprocedure(expected.signature) IS NOT NULL;
  IF v_existing_functions IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 042 preflight: atomic functions already exist: %',
      v_existing_functions;
  END IF;

  SELECT pg_catalog.string_agg(
    pg_catalog.format(
      '%I.%I expected_type=%s actual_type=%s',
      expected.table_name,
      expected.trigger_name,
      expected.trigger_type,
      tg.tgtype
    ),
    ', ' ORDER BY expected.table_name, expected.trigger_name
  )
  INTO v_existing_triggers
  FROM (
    VALUES
      ('pyra_projects', 'trg_projects_task_write_entry', 10::smallint),
      ('pyra_boards', 'trg_boards_task_write_entry', 30::smallint),
      ('pyra_tasks', 'trg_tasks_task_write_entry', 30::smallint),
      ('pyra_task_assignees', 'trg_task_assignees_write_entry', 30::smallint),
      ('pyra_board_columns', 'trg_board_columns_write_entry', 30::smallint),
      ('pyra_task_stage_history', 'trg_task_stage_history_write_entry', 30::smallint),
      ('pyra_task_assignees', 'trg_task_assignees_atomic_lock', 31::smallint)
  ) AS expected(table_name, trigger_name, trigger_type)
  JOIN pg_catalog.pg_class AS cls ON cls.relname = expected.table_name
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = cls.relnamespace
   AND n.nspname = 'public'
  JOIN pg_catalog.pg_trigger AS tg
    ON tg.tgrelid = cls.oid
   AND tg.tgname = expected.trigger_name
   AND NOT tg.tgisinternal;
  IF v_existing_triggers IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 042 preflight: atomic triggers already exist: %',
      v_existing_triggers;
  END IF;

  SELECT pg_catalog.string_agg(
    pg_catalog.format('%I.%I', expected.table_name, expected.column_name),
    ', ' ORDER BY expected.table_name, expected.column_name
  )
  INTO v_existing_additive_columns
  FROM (
    VALUES
      ('pyra_tasks', 'production_deadline_locked_at'),
      ('pyra_tasks', 'production_deadline_exempt'),
      ('pyra_task_stage_history', 'task_created_at_snapshot'),
      ('pyra_task_stage_history', 'assignees_snapshot')
  ) AS expected(table_name, column_name)
  JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
   AND actual.table_name = expected.table_name
   AND actual.column_name = expected.column_name;
  IF v_existing_additive_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 042 preflight: additive columns already exist: %',
      v_existing_additive_columns;
  END IF;

  SELECT pg_catalog.string_agg(expected.index_name, ', ' ORDER BY expected.index_name)
  INTO v_existing_indexes
  FROM (
    VALUES
      ('idx_task_stage_history_from_column'),
      ('idx_task_stage_history_to_column')
  ) AS expected(index_name)
  WHERE pg_catalog.to_regclass('public.' || expected.index_name) IS NOT NULL;
  IF v_existing_indexes IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 042 preflight: additive indexes already exist: %',
      v_existing_indexes;
  END IF;

  SELECT pg_catalog.count(*) INTO v_smoke_boards
  FROM public.pyra_boards
  WHERE id IN (
    'bd_aw_smoke_042',
    'bd_aw_other_042',
    'bd_aw_board_042',
    'bd_aw_board_fail42'
  );
  IF v_smoke_boards <> 0 THEN
    RAISE EXCEPTION 'Migration 042 preflight: smoke_boards=%', v_smoke_boards;
  END IF;

  SELECT pg_catalog.count(*) INTO v_smoke_columns
  FROM public.pyra_board_columns
  WHERE board_id IN ('bd_aw_smoke_042', 'bd_aw_board_042', 'bd_aw_board_fail42')
     OR id IN (
       'bc_aw_smoke_042',
       'bc_aw_board_a_042',
       'bc_aw_board_b_042',
       'bc_aw_board_fail42',
       'bc_aw_archived_42',
       'bc_aw_hist_from42',
       'bc_aw_hist_to_042',
       'bc_aw_empty_042'
     );
  IF v_smoke_columns <> 0 THEN
    RAISE EXCEPTION 'Migration 042 preflight: smoke_columns=%', v_smoke_columns;
  END IF;

  SELECT pg_catalog.count(*) INTO v_smoke_board_labels
  FROM public.pyra_board_labels
  WHERE board_id IN (
    'bd_aw_smoke_042',
    'bd_aw_other_042',
    'bd_aw_board_042',
    'bd_aw_board_fail42'
  ) OR id IN (
    'bl_aw_smoke_042',
    'bl_aw_rel_042',
    'bl_aw_other_042',
    'bl_aw_board_042'
  );
  IF v_smoke_board_labels <> 0 THEN
    RAISE EXCEPTION 'Migration 042 preflight: smoke_board_labels=%', v_smoke_board_labels;
  END IF;

  SELECT pg_catalog.count(*) INTO v_smoke_tasks
  FROM public.pyra_tasks
  WHERE id IN (
    'tk_aw_source_042',
    'tk_aw_advance_042',
    'tk_aw_adv_fail042',
    'tk_aw_move_fail042',
    'tk_aw_fail_042',
    'tk_aw_bad_due_042',
    'tk_aw_bad_user_042',
    'tk_aw_dup_042',
    'tk_aw_conflict_042',
    'tk_aw_dup_fail_042',
    'tk_aw_archived_42'
  );
  IF v_smoke_tasks <> 0 THEN
    RAISE EXCEPTION 'Migration 042 preflight: smoke_tasks=%', v_smoke_tasks;
  END IF;

  SELECT pg_catalog.count(*) INTO v_smoke_assignees
  FROM public.pyra_task_assignees
  WHERE task_id IN (
    'tk_aw_source_042',
    'tk_aw_advance_042',
    'tk_aw_adv_fail042',
    'tk_aw_move_fail042',
    'tk_aw_fail_042',
    'tk_aw_bad_user_042',
    'tk_aw_dup_042',
    'tk_aw_conflict_042',
    'tk_aw_dup_fail_042'
  );
  IF v_smoke_assignees <> 0 THEN
    RAISE EXCEPTION 'Migration 042 preflight: smoke_assignees=%', v_smoke_assignees;
  END IF;

  SELECT pg_catalog.count(*) INTO v_smoke_task_labels
  FROM public.pyra_task_labels
  WHERE task_id IN ('tk_aw_source_042', 'tk_aw_dup_042', 'tk_aw_dup_fail_042')
     OR label_id IN ('bl_aw_smoke_042', 'bl_aw_rel_042', 'bl_aw_other_042');
  IF v_smoke_task_labels <> 0 THEN
    RAISE EXCEPTION 'Migration 042 preflight: smoke_task_labels=%', v_smoke_task_labels;
  END IF;

  SELECT pg_catalog.count(*) INTO v_smoke_checklist
  FROM public.pyra_task_checklist
  WHERE task_id IN ('tk_aw_source_042', 'tk_aw_dup_042', 'tk_aw_dup_fail_042')
     OR id IN (
       'cl_aw_source_042',
       'cl_aw_rel_a_042',
       'cl_aw_rel_b_042',
       'cl_aw_rel_stale42',
       'cl_aw_rel_fail042'
     );
  IF v_smoke_checklist <> 0 THEN
    RAISE EXCEPTION 'Migration 042 preflight: smoke_checklist=%', v_smoke_checklist;
  END IF;

  SELECT pg_catalog.count(*) INTO v_smoke_activity
  FROM public.pyra_task_activity
  WHERE id IN (
    'tl_aw_dup_042',
    'tl_aw_adv_042',
    'tl_aw_move_042',
    'tl_aw_add_042',
    'tl_aw_remove_042',
    'tl_aw_lbl_add_042',
    'tl_aw_lbl_dup_042',
    'tl_aw_lbl_rm_042',
    'tl_aw_cl_add_a42',
    'tl_aw_cl_add_b42',
    'tl_aw_cl_upd_042',
    'tl_aw_cl_del_042'
  );
  IF v_smoke_activity <> 0 THEN
    RAISE EXCEPTION 'Migration 042 preflight: smoke_activity=%', v_smoke_activity;
  END IF;

  SELECT pg_catalog.count(*) INTO v_smoke_stage_history
  FROM public.pyra_task_stage_history
  WHERE id IN (
    'sh_aw_move_042',
    'sh_aw_move_fail42',
    'sh_aw_adv_042',
    'sh_aw_adv_fail42',
    'sh_aw_hist_from42',
    'sh_aw_hist_to_042'
  ) OR task_id IN (
    'tk_aw_source_042',
    'tk_aw_advance_042',
    'tk_aw_adv_fail042',
    'tk_aw_move_fail042',
    'tk_aw_dup_042',
    'tk_aw_archived_42'
  );
  IF v_smoke_stage_history <> 0 THEN
    RAISE EXCEPTION 'Migration 042 preflight: smoke_stage_history=%', v_smoke_stage_history;
  END IF;
END;
$preflight$;

WITH required_columns(table_name, column_name) AS (
  VALUES
    ('pyra_boards', 'id'),
    ('pyra_boards', 'is_pipeline'),
    ('pyra_board_columns', 'id'),
    ('pyra_board_columns', 'board_id'),
    ('pyra_board_columns', 'position'),
    ('pyra_board_columns', 'requires_approval'),
    ('pyra_board_columns', 'default_assignee'),
    ('pyra_board_columns', 'column_type'),
    ('pyra_board_columns', 'name'),
    ('pyra_tasks', 'id'),
    ('pyra_tasks', 'board_id'),
    ('pyra_tasks', 'column_id'),
    ('pyra_tasks', 'position'),
    ('pyra_tasks', 'updated_at'),
    ('pyra_tasks', 'created_at'),
    ('pyra_tasks', 'stage_entered_at'),
    ('pyra_tasks', 'completion_percentage'),
    ('pyra_tasks', 'due_date'),
    ('pyra_tasks', 'due_at'),
    ('pyra_task_stage_history', 'id'),
    ('pyra_task_stage_history', 'task_id'),
    ('pyra_task_stage_history', 'board_id'),
    ('pyra_task_stage_history', 'from_column_id'),
    ('pyra_task_stage_history', 'to_column_id'),
    ('pyra_task_stage_history', 'moved_by'),
    ('pyra_task_stage_history', 'created_at'),
    ('pyra_task_stage_history', 'time_in_stage'),
    ('pyra_task_stage_history', 'due_at_snapshot'),
    ('pyra_task_attachments', 'id'),
    ('pyra_task_attachments', 'task_id'),
    ('pyra_task_attachments', 'file_name'),
    ('pyra_task_attachments', 'file_url'),
    ('pyra_task_attachments', 'uploaded_by'),
    ('pyra_task_labels', 'task_id'),
    ('pyra_task_assignees', 'id'),
    ('pyra_task_assignees', 'task_id'),
    ('pyra_task_assignees', 'username'),
    ('pyra_task_assignees', 'assigned_by'),
    ('pyra_task_assignees', 'column_id'),
    ('pyra_task_assignees', 'is_stage_assignee')
), actual_columns AS (
  SELECT c.table_name,
         c.column_name,
         c.data_type,
         c.udt_name,
         c.is_nullable,
         c.column_default
  FROM information_schema.columns AS c
  JOIN required_columns AS r
    ON r.table_name = c.table_name
   AND r.column_name = c.column_name
  WHERE c.table_schema = 'public'
)
SELECT pg_catalog.jsonb_build_object(
  'required_column_count', (SELECT pg_catalog.count(*) FROM required_columns),
  'found_column_count', (SELECT pg_catalog.count(*) FROM actual_columns),
  'missing_columns', (
    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('table_name', r.table_name, 'column_name', r.column_name)
        ORDER BY r.table_name, r.column_name
      ),
      '[]'::jsonb
    )
    FROM required_columns AS r
    LEFT JOIN actual_columns AS a
      ON a.table_name = r.table_name
     AND a.column_name = r.column_name
    WHERE a.column_name IS NULL
  ),
  'actual_columns', (
    SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY a.table_name, a.column_name)
    FROM actual_columns AS a
  ),
  'atomic_functions_before_042', (
    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'name', p.proname,
          'identity_arguments', pg_catalog.pg_get_function_identity_arguments(p.oid)
        ) ORDER BY p.proname
      ),
      '[]'::jsonb
    )
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'pyra_create_task_atomic',
        'pyra_duplicate_task_atomic',
        'pyra_add_task_assignees_atomic',
        'pyra_remove_task_assignee_atomic',
        'pyra_mutate_task_label_atomic',
        'pyra_mutate_task_checklist_atomic',
        'pyra_advance_task_atomic',
        'pyra_move_task_atomic',
        'pyra_create_board_atomic',
        'pyra_create_board_column_atomic',
        'pyra_update_board_columns_atomic',
        'pyra_delete_board_column_atomic',
        'pyra_lock_task_write_entry',
        'pyra_lock_task_assignee_write'
      )
  ),
  'migration_records', (
    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'version', m.version,
          'applied_at', m.applied_at,
          'applied_by', m.applied_by,
          'checksum', m.checksum,
          'notes', m.notes
        ) ORDER BY m.version
      ),
      '[]'::jsonb
    )
    FROM public.pyra_schema_migrations AS m
    WHERE m.version LIKE '041%'
       OR m.version LIKE '042%'
  )
) AS migration_042_preflight;
