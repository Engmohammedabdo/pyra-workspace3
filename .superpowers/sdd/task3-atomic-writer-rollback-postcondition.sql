DO $rollback_postcondition$
DECLARE
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
  IF pg_catalog.to_regprocedure(
    'public.pyra_create_task_atomic(character varying,character varying,character varying,character varying,text,character varying,date,timestamp with time zone,date,numeric,character varying,jsonb)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postcondition failed: pyra_create_task_atomic remains';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.pyra_duplicate_task_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,date,timestamp with time zone,character varying,character varying,jsonb,jsonb,character varying)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postcondition failed: pyra_duplicate_task_atomic remains';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.pyra_add_task_assignees_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,jsonb)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postcondition failed: pyra_add_task_assignees_atomic remains';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.pyra_remove_task_assignee_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postcondition failed: pyra_remove_task_assignee_atomic remains';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.pyra_mutate_task_label_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,character varying)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postcondition failed: pyra_mutate_task_label_atomic remains';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.pyra_mutate_task_checklist_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,jsonb,character varying,character varying,character varying)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postcondition failed: pyra_mutate_task_checklist_atomic remains';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.pyra_advance_task_atomic(character varying,character varying,character varying,character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,character varying,text,character varying,character varying)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postcondition failed: pyra_advance_task_atomic remains';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.pyra_move_task_atomic(character varying,character varying,character varying,timestamp with time zone,character varying,character varying,integer,character varying,character varying,date,timestamp with time zone,character varying,character varying)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postcondition failed: pyra_move_task_atomic remains';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.pyra_create_board_atomic(character varying,character varying,text,character varying,text,character varying,boolean,boolean,character varying,jsonb,jsonb)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postcondition failed: pyra_create_board_atomic remains';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.pyra_create_board_column_atomic(character varying,character varying,character varying,character varying,integer)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postcondition failed: pyra_create_board_column_atomic remains';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.pyra_update_board_columns_atomic(character varying,jsonb)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postcondition failed: pyra_update_board_columns_atomic remains';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.pyra_delete_board_column_atomic(character varying,character varying)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postcondition failed: pyra_delete_board_column_atomic remains';
  END IF;
  IF pg_catalog.to_regprocedure('public.pyra_lock_task_assignee_write()') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postcondition failed: pyra_lock_task_assignee_write remains';
  END IF;
  IF pg_catalog.to_regprocedure('public.pyra_lock_task_write_entry()') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postcondition failed: pyra_lock_task_write_entry remains';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgname = 'trg_projects_task_write_entry' AND NOT tg.tgisinternal
  ) THEN
    RAISE EXCEPTION 'rollback postcondition failed: trg_projects_task_write_entry remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgname = 'trg_boards_task_write_entry' AND NOT tg.tgisinternal
  ) THEN
    RAISE EXCEPTION 'rollback postcondition failed: trg_boards_task_write_entry remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgname = 'trg_tasks_task_write_entry' AND NOT tg.tgisinternal
  ) THEN
    RAISE EXCEPTION 'rollback postcondition failed: trg_tasks_task_write_entry remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgname = 'trg_task_assignees_write_entry' AND NOT tg.tgisinternal
  ) THEN
    RAISE EXCEPTION 'rollback postcondition failed: trg_task_assignees_write_entry remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgname = 'trg_board_columns_write_entry' AND NOT tg.tgisinternal
  ) THEN
    RAISE EXCEPTION 'rollback postcondition failed: trg_board_columns_write_entry remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgname = 'trg_task_stage_history_write_entry' AND NOT tg.tgisinternal
  ) THEN
    RAISE EXCEPTION 'rollback postcondition failed: trg_task_stage_history_write_entry remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgname = 'trg_task_assignees_atomic_lock' AND NOT tg.tgisinternal
  ) THEN
    RAISE EXCEPTION 'rollback postcondition failed: trg_task_assignees_atomic_lock remains';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'pyra_tasks'
      AND c.column_name = 'production_deadline_locked_at'
  ) THEN
    RAISE EXCEPTION 'rollback postcondition failed: production_deadline_locked_at remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'pyra_tasks'
      AND c.column_name = 'production_deadline_exempt'
  ) THEN
    RAISE EXCEPTION 'rollback postcondition failed: production_deadline_exempt remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'pyra_task_stage_history'
      AND c.column_name = 'task_created_at_snapshot'
  ) THEN
    RAISE EXCEPTION 'rollback postcondition failed: task_created_at_snapshot remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'pyra_task_stage_history'
      AND c.column_name = 'assignees_snapshot'
  ) THEN
    RAISE EXCEPTION 'rollback postcondition failed: assignees_snapshot remains';
  END IF;

  IF pg_catalog.to_regclass('public.idx_task_stage_history_from_column') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postcondition failed: idx_task_stage_history_from_column remains';
  END IF;
  IF pg_catalog.to_regclass('public.idx_task_stage_history_to_column') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postcondition failed: idx_task_stage_history_to_column remains';
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
    RAISE EXCEPTION 'rollback postcondition failed: smoke_boards=%', v_smoke_boards;
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
    RAISE EXCEPTION 'rollback postcondition failed: smoke_columns=%', v_smoke_columns;
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
    RAISE EXCEPTION 'rollback postcondition failed: smoke_board_labels=%', v_smoke_board_labels;
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
    RAISE EXCEPTION 'rollback postcondition failed: smoke_tasks=%', v_smoke_tasks;
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
    RAISE EXCEPTION 'rollback postcondition failed: smoke_assignees=%', v_smoke_assignees;
  END IF;

  SELECT pg_catalog.count(*) INTO v_smoke_task_labels
  FROM public.pyra_task_labels
  WHERE task_id IN ('tk_aw_source_042', 'tk_aw_dup_042', 'tk_aw_dup_fail_042')
     OR label_id IN ('bl_aw_smoke_042', 'bl_aw_rel_042', 'bl_aw_other_042');
  IF v_smoke_task_labels <> 0 THEN
    RAISE EXCEPTION 'rollback postcondition failed: smoke_task_labels=%', v_smoke_task_labels;
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
    RAISE EXCEPTION 'rollback postcondition failed: smoke_checklist=%', v_smoke_checklist;
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
    RAISE EXCEPTION 'rollback postcondition failed: smoke_activity=%', v_smoke_activity;
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
    RAISE EXCEPTION 'rollback postcondition failed: smoke_stage_history=%', v_smoke_stage_history;
  END IF;
