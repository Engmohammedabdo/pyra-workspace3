DO $smoke$
DECLARE
  v_actor varchar;
  v_actor_name varchar;
  v_status text;
  v_task jsonb;
  v_decision jsonb;
  v_updated_at timestamptz;
  v_before_failure jsonb;
  v_failed boolean := false;
  v_delete_blocked boolean := false;
  v_invalid_direct_insert_blocked boolean := false;
  v_production_work_column_id varchar;
  v_production_review_column_id varchar;
BEGIN
  SELECT u.username, COALESCE(NULLIF(pg_catalog.btrim(u.display_name), ''), u.username)
  INTO v_actor, v_actor_name
  FROM public.pyra_users AS u
  WHERE u.username IS NOT NULL
    AND pg_catalog.btrim(u.username) <> ''
  ORDER BY u.username
  LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'atomic review smoke requires one existing user';
  END IF;

  IF pg_catalog.has_table_privilege('service_role', 'public.pyra_task_review_decisions', 'INSERT') THEN
    RAISE EXCEPTION 'service_role unexpectedly retains direct review-decision INSERT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pyra_boards WHERE id = 'bd_review_smoke43'
  ) OR EXISTS (
    SELECT 1 FROM public.pyra_tasks
    WHERE id IN (
      'tk_review_rej_043', 'tk_review_app_043', 'tk_review_conf43',
      'tk_review_fail43', 'tk_prod_guard_043'
    )
  ) OR EXISTS (
    SELECT 1 FROM public.pyra_projects WHERE id = 'pr_review_guard43'
  ) THEN
    RAISE EXCEPTION 'atomic review smoke fixture collision';
  END IF;

  INSERT INTO public.pyra_boards (id, name, created_by, is_pipeline)
  VALUES ('bd_review_smoke43', 'Atomic review smoke', v_actor, true);

  INSERT INTO public.pyra_board_columns (
    id, board_id, name, position, column_type, is_done_column, requires_approval
  ) VALUES
    ('bc_review_work_043', 'bd_review_smoke43', 'Work', 0, 'work', false, false),
    ('bc_review_rev_043', 'bd_review_smoke43', 'Review', 1, 'review', false, false),
    ('bc_review_gate043', 'bd_review_smoke43', 'Approved', 2, 'approved', false, true);

  INSERT INTO public.pyra_tasks (
    id, board_id, column_id, title, created_by, position, completion_percentage,
    stage_entered_at, created_at, updated_at
  ) VALUES
    ('tk_review_rej_043', 'bd_review_smoke43', 'bc_review_rev_043', 'Reject path', v_actor, 0, 50,
      '2026-07-20T08:00:00Z', '2026-07-19T08:00:00Z', '2026-07-20T09:00:00Z'),
    ('tk_review_app_043', 'bd_review_smoke43', 'bc_review_rev_043', 'Approve path', v_actor, 1, 50,
      '2026-07-20T08:00:00Z', '2026-07-19T08:00:00Z', '2026-07-20T09:01:00Z'),
    ('tk_review_conf43', 'bd_review_smoke43', 'bc_review_rev_043', 'Conflict path', v_actor, 2, 50,
      '2026-07-20T08:00:00Z', '2026-07-19T08:00:00Z', '2026-07-20T09:02:00Z'),
    ('tk_review_fail43', 'bd_review_smoke43', 'bc_review_rev_043', 'Rollback path', v_actor, 3, 50,
      '2026-07-20T08:00:00Z', '2026-07-19T08:00:00Z', '2026-07-20T09:03:00Z');

  -- Invalid structured marker must leave every artifact untouched.
  SELECT t.updated_at INTO v_updated_at
  FROM public.pyra_tasks AS t WHERE t.id = 'tk_review_rej_043';
  SELECT r.status, r.task, r.decision
  INTO v_status, v_task, v_decision
  FROM public.pyra_review_task_atomic(
    'tk_review_rej_043', 'bd_review_smoke43', 'bc_review_rev_043', v_updated_at,
    v_actor, v_actor_name, 'reject', 'Invalid marker', 'OUTRIGHT',
    'sh_review_bad_043', 'ta_review_bad_043', 'tc_review_bad_043', 'act_review_bad043'
  ) AS r;
  IF v_status IS DISTINCT FROM 'invalid_review_input'
     OR v_task IS NOT NULL
     OR v_decision IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.pyra_task_stage_history WHERE id = 'sh_review_bad_043')
     OR EXISTS (SELECT 1 FROM public.pyra_task_review_decisions WHERE history_id = 'sh_review_bad_043')
     OR EXISTS (SELECT 1 FROM public.pyra_task_comments WHERE id = 'tc_review_bad_043')
     OR EXISTS (SELECT 1 FROM public.pyra_task_activity WHERE id = 'act_review_bad043') THEN
    RAISE EXCEPTION 'invalid review marker wrote state: status=%', v_status;
  END IF;

  -- Outright rejection writes task, exact history, native decision, comment,
  -- and activity as one transaction with one database timestamp.
  SELECT r.status, r.task, r.decision
  INTO v_status, v_task, v_decision
  FROM public.pyra_review_task_atomic(
    'tk_review_rej_043', 'bd_review_smoke43', 'bc_review_rev_043', v_updated_at,
    v_actor, v_actor_name, 'reject', 'Must be rebuilt', 'outright',
    'sh_review_rej_043', 'ta_review_rej_043', 'tc_review_rej_043', 'act_review_rej43'
  ) AS r;
  IF v_status IS DISTINCT FROM 'ok'
     OR v_task ->> 'column_id' IS DISTINCT FROM 'bc_review_work_043'
     OR v_decision ->> 'history_id' IS DISTINCT FROM 'sh_review_rej_043'
     OR v_decision ->> 'rejection_kind' IS DISTINCT FROM 'outright'
     OR NOT EXISTS (
       SELECT 1
       FROM public.pyra_task_stage_history AS h
       JOIN public.pyra_task_review_decisions AS d ON d.history_id = h.id
       JOIN public.pyra_tasks AS t ON t.id = h.task_id
       WHERE h.id = 'sh_review_rej_043'
         AND h.task_id = 'tk_review_rej_043'
         AND h.board_id = 'bd_review_smoke43'
         AND h.from_column_id = 'bc_review_rev_043'
         AND h.to_column_id = 'bc_review_work_043'
         AND h.approved_by IS NULL
         AND d.task_id = h.task_id
         AND d.board_id = h.board_id
         AND d.action = 'reject'
         AND d.rejection_kind = 'outright'
         AND d.decided_at = h.created_at
         AND d.activity_id = 'act_review_rej43'
         AND d.comment_id = 'tc_review_rej_043'
         AND t.updated_at = h.created_at
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.pyra_task_comments
       WHERE id = 'tc_review_rej_043' AND content = 'Must be rebuilt'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.pyra_task_activity
       WHERE id = 'act_review_rej43'
         AND action = 'stage_rejected'
         AND pg_catalog.jsonb_typeof(details) = 'object'
         AND details @> pg_catalog.jsonb_build_object(
           'rejection_kind', 'outright',
           'note', 'Must be rebuilt'
         )
     ) THEN
    RAISE EXCEPTION 'atomic outright rejection failed: status=% task=% decision=%',
      v_status, v_task, v_decision;
  END IF;

  -- Approval has no rejection marker/comment and records the approving actor.
  SELECT t.updated_at INTO v_updated_at
  FROM public.pyra_tasks AS t WHERE t.id = 'tk_review_app_043';
  SELECT r.status, r.task, r.decision
  INTO v_status, v_task, v_decision
  FROM public.pyra_review_task_atomic(
    'tk_review_app_043', 'bd_review_smoke43', 'bc_review_rev_043', v_updated_at,
    v_actor, v_actor_name, 'approve', '', NULL,
    'sh_review_app_043', 'ta_review_app_043', NULL, 'act_review_app43'
  ) AS r;
  IF v_status IS DISTINCT FROM 'ok'
     OR v_task ->> 'column_id' IS DISTINCT FROM 'bc_review_gate043'
     OR NOT EXISTS (
       SELECT 1
       FROM public.pyra_task_stage_history AS h
       JOIN public.pyra_task_review_decisions AS d ON d.history_id = h.id
       WHERE h.id = 'sh_review_app_043'
         AND h.approved_by = v_actor
         AND d.action = 'approve'
         AND d.rejection_kind IS NULL
         AND d.comment_id IS NULL
         AND d.decided_at = h.created_at
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.pyra_task_activity
       WHERE id = 'act_review_app43' AND action = 'stage_approved'
     ) THEN
    RAISE EXCEPTION 'atomic approval failed: status=% task=% decision=%',
      v_status, v_task, v_decision;
  END IF;

  -- Even the migration owner cannot manufacture an orphan decision: the
  -- authoritative linkage trigger rejects a row without its exact history.
  BEGIN
    INSERT INTO public.pyra_task_review_decisions (
      history_id, task_id, board_id, action, rejection_kind, note,
      decided_by, decided_at, activity_id, comment_id
    ) VALUES (
      'sh_review_orphan43', 'tk_review_app_043', 'bd_review_smoke43',
      'approve', NULL, NULL, v_actor, pg_catalog.clock_timestamp(),
      'act_review_app43', NULL
    );
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF pg_catalog.strpos(SQLERRM, 'PYRA_REVIEW_DECISION_LINKAGE_INVALID') > 0 THEN
        v_invalid_direct_insert_blocked := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_invalid_direct_insert_blocked
     OR EXISTS (
       SELECT 1 FROM public.pyra_task_review_decisions
       WHERE history_id = 'sh_review_orphan43'
     ) THEN
    RAISE EXCEPTION 'orphan direct review-decision INSERT was not blocked';
  END IF;

  -- Stale task version must map to transition_conflict and write nothing.
  SELECT t.updated_at INTO v_updated_at
  FROM public.pyra_tasks AS t WHERE t.id = 'tk_review_conf43';
  SELECT r.status, r.task, r.decision
  INTO v_status, v_task, v_decision
  FROM public.pyra_review_task_atomic(
    'tk_review_conf43', 'bd_review_smoke43', 'bc_review_rev_043',
    v_updated_at + interval '1 second',
    v_actor, v_actor_name, 'reject', 'Stale decision', 'revision',
    'sh_review_conf43', 'ta_review_conf43', 'tc_review_conf43', 'act_review_conf43'
  ) AS r;
  IF v_status IS DISTINCT FROM 'transition_conflict'
     OR EXISTS (SELECT 1 FROM public.pyra_task_stage_history WHERE id = 'sh_review_conf43')
     OR EXISTS (SELECT 1 FROM public.pyra_task_review_decisions WHERE history_id = 'sh_review_conf43')
     OR EXISTS (SELECT 1 FROM public.pyra_task_comments WHERE id = 'tc_review_conf43')
     OR EXISTS (SELECT 1 FROM public.pyra_task_activity WHERE id = 'act_review_conf43') THEN
    RAISE EXCEPTION 'transition conflict left partial review state: status=%', v_status;
  END IF;

  -- Force the activity insert to fail. The inner exception block proves the
  -- earlier task/history/comment writes are rolled back before the final
  -- validated decision insert can run.
  INSERT INTO public.pyra_task_activity (
    id, task_id, username, display_name, action, details
  ) VALUES (
    'act_review_collision', 'tk_review_fail43', v_actor, v_actor_name,
    'smoke_collision', '{}'::jsonb
  );
  SELECT pg_catalog.to_jsonb(t) INTO v_before_failure
  FROM public.pyra_tasks AS t WHERE t.id = 'tk_review_fail43';
  BEGIN
    PERFORM 1
    FROM public.pyra_review_task_atomic(
      'tk_review_fail43', 'bd_review_smoke43', 'bc_review_rev_043',
      (v_before_failure ->> 'updated_at')::timestamptz,
      v_actor, v_actor_name, 'reject', 'Must roll back', 'revision',
      'sh_review_fail43', 'ta_review_fail43', 'tc_review_fail43', 'act_review_collision'
    );
    RAISE EXCEPTION 'expected unique_violation did not occur';
  EXCEPTION
    WHEN unique_violation THEN
      v_failed := true;
  END;
  IF NOT v_failed
     OR (SELECT pg_catalog.to_jsonb(t) FROM public.pyra_tasks AS t WHERE t.id = 'tk_review_fail43')
       IS DISTINCT FROM v_before_failure
     OR EXISTS (SELECT 1 FROM public.pyra_task_stage_history WHERE id = 'sh_review_fail43')
     OR EXISTS (SELECT 1 FROM public.pyra_task_review_decisions WHERE history_id = 'sh_review_fail43')
     OR EXISTS (SELECT 1 FROM public.pyra_task_comments WHERE id = 'tc_review_fail43')
     OR (SELECT pg_catalog.count(*) FROM public.pyra_task_activity WHERE id = 'act_review_collision') <> 1 THEN
    RAISE EXCEPTION 'unique_violation did not roll back every review write';
  END IF;

  -- Create a task with immutable production-review history, then move its
  -- current board under a project. Task, board cascade, and project cascade
  -- deletion must all fail while ordinary archive remains allowed.
  SELECT c.id
  INTO v_production_work_column_id
  FROM public.pyra_board_columns AS c
  WHERE c.board_id = 'bd_production'
    AND c.column_type IS DISTINCT FROM 'review'
    AND NOT COALESCE(c.is_done_column, false)
  ORDER BY c.position NULLS LAST, c.id
  LIMIT 1;

  SELECT c.id
  INTO v_production_review_column_id
  FROM public.pyra_board_columns AS c
  WHERE c.board_id = 'bd_production'
    AND c.column_type = 'review'
  ORDER BY c.position NULLS LAST, c.id
  LIMIT 1;

  IF v_production_work_column_id IS NULL OR v_production_review_column_id IS NULL THEN
    RAISE EXCEPTION 'production review delete smoke requires work and review columns';
  END IF;

  INSERT INTO public.pyra_projects (
    id, name, client_company, storage_path, created_by
  ) VALUES (
    'pr_review_guard43', 'Review delete guard', 'Smoke client',
    '/smoke/review-delete-guard', v_actor
  );
  INSERT INTO public.pyra_boards (
    id, project_id, name, created_by, is_pipeline
  ) VALUES (
    'bd_review_guard43', 'pr_review_guard43', 'Review guard board', v_actor, false
  );
  INSERT INTO public.pyra_board_columns (
    id, board_id, name, position, column_type, is_done_column, requires_approval
  ) VALUES (
    'bc_review_guard43', 'bd_review_guard43', 'Archive only', 0,
    'work', false, false
  );
  INSERT INTO public.pyra_tasks (
    id, board_id, column_id, title, created_by, position,
    due_date, due_at, production_deadline_exempt,
    stage_entered_at, created_at, updated_at
  ) VALUES (
    'tk_prod_guard_043', 'bd_production', v_production_work_column_id,
    'Reviewed production delete guard', v_actor, 0,
    '2026-08-01', '2026-08-01T12:00:00Z', false,
    '2026-07-20T08:00:00Z', '2026-07-19T08:00:00Z', '2026-07-20T09:04:00Z'
  );
  INSERT INTO public.pyra_task_stage_history (
    id, task_id, board_id, from_column_id, to_column_id, moved_by,
    approved_by, created_at, due_at_snapshot, task_created_at_snapshot,
    assignees_snapshot
  ) VALUES (
    'sh_prod_guard_043', 'tk_prod_guard_043', 'bd_production',
    v_production_work_column_id, v_production_review_column_id, v_actor,
    NULL, '2026-07-20T10:00:00Z', '2026-08-01T12:00:00Z',
    '2026-07-19T08:00:00Z', pg_catalog.jsonb_build_array(v_actor)
  );
  UPDATE public.pyra_tasks
  SET board_id = 'bd_review_guard43',
      column_id = 'bc_review_guard43',
      updated_at = '2026-07-20T10:01:00Z'
  WHERE id = 'tk_prod_guard_043';

  INSERT INTO public.pyra_project_files (
    id, project_id, file_name, file_path, uploaded_by
  ) VALUES (
    'pf_review_guard43', 'pr_review_guard43', 'evidence.txt',
    '/smoke/review-delete-guard/evidence.txt', v_actor
  );
  INSERT INTO public.pyra_client_comments (
    id, project_id, author_type, author_id, author_name, text
  ) VALUES (
    'cc_review_guard43', 'pr_review_guard43', 'team', v_actor,
    v_actor_name, 'Must survive blocked cascade'
  );

  v_delete_blocked := false;
  BEGIN
    PERFORM public.pyra_delete_project_atomic('pr_review_guard43');
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM = 'PYRA_PRODUCTION_REVIEW_DELETE_BLOCKED' THEN
        v_delete_blocked := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_delete_blocked
     OR NOT EXISTS (SELECT 1 FROM public.pyra_projects WHERE id = 'pr_review_guard43')
     OR NOT EXISTS (SELECT 1 FROM public.pyra_project_files WHERE id = 'pf_review_guard43')
     OR NOT EXISTS (SELECT 1 FROM public.pyra_client_comments WHERE id = 'cc_review_guard43') THEN
    RAISE EXCEPTION 'blocked project cascade left partial deletion';
  END IF;

  v_delete_blocked := false;
  BEGIN
    DELETE FROM public.pyra_boards WHERE id = 'bd_review_guard43';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM = 'PYRA_PRODUCTION_REVIEW_DELETE_BLOCKED' THEN
        v_delete_blocked := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_delete_blocked
     OR NOT EXISTS (SELECT 1 FROM public.pyra_boards WHERE id = 'bd_review_guard43')
     OR NOT EXISTS (SELECT 1 FROM public.pyra_tasks WHERE id = 'tk_prod_guard_043') THEN
    RAISE EXCEPTION 'reviewed production board cascade was not blocked atomically';
  END IF;

  v_delete_blocked := false;
  BEGIN
    DELETE FROM public.pyra_tasks WHERE id = 'tk_prod_guard_043';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM = 'PYRA_PRODUCTION_REVIEW_DELETE_BLOCKED' THEN
        v_delete_blocked := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_delete_blocked THEN
    RAISE EXCEPTION 'reviewed production task hard delete was not blocked';
  END IF;

  UPDATE public.pyra_tasks
  SET is_archived = true
  WHERE id = 'tk_prod_guard_043';
  IF NOT EXISTS (
    SELECT 1 FROM public.pyra_tasks
    WHERE id = 'tk_prod_guard_043' AND is_archived
  ) THEN
    RAISE EXCEPTION 'reviewed production task archive unexpectedly failed';
  END IF;
END;
$smoke$;

SELECT pg_catalog.jsonb_build_object(
  'status', 'ok',
  'stage_rejected', (SELECT pg_catalog.count(*) FROM public.pyra_task_activity WHERE id = 'act_review_rej43'),
  'stage_approved', (SELECT pg_catalog.count(*) FROM public.pyra_task_activity WHERE id = 'act_review_app43'),
  'native_outright', (SELECT pg_catalog.count(*) FROM public.pyra_task_review_decisions WHERE history_id = 'sh_review_rej_043'),
  'atomic_failure_rolled_back', NOT EXISTS (
    SELECT 1 FROM public.pyra_task_stage_history WHERE id = 'sh_review_fail43'
  ),
  'orphan_direct_insert_blocked', true,
  'reviewed_production_delete_blocked', true,
  'reviewed_production_archive_allowed', true
) AS task4_review_smoke;
