DO $rollback_postcondition$
DECLARE
  v_smoke_boards bigint;
  v_smoke_columns bigint;
  v_smoke_tasks bigint;
  v_smoke_assignees bigint;
  v_smoke_comments bigint;
  v_smoke_activity bigint;
  v_smoke_stage_history bigint;
  v_smoke_review_decisions bigint := 0;
  v_smoke_projects bigint;
  v_smoke_project_files bigint;
  v_smoke_client_comments bigint;
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.pyra_review_task_atomic(character varying,character varying,character varying,timestamp with time zone,character varying,character varying,character varying,text,character varying,character varying,character varying,character varying,character varying)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postcondition failed: pyra_review_task_atomic remains';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.pyra_delete_project_atomic(character varying)'
  ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.pyra_validate_task_review_decision()'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.pyra_guard_reviewed_production_delete()'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postcondition failed: migration 043 guard function remains';
  END IF;
  IF pg_catalog.to_regclass('public.pyra_task_review_decisions') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.pyra_task_review_decisions'
    INTO v_smoke_review_decisions;
    RAISE EXCEPTION 'rollback postcondition failed: review decision table remains with % rows',
      v_smoke_review_decisions;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.pyra_task_activity'::pg_catalog.regclass
      AND con.conname = 'ck_task_activity_rejection_kind'
  ) THEN
    RAISE EXCEPTION 'rollback postcondition failed: ck_task_activity_rejection_kind remains';
  END IF;

  SELECT pg_catalog.count(*) INTO v_smoke_boards
  FROM public.pyra_boards WHERE id IN ('bd_review_smoke43', 'bd_review_guard43');
  SELECT pg_catalog.count(*) INTO v_smoke_columns
  FROM public.pyra_board_columns
  WHERE board_id IN ('bd_review_smoke43', 'bd_review_guard43');
  SELECT pg_catalog.count(*) INTO v_smoke_tasks
  FROM public.pyra_tasks
  WHERE id IN (
    'tk_review_rej_043', 'tk_review_app_043', 'tk_review_conf43',
    'tk_review_fail43', 'tk_prod_guard_043'
  );
  SELECT pg_catalog.count(*) INTO v_smoke_assignees
  FROM public.pyra_task_assignees
  WHERE task_id IN ('tk_review_rej_043', 'tk_review_app_043', 'tk_review_conf43', 'tk_review_fail43');
  SELECT pg_catalog.count(*) INTO v_smoke_comments
  FROM public.pyra_task_comments
  WHERE id IN ('tc_review_bad_043', 'tc_review_rej_043', 'tc_review_conf43', 'tc_review_fail43');
  SELECT pg_catalog.count(*) INTO v_smoke_activity
  FROM public.pyra_task_activity
  WHERE id IN (
    'act_review_bad043', 'act_review_rej43', 'act_review_app43',
    'act_review_conf43', 'act_review_collision'
  );
  SELECT pg_catalog.count(*) INTO v_smoke_stage_history
  FROM public.pyra_task_stage_history
  WHERE id IN (
    'sh_review_bad_043', 'sh_review_rej_043', 'sh_review_app_043',
    'sh_review_conf43', 'sh_review_fail43', 'sh_prod_guard_043'
  );
  SELECT pg_catalog.count(*) INTO v_smoke_projects
  FROM public.pyra_projects WHERE id = 'pr_review_guard43';
  SELECT pg_catalog.count(*) INTO v_smoke_project_files
  FROM public.pyra_project_files WHERE id = 'pf_review_guard43';
  SELECT pg_catalog.count(*) INTO v_smoke_client_comments
  FROM public.pyra_client_comments WHERE id = 'cc_review_guard43';

  IF v_smoke_boards <> 0
     OR v_smoke_columns <> 0
     OR v_smoke_tasks <> 0
     OR v_smoke_assignees <> 0
     OR v_smoke_comments <> 0
     OR v_smoke_activity <> 0
     OR v_smoke_stage_history <> 0
     OR v_smoke_projects <> 0
     OR v_smoke_project_files <> 0
     OR v_smoke_client_comments <> 0 THEN
    RAISE EXCEPTION
      'rollback postcondition failed: smoke_boards=% smoke_columns=% smoke_tasks=% smoke_assignees=% smoke_comments=% smoke_activity=% smoke_stage_history=%',
      v_smoke_boards, v_smoke_columns, v_smoke_tasks, v_smoke_assignees,
      v_smoke_comments, v_smoke_activity, v_smoke_stage_history;
  END IF;
END;
$rollback_postcondition$;

SELECT pg_catalog.jsonb_build_object(
  'review_function_absent', pg_catalog.to_regprocedure(
    'public.pyra_review_task_atomic(character varying,character varying,character varying,timestamp with time zone,character varying,character varying,character varying,text,character varying,character varying,character varying,character varying,character varying)'
  ) IS NULL,
  'review_table_absent', pg_catalog.to_regclass('public.pyra_task_review_decisions') IS NULL,
  'project_delete_function_absent', pg_catalog.to_regprocedure(
    'public.pyra_delete_project_atomic(character varying)'
  ) IS NULL,
  'validator_function_absent', pg_catalog.to_regprocedure(
    'public.pyra_validate_task_review_decision()'
  ) IS NULL,
  'delete_guard_function_absent', pg_catalog.to_regprocedure(
    'public.pyra_guard_reviewed_production_delete()'
  ) IS NULL,
  'activity_constraint_absent', NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.pyra_task_activity'::pg_catalog.regclass
      AND con.conname = 'ck_task_activity_rejection_kind'
  ),
  'smoke_boards', 0,
  'smoke_columns', 0,
  'smoke_tasks', 0,
  'smoke_assignees', 0,
  'smoke_comments', 0,
  'smoke_activity', 0,
  'smoke_stage_history', 0,
  'smoke_review_decisions', 0,
  'smoke_projects', 0,
  'smoke_project_files', 0,
  'smoke_client_comments', 0
) AS task4_review_rollback_postcondition;