END;
$rollback_postcondition$;

SELECT pg_catalog.jsonb_build_object(
  'create_function_absent', pg_catalog.to_regprocedure(
    'public.pyra_create_task_atomic(character varying,character varying,character varying,character varying,text,character varying,date,timestamp with time zone,date,numeric,character varying,jsonb)'
  ) IS NULL,
  'duplicate_function_absent', pg_catalog.to_regprocedure(
    'public.pyra_duplicate_task_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,date,timestamp with time zone,character varying,character varying,jsonb,jsonb,character varying)'
  ) IS NULL,
  'add_assignees_function_absent', pg_catalog.to_regprocedure(
    'public.pyra_add_task_assignees_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,jsonb)'
  ) IS NULL,
  'remove_assignee_function_absent', pg_catalog.to_regprocedure(
    'public.pyra_remove_task_assignee_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying)'
  ) IS NULL,
  'label_function_absent', pg_catalog.to_regprocedure(
    'public.pyra_mutate_task_label_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,character varying)'
  ) IS NULL,
  'checklist_function_absent', pg_catalog.to_regprocedure(
    'public.pyra_mutate_task_checklist_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,jsonb,character varying,character varying,character varying)'
  ) IS NULL,
  'advance_function_absent', pg_catalog.to_regprocedure(
    'public.pyra_advance_task_atomic(character varying,character varying,character varying,character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,character varying,text,character varying,character varying)'
  ) IS NULL,
  'move_function_absent', pg_catalog.to_regprocedure(
    'public.pyra_move_task_atomic(character varying,character varying,character varying,timestamp with time zone,character varying,character varying,integer,character varying,character varying,date,timestamp with time zone,character varying,character varying)'
  ) IS NULL,
  'create_board_function_absent', pg_catalog.to_regprocedure(
    'public.pyra_create_board_atomic(character varying,character varying,text,character varying,text,character varying,boolean,boolean,character varying,jsonb,jsonb)'
  ) IS NULL,
  'create_board_column_function_absent', pg_catalog.to_regprocedure(
    'public.pyra_create_board_column_atomic(character varying,character varying,character varying,character varying,integer)'
  ) IS NULL,
  'update_board_columns_function_absent', pg_catalog.to_regprocedure(
    'public.pyra_update_board_columns_atomic(character varying,jsonb)'
  ) IS NULL,
  'delete_board_column_function_absent', pg_catalog.to_regprocedure(
    'public.pyra_delete_board_column_atomic(character varying,character varying)'
  ) IS NULL,
  'assignee_lock_function_absent', pg_catalog.to_regprocedure(
    'public.pyra_lock_task_assignee_write()'
  ) IS NULL,
  'task_write_entry_function_absent', pg_catalog.to_regprocedure(
    'public.pyra_lock_task_write_entry()'
  ) IS NULL,
  'task_write_entry_triggers_absent', NOT EXISTS (
    SELECT 1
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
  'assignee_lock_trigger_absent', NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgrelid = 'public.pyra_task_assignees'::pg_catalog.regclass
      AND tg.tgname = 'trg_task_assignees_atomic_lock'
      AND NOT tg.tgisinternal
  ),
  'new_columns_absent', NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND (
        (c.table_name = 'pyra_tasks' AND c.column_name IN (
          'production_deadline_locked_at',
          'production_deadline_exempt'
        ))
        OR (c.table_name = 'pyra_task_stage_history' AND c.column_name IN (
          'task_created_at_snapshot',
          'assignees_snapshot'
        ))
      )
  ),
  'history_indexes_absent',
    pg_catalog.to_regclass('public.idx_task_stage_history_from_column') IS NULL
    AND pg_catalog.to_regclass('public.idx_task_stage_history_to_column') IS NULL,
  'smoke_boards', (
    SELECT pg_catalog.count(*) FROM public.pyra_boards
    WHERE id IN (
      'bd_aw_smoke_042',
      'bd_aw_other_042',
      'bd_aw_board_042',
      'bd_aw_board_fail42'
    )
  ),
  'smoke_columns', (
    SELECT pg_catalog.count(*) FROM public.pyra_board_columns
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
       )
  ),
  'smoke_board_labels', (
    SELECT pg_catalog.count(*) FROM public.pyra_board_labels
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
    )
  ),
  'smoke_tasks', (
    SELECT pg_catalog.count(*) FROM public.pyra_tasks
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
    )
  ),
  'smoke_assignees', (
    SELECT pg_catalog.count(*) FROM public.pyra_task_assignees
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
    )
  ),
  'smoke_task_labels', (
    SELECT pg_catalog.count(*) FROM public.pyra_task_labels
    WHERE task_id IN ('tk_aw_source_042', 'tk_aw_dup_042', 'tk_aw_dup_fail_042')
       OR label_id IN ('bl_aw_smoke_042', 'bl_aw_rel_042', 'bl_aw_other_042')
  ),
  'smoke_checklist', (
    SELECT pg_catalog.count(*) FROM public.pyra_task_checklist
    WHERE task_id IN ('tk_aw_source_042', 'tk_aw_dup_042', 'tk_aw_dup_fail_042')
       OR id IN (
         'cl_aw_source_042',
         'cl_aw_rel_a_042',
         'cl_aw_rel_b_042',
         'cl_aw_rel_stale42',
         'cl_aw_rel_fail042'
       )
  ),
  'smoke_activity', (
    SELECT pg_catalog.count(*) FROM public.pyra_task_activity
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
    )
  ),
  'smoke_stage_history', (
    SELECT pg_catalog.count(*) FROM public.pyra_task_stage_history
    WHERE id IN (
      'sh_aw_move_042',
      'sh_aw_move_fail42',
      'sh_aw_adv_042',
      'sh_aw_adv_fail42',
      'sh_aw_hist_from42',
      'sh_aw_hist_to_042'
    )
       OR task_id IN (
         'tk_aw_source_042',
         'tk_aw_advance_042',
         'tk_aw_adv_fail042',
         'tk_aw_move_fail042',
         'tk_aw_dup_042',
         'tk_aw_archived_42'
       )
  )
) AS rollback_postcondition;
