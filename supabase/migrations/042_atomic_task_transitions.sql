-- =============================================================
-- Migration 042: Atomic task transitions
-- =============================================================
-- Additive and safe before the exact-deadline API deploy. The application
-- does not call these functions until its transition routes are deployed.
--
-- Each function owns one complete transition transaction. Expected races and
-- validation failures return a stable status before any mutation. Unexpected
-- database errors abort the RPC statement, so PostgreSQL rolls every write
-- back together.
-- Forward-only (Phase 14.2).
-- =============================================================

BEGIN;

ALTER TABLE public.pyra_tasks
  ADD COLUMN IF NOT EXISTS production_deadline_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS production_deadline_exempt boolean NOT NULL DEFAULT false;

ALTER TABLE public.pyra_task_stage_history
  ADD COLUMN IF NOT EXISTS task_created_at_snapshot timestamptz,
  ADD COLUMN IF NOT EXISTS assignees_snapshot jsonb;

CREATE INDEX IF NOT EXISTS idx_task_stage_history_from_column
  ON public.pyra_task_stage_history(from_column_id)
  WHERE from_column_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_stage_history_to_column
  ON public.pyra_task_stage_history(to_column_id);

CREATE OR REPLACE FUNCTION public.pyra_create_task_atomic(
  p_task_id varchar,
  p_board_id varchar,
  p_column_id varchar,
  p_title varchar,
  p_description text,
  p_priority varchar,
  p_due_date date,
  p_due_at timestamptz,
  p_start_date date,
  p_estimated_hours numeric,
  p_created_by varchar,
  p_assignees jsonb
)
RETURNS TABLE(status text, task jsonb, mutation jsonb)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_task public.pyra_tasks%ROWTYPE;
  v_column public.pyra_board_columns%ROWTYPE;
  v_assignees jsonb := COALESCE(p_assignees, '[]'::jsonb);
  v_position integer;
  v_task_number integer;
  v_created_at timestamptz;
  v_existing_user_count integer;
BEGIN
  IF p_task_id IS NULL
     OR pg_catalog.btrim(p_task_id) = ''
     OR pg_catalog.length(p_task_id) > 20
     OR p_board_id IS NULL
     OR pg_catalog.btrim(p_board_id) = ''
     OR p_column_id IS NULL
     OR pg_catalog.btrim(p_column_id) = ''
     OR p_title IS NULL
     OR pg_catalog.btrim(p_title) = ''
     OR pg_catalog.length(p_title) > 500
     OR p_created_by IS NULL
     OR pg_catalog.btrim(p_created_by) = ''
     OR (p_priority IS NOT NULL AND pg_catalog.length(p_priority) > 20) THEN
    RETURN QUERY SELECT 'invalid_task_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF pg_catalog.jsonb_typeof(v_assignees) IS DISTINCT FROM 'array'
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(v_assignees) AS item(value)
       WHERE pg_catalog.jsonb_typeof(item.value) IS DISTINCT FROM 'object'
          OR pg_catalog.jsonb_typeof(item.value -> 'id') IS DISTINCT FROM 'string'
          OR pg_catalog.jsonb_typeof(item.value -> 'username') IS DISTINCT FROM 'string'
          OR pg_catalog.btrim(item.value ->> 'id') = ''
          OR pg_catalog.length(item.value ->> 'id') > 20
          OR pg_catalog.btrim(item.value ->> 'username') = ''
          OR item.value ->> 'username' IS DISTINCT FROM pg_catalog.btrim(item.value ->> 'username')
     )
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.jsonb_array_elements(v_assignees) AS item(value)
     ) IS DISTINCT FROM (
       SELECT pg_catalog.count(DISTINCT item.value ->> 'id')
       FROM pg_catalog.jsonb_array_elements(v_assignees) AS item(value)
     )
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.jsonb_array_elements(v_assignees) AS item(value)
     ) IS DISTINCT FROM (
       SELECT pg_catalog.count(DISTINCT item.value ->> 'username')
       FROM pg_catalog.jsonb_array_elements(v_assignees) AS item(value)
     ) THEN
    RETURN QUERY SELECT 'invalid_assignees'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pyra_task_assignees', 42042)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_task_id, 42042)
  );

  PERFORM b.id
  FROM public.pyra_boards AS b
  WHERE b.id = p_board_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_board'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM c.id
  FROM public.pyra_board_columns AS c
  WHERE c.board_id = p_board_id
  ORDER BY c.id
  FOR UPDATE;

  SELECT c.*
  INTO v_column
  FROM public.pyra_board_columns AS c
  WHERE c.id = p_column_id
    AND c.board_id = p_board_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_destination'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF v_column.column_type IN ('review', 'delivery')
     OR COALESCE(v_column.requires_approval, false) THEN
    RETURN QUERY SELECT 'gated_destination'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF p_board_id = 'bd_production' THEN
    IF p_due_date IS NULL OR p_due_at IS NULL THEN
      RETURN QUERY SELECT 'production_deadline_required'::text, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;
  END IF;
  IF p_due_at IS NOT NULL
     AND (
       p_due_date IS NULL
       OR (p_due_at AT TIME ZONE 'Asia/Dubai')::date IS DISTINCT FROM p_due_date
     ) THEN
    RETURN QUERY SELECT 'production_deadline_invalid'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM u.username
  FROM public.pyra_users AS u
  WHERE u.username IN (
    SELECT item.value ->> 'username'
    FROM pg_catalog.jsonb_array_elements(v_assignees) AS item(value)
  )
  ORDER BY u.username
  FOR KEY SHARE;

  SELECT pg_catalog.count(*)::integer
  INTO v_existing_user_count
  FROM public.pyra_users AS u
  WHERE u.username IN (
    SELECT item.value ->> 'username'
    FROM pg_catalog.jsonb_array_elements(v_assignees) AS item(value)
  );
  IF v_existing_user_count IS DISTINCT FROM pg_catalog.jsonb_array_length(v_assignees) THEN
    RETURN QUERY SELECT 'invalid_assignees'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.pyra_tasks AS t WHERE t.id = p_task_id) THEN
    RETURN QUERY SELECT 'task_write_conflict'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM t.id
  FROM public.pyra_tasks AS t
  WHERE t.board_id = p_board_id
  ORDER BY t.id
  FOR UPDATE;

  SELECT
    COALESCE(MAX(t.position) FILTER (WHERE t.column_id = p_column_id), -1) + 1,
    COALESCE(MAX(t.task_number), 0) + 1
  INTO v_position, v_task_number
  FROM public.pyra_tasks AS t
  WHERE t.board_id = p_board_id;

  v_created_at := pg_catalog.clock_timestamp();
  INSERT INTO public.pyra_tasks (
    id,
    board_id,
    column_id,
    title,
    description,
    position,
    priority,
    due_date,
    due_at,
    start_date,
    estimated_hours,
    task_number,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    p_task_id,
    p_board_id,
    p_column_id,
    p_title,
    p_description,
    v_position,
    COALESCE(NULLIF(p_priority, ''), 'medium'),
    p_due_date,
    p_due_at,
    p_start_date,
    p_estimated_hours,
    v_task_number,
    p_created_by,
    v_created_at,
    v_created_at
  )
  RETURNING * INTO v_task;

  INSERT INTO public.pyra_task_assignees (
    id,
    task_id,
    username,
    assigned_by,
    assigned_at
  )
  SELECT
    item.value ->> 'id',
    p_task_id,
    item.value ->> 'username',
    p_created_by,
    v_created_at
  FROM pg_catalog.jsonb_array_elements(v_assignees) AS item(value);

  RETURN QUERY
  SELECT
    'ok'::text,
    pg_catalog.to_jsonb(v_task),
    pg_catalog.jsonb_build_object(
      'position', v_position,
      'task_number', v_task_number,
      'assignees', (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(item.value ->> 'username' ORDER BY item.value ->> 'username'),
          '[]'::jsonb
        )
        FROM pg_catalog.jsonb_array_elements(v_assignees) AS item(value)
      )
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pyra_duplicate_task_atomic(
  p_source_task_id varchar,
  p_expected_source_board_id varchar,
  p_expected_source_updated_at timestamptz,
  p_new_task_id varchar,
  p_new_title varchar,
  p_target_board_id varchar,
  p_target_column_id varchar,
  p_due_date date,
  p_due_at timestamptz,
  p_created_by varchar,
  p_actor_display_name varchar,
  p_assignee_ids jsonb,
  p_checklist_ids jsonb,
  p_activity_id varchar
)
RETURNS TABLE(status text, task jsonb, mutation jsonb)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_source public.pyra_tasks%ROWTYPE;
  v_task public.pyra_tasks%ROWTYPE;
  v_target_column public.pyra_board_columns%ROWTYPE;
  v_assignee_ids jsonb := COALESCE(p_assignee_ids, '[]'::jsonb);
  v_checklist_ids jsonb := COALESCE(p_checklist_ids, '[]'::jsonb);
  v_lock_task_id varchar;
  v_position integer;
  v_task_number integer;
  v_created_at timestamptz;
  v_assignee_count integer;
  v_checklist_count integer;
BEGIN
  IF p_source_task_id IS NULL
     OR pg_catalog.btrim(p_source_task_id) = ''
     OR p_expected_source_board_id IS NULL
     OR pg_catalog.btrim(p_expected_source_board_id) = ''
     OR p_new_task_id IS NULL
     OR pg_catalog.btrim(p_new_task_id) = ''
     OR pg_catalog.length(p_new_task_id) > 20
     OR p_new_title IS NULL
     OR pg_catalog.btrim(p_new_title) = ''
     OR pg_catalog.length(p_new_title) > 500
     OR p_target_board_id IS NULL
     OR pg_catalog.btrim(p_target_board_id) = ''
     OR p_target_column_id IS NULL
     OR pg_catalog.btrim(p_target_column_id) = ''
     OR p_created_by IS NULL
     OR pg_catalog.btrim(p_created_by) = ''
     OR p_actor_display_name IS NULL
     OR pg_catalog.btrim(p_actor_display_name) = ''
     OR p_activity_id IS NULL
     OR pg_catalog.btrim(p_activity_id) = ''
     OR pg_catalog.length(p_activity_id) > 20 THEN
    RETURN QUERY SELECT 'invalid_task_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF pg_catalog.jsonb_typeof(v_assignee_ids) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(v_checklist_ids) IS DISTINCT FROM 'array'
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(v_assignee_ids) AS item(value)
       WHERE pg_catalog.jsonb_typeof(item.value) IS DISTINCT FROM 'string'
          OR pg_catalog.btrim(item.value #>> '{}') = ''
          OR pg_catalog.length(item.value #>> '{}') > 20
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(v_checklist_ids) AS item(value)
       WHERE pg_catalog.jsonb_typeof(item.value) IS DISTINCT FROM 'string'
          OR pg_catalog.btrim(item.value #>> '{}') = ''
          OR pg_catalog.length(item.value #>> '{}') > 20
     )
     OR pg_catalog.jsonb_array_length(v_assignee_ids) IS DISTINCT FROM (
       SELECT pg_catalog.count(DISTINCT item.value #>> '{}')::integer
       FROM pg_catalog.jsonb_array_elements(v_assignee_ids) AS item(value)
     )
     OR pg_catalog.jsonb_array_length(v_checklist_ids) IS DISTINCT FROM (
       SELECT pg_catalog.count(DISTINCT item.value #>> '{}')::integer
       FROM pg_catalog.jsonb_array_elements(v_checklist_ids) AS item(value)
     ) THEN
    RETURN QUERY SELECT 'invalid_relation_ids'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pyra_task_assignees', 42042)
  );
  FOR v_lock_task_id IN
    SELECT DISTINCT task_id
    FROM (VALUES (p_source_task_id), (p_new_task_id)) AS task_ids(task_id)
    ORDER BY task_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_lock_task_id, 42042)
    );
  END LOOP;

  PERFORM b.id
  FROM public.pyra_boards AS b
  WHERE b.id IN (p_expected_source_board_id, p_target_board_id)
  ORDER BY b.id
  FOR UPDATE;

  PERFORM c.id
  FROM public.pyra_board_columns AS c
  WHERE c.board_id IN (p_expected_source_board_id, p_target_board_id)
  ORDER BY c.id
  FOR UPDATE;

  SELECT t.*
  INTO v_source
  FROM public.pyra_tasks AS t
  WHERE t.id = p_source_task_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'task_not_found'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF v_source.board_id IS DISTINCT FROM p_expected_source_board_id
     OR v_source.updated_at IS DISTINCT FROM p_expected_source_updated_at THEN
    RETURN QUERY SELECT 'task_write_conflict'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pyra_boards AS b WHERE b.id = p_target_board_id
  ) THEN
    RETURN QUERY SELECT 'invalid_board'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  SELECT c.*
  INTO v_target_column
  FROM public.pyra_board_columns AS c
  WHERE c.id = p_target_column_id
    AND c.board_id = p_target_board_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_destination'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF v_target_column.column_type IN ('review', 'delivery')
     OR COALESCE(v_target_column.requires_approval, false) THEN
    RETURN QUERY SELECT 'gated_destination'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF p_target_board_id = 'bd_production' THEN
    IF p_due_date IS NULL OR p_due_at IS NULL THEN
      RETURN QUERY SELECT 'production_deadline_required'::text, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;
  END IF;
  IF p_due_at IS NOT NULL
     AND (
       p_due_date IS NULL
       OR (p_due_at AT TIME ZONE 'Asia/Dubai')::date IS DISTINCT FROM p_due_date
     ) THEN
    RETURN QUERY SELECT 'production_deadline_invalid'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.pyra_tasks AS t WHERE t.id = p_new_task_id) THEN
    RETURN QUERY SELECT 'task_write_conflict'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM a.id
  FROM public.pyra_task_assignees AS a
  WHERE a.task_id = p_source_task_id
  ORDER BY a.id
  FOR UPDATE;
  PERFORM tl.task_id
  FROM public.pyra_task_labels AS tl
  WHERE tl.task_id = p_source_task_id
  ORDER BY tl.label_id
  FOR UPDATE;
  PERFORM c.id
  FROM public.pyra_task_checklist AS c
  WHERE c.task_id = p_source_task_id
  ORDER BY c.id
  FOR UPDATE;

  SELECT pg_catalog.count(*)::integer
  INTO v_assignee_count
  FROM public.pyra_task_assignees AS a
  WHERE a.task_id = p_source_task_id;
  SELECT pg_catalog.count(*)::integer
  INTO v_checklist_count
  FROM public.pyra_task_checklist AS c
  WHERE c.task_id = p_source_task_id;

  IF pg_catalog.jsonb_array_length(v_assignee_ids) IS DISTINCT FROM v_assignee_count
     OR pg_catalog.jsonb_array_length(v_checklist_ids) IS DISTINCT FROM v_checklist_count THEN
    RETURN QUERY SELECT 'source_relation_conflict'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF p_target_board_id = p_expected_source_board_id
     AND EXISTS (
       SELECT 1
       FROM public.pyra_task_labels AS tl
       JOIN public.pyra_board_labels AS bl ON bl.id = tl.label_id
       WHERE tl.task_id = p_source_task_id
         AND bl.board_id IS DISTINCT FROM p_target_board_id
     ) THEN
    RETURN QUERY SELECT 'source_relation_conflict'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM t.id
  FROM public.pyra_tasks AS t
  WHERE t.board_id = p_target_board_id
  ORDER BY t.id
  FOR UPDATE;

  SELECT
    COALESCE(MAX(t.position) FILTER (WHERE t.column_id = p_target_column_id), -1) + 1,
    COALESCE(MAX(t.task_number), 0) + 1
  INTO v_position, v_task_number
  FROM public.pyra_tasks AS t
  WHERE t.board_id = p_target_board_id;

  v_created_at := pg_catalog.clock_timestamp();
  INSERT INTO public.pyra_tasks (
    id,
    board_id,
    column_id,
    title,
    description,
    position,
    priority,
    due_date,
    due_at,
    start_date,
    estimated_hours,
    task_number,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    p_new_task_id,
    p_target_board_id,
    p_target_column_id,
    p_new_title,
    v_source.description,
    v_position,
    v_source.priority,
    p_due_date,
    p_due_at,
    v_source.start_date,
    v_source.estimated_hours,
    v_task_number,
    p_created_by,
    v_created_at,
    v_created_at
  )
  RETURNING * INTO v_task;

  WITH source_rows AS (
    SELECT
      a.username,
      pg_catalog.row_number() OVER (ORDER BY a.id) AS ordinal
    FROM public.pyra_task_assignees AS a
    WHERE a.task_id = p_source_task_id
  ), supplied_ids AS (
    SELECT ids.id, ids.ordinal
    FROM pg_catalog.jsonb_array_elements_text(v_assignee_ids)
      WITH ORDINALITY AS ids(id, ordinal)
  )
  INSERT INTO public.pyra_task_assignees (
    id,
    task_id,
    username,
    assigned_by,
    assigned_at
  )
  SELECT ids.id, p_new_task_id, source_rows.username, p_created_by, v_created_at
  FROM source_rows
  JOIN supplied_ids AS ids USING (ordinal);

  IF p_target_board_id = p_expected_source_board_id THEN
    INSERT INTO public.pyra_task_labels (task_id, label_id)
    SELECT p_new_task_id, tl.label_id
    FROM public.pyra_task_labels AS tl
    WHERE tl.task_id = p_source_task_id;
  END IF;

  WITH source_rows AS (
    SELECT
      c.title,
      c.position,
      pg_catalog.row_number() OVER (ORDER BY c.id) AS ordinal
    FROM public.pyra_task_checklist AS c
    WHERE c.task_id = p_source_task_id
  ), supplied_ids AS (
    SELECT ids.id, ids.ordinal
    FROM pg_catalog.jsonb_array_elements_text(v_checklist_ids)
      WITH ORDINALITY AS ids(id, ordinal)
  )
  INSERT INTO public.pyra_task_checklist (
    id,
    task_id,
    title,
    is_checked,
    position,
    created_at
  )
  SELECT ids.id, p_new_task_id, source_rows.title, false, source_rows.position, v_created_at
  FROM source_rows
  JOIN supplied_ids AS ids USING (ordinal);

  INSERT INTO public.pyra_task_activity (
    id,
    task_id,
    username,
    display_name,
    action,
    details,
    created_at
  ) VALUES (
    p_activity_id,
    p_new_task_id,
    p_created_by,
    p_actor_display_name,
    'created',
    pg_catalog.jsonb_build_object('duplicated_from', p_source_task_id),
    v_created_at
  );

  RETURN QUERY
  SELECT
    'ok'::text,
    pg_catalog.to_jsonb(v_task),
    pg_catalog.jsonb_build_object(
      'source_task_id', p_source_task_id,
      'position', v_position,
      'task_number', v_task_number,
      'assignee_count', v_assignee_count,
      'checklist_count', v_checklist_count,
      'labels_copied', p_target_board_id = p_expected_source_board_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pyra_add_task_assignees_atomic(
  p_task_id varchar,
  p_expected_board_id varchar,
  p_expected_updated_at timestamptz,
  p_assigned_by varchar,
  p_actor_display_name varchar,
  p_activity_id varchar,
  p_assignees jsonb
)
RETURNS TABLE(status text, task jsonb, mutation jsonb)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_task public.pyra_tasks%ROWTYPE;
  v_assignees jsonb := COALESCE(p_assignees, '[]'::jsonb);
  v_added jsonb;
  v_mutated_at timestamptz;
  v_existing_user_count integer;
BEGIN
  IF p_task_id IS NULL
     OR pg_catalog.btrim(p_task_id) = ''
     OR p_expected_board_id IS NULL
     OR pg_catalog.btrim(p_expected_board_id) = ''
     OR p_assigned_by IS NULL
     OR pg_catalog.btrim(p_assigned_by) = ''
     OR p_actor_display_name IS NULL
     OR pg_catalog.btrim(p_actor_display_name) = ''
     OR p_activity_id IS NULL
     OR pg_catalog.btrim(p_activity_id) = ''
     OR pg_catalog.length(p_activity_id) > 20
     OR pg_catalog.jsonb_typeof(v_assignees) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(v_assignees) = 0
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(v_assignees) AS item(value)
       WHERE pg_catalog.jsonb_typeof(item.value) IS DISTINCT FROM 'object'
          OR pg_catalog.jsonb_typeof(item.value -> 'id') IS DISTINCT FROM 'string'
          OR pg_catalog.jsonb_typeof(item.value -> 'username') IS DISTINCT FROM 'string'
          OR pg_catalog.btrim(item.value ->> 'id') = ''
          OR pg_catalog.length(item.value ->> 'id') > 20
          OR pg_catalog.btrim(item.value ->> 'username') = ''
          OR item.value ->> 'username' IS DISTINCT FROM pg_catalog.btrim(item.value ->> 'username')
     )
     OR pg_catalog.jsonb_array_length(v_assignees) IS DISTINCT FROM (
       SELECT pg_catalog.count(DISTINCT item.value ->> 'id')::integer
       FROM pg_catalog.jsonb_array_elements(v_assignees) AS item(value)
     )
     OR pg_catalog.jsonb_array_length(v_assignees) IS DISTINCT FROM (
       SELECT pg_catalog.count(DISTINCT item.value ->> 'username')::integer
       FROM pg_catalog.jsonb_array_elements(v_assignees) AS item(value)
     ) THEN
    RETURN QUERY SELECT 'invalid_assignees'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pyra_task_assignees', 42042)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_task_id, 42042)
  );

  SELECT t.*
  INTO v_task
  FROM public.pyra_tasks AS t
  WHERE t.id = p_task_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'task_not_found'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF v_task.board_id IS DISTINCT FROM p_expected_board_id
     OR v_task.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN QUERY SELECT 'task_write_conflict'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM a.id
  FROM public.pyra_task_assignees AS a
  WHERE a.task_id = p_task_id
  ORDER BY a.id
  FOR UPDATE;

  PERFORM u.username
  FROM public.pyra_users AS u
  WHERE u.username IN (
    SELECT item.value ->> 'username'
    FROM pg_catalog.jsonb_array_elements(v_assignees) AS item(value)
  )
  ORDER BY u.username
  FOR KEY SHARE;

  SELECT pg_catalog.count(*)::integer
  INTO v_existing_user_count
  FROM public.pyra_users AS u
  WHERE u.username IN (
    SELECT item.value ->> 'username'
    FROM pg_catalog.jsonb_array_elements(v_assignees) AS item(value)
  );
  IF v_existing_user_count IS DISTINCT FROM pg_catalog.jsonb_array_length(v_assignees) THEN
    RETURN QUERY SELECT 'invalid_assignees'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  WITH requested AS (
    SELECT item.value ->> 'id' AS id, item.value ->> 'username' AS username
    FROM pg_catalog.jsonb_array_elements(v_assignees) AS item(value)
  ), inserted AS (
    INSERT INTO public.pyra_task_assignees (
      id,
      task_id,
      username,
      assigned_by,
      assigned_at
    )
    SELECT
      requested.id,
      p_task_id,
      requested.username,
      p_assigned_by,
      pg_catalog.clock_timestamp()
    FROM requested
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.pyra_task_assignees AS existing
      WHERE existing.task_id = p_task_id
        AND existing.username = requested.username
    )
    RETURNING username
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(inserted.username ORDER BY inserted.username),
    '[]'::jsonb
  )
  INTO v_added
  FROM inserted;

  IF pg_catalog.jsonb_array_length(v_added) > 0 THEN
    v_mutated_at := CASE
      WHEN v_task.updated_at IS NULL THEN pg_catalog.clock_timestamp()
      ELSE GREATEST(pg_catalog.clock_timestamp(), v_task.updated_at + interval '1 microsecond')
    END;
    UPDATE public.pyra_tasks AS t
    SET updated_at = v_mutated_at
    WHERE t.id = p_task_id
    RETURNING t.* INTO v_task;

    INSERT INTO public.pyra_task_activity (
      id, task_id, username, display_name, action, details, created_at
    ) VALUES (
      p_activity_id,
      p_task_id,
      p_assigned_by,
      p_actor_display_name,
      'assignee_added',
      pg_catalog.jsonb_build_object('added', v_added),
      v_mutated_at
    );
  END IF;

  RETURN QUERY SELECT
    'ok'::text,
    pg_catalog.to_jsonb(v_task),
    pg_catalog.jsonb_build_object('added', v_added);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pyra_remove_task_assignee_atomic(
  p_task_id varchar,
  p_expected_board_id varchar,
  p_expected_updated_at timestamptz,
  p_username varchar,
  p_removed_by varchar,
  p_actor_display_name varchar,
  p_activity_id varchar
)
RETURNS TABLE(status text, task jsonb, mutation jsonb)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_task public.pyra_tasks%ROWTYPE;
  v_removed_count integer;
  v_mutated_at timestamptz;
BEGIN
  IF p_task_id IS NULL
     OR pg_catalog.btrim(p_task_id) = ''
     OR p_expected_board_id IS NULL
     OR pg_catalog.btrim(p_expected_board_id) = ''
     OR p_username IS NULL
     OR pg_catalog.btrim(p_username) = ''
     OR p_username IS DISTINCT FROM pg_catalog.btrim(p_username)
     OR p_removed_by IS NULL
     OR pg_catalog.btrim(p_removed_by) = ''
     OR p_actor_display_name IS NULL
     OR pg_catalog.btrim(p_actor_display_name) = ''
     OR p_activity_id IS NULL
     OR pg_catalog.btrim(p_activity_id) = ''
     OR pg_catalog.length(p_activity_id) > 20 THEN
    RETURN QUERY SELECT 'invalid_assignees'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pyra_task_assignees', 42042)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_task_id, 42042)
  );

  SELECT t.*
  INTO v_task
  FROM public.pyra_tasks AS t
  WHERE t.id = p_task_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'task_not_found'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF v_task.board_id IS DISTINCT FROM p_expected_board_id
     OR v_task.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN QUERY SELECT 'task_write_conflict'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM a.id
  FROM public.pyra_task_assignees AS a
  WHERE a.task_id = p_task_id
  ORDER BY a.id
  FOR UPDATE;

  DELETE FROM public.pyra_task_assignees AS a
  WHERE a.task_id = p_task_id
    AND a.username = p_username;
  GET DIAGNOSTICS v_removed_count = ROW_COUNT;

  IF v_removed_count > 0 THEN
    v_mutated_at := CASE
      WHEN v_task.updated_at IS NULL THEN pg_catalog.clock_timestamp()
      ELSE GREATEST(pg_catalog.clock_timestamp(), v_task.updated_at + interval '1 microsecond')
    END;
    UPDATE public.pyra_tasks AS t
    SET updated_at = v_mutated_at
    WHERE t.id = p_task_id
    RETURNING t.* INTO v_task;

    INSERT INTO public.pyra_task_activity (
      id, task_id, username, display_name, action, details, created_at
    ) VALUES (
      p_activity_id,
      p_task_id,
      p_removed_by,
      p_actor_display_name,
      'assignee_removed',
      pg_catalog.jsonb_build_object('removed', p_username),
      v_mutated_at
    );
  END IF;

  RETURN QUERY SELECT
    'ok'::text,
    pg_catalog.to_jsonb(v_task),
    pg_catalog.jsonb_build_object(
      'removed', CASE WHEN v_removed_count > 0 THEN p_username ELSE NULL END
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pyra_mutate_task_label_atomic(
  p_task_id varchar,
  p_expected_board_id varchar,
  p_expected_updated_at timestamptz,
  p_action varchar,
  p_label_id varchar,
  p_actor_username varchar,
  p_actor_display_name varchar,
  p_activity_id varchar
)
RETURNS TABLE(status text, task jsonb, mutation jsonb)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_task public.pyra_tasks%ROWTYPE;
  v_changed_count integer := 0;
  v_mutated_at timestamptz;
BEGIN
  IF p_task_id IS NULL
     OR pg_catalog.btrim(p_task_id) = ''
     OR pg_catalog.length(p_task_id) > 20
     OR p_expected_board_id IS NULL
     OR pg_catalog.btrim(p_expected_board_id) = ''
     OR pg_catalog.length(p_expected_board_id) > 20
     OR p_action IS NULL
     OR p_action NOT IN ('add', 'remove')
     OR p_label_id IS NULL
     OR pg_catalog.btrim(p_label_id) = ''
     OR pg_catalog.length(p_label_id) > 20
     OR p_actor_username IS NULL
     OR pg_catalog.btrim(p_actor_username) = ''
     OR p_actor_display_name IS NULL
     OR pg_catalog.btrim(p_actor_display_name) = ''
     OR p_activity_id IS NULL
     OR pg_catalog.btrim(p_activity_id) = ''
     OR pg_catalog.length(p_activity_id) > 20 THEN
    RETURN QUERY SELECT 'invalid_relation_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pyra_task_assignees', 42042)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_task_id, 42042)
  );

  SELECT t.*
  INTO v_task
  FROM public.pyra_tasks AS t
  WHERE t.id = p_task_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'task_not_found'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF v_task.board_id IS DISTINCT FROM p_expected_board_id
     OR v_task.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN QUERY SELECT 'task_write_conflict'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM bl.id
  FROM public.pyra_board_labels AS bl
  WHERE bl.id = p_label_id
    AND bl.board_id = p_expected_board_id
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_label'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM tl.label_id
  FROM public.pyra_task_labels AS tl
  WHERE tl.task_id = p_task_id
  ORDER BY tl.label_id
  FOR UPDATE;

  IF p_action = 'add' THEN
    INSERT INTO public.pyra_task_labels (task_id, label_id)
    VALUES (p_task_id, p_label_id)
    ON CONFLICT (task_id, label_id) DO NOTHING;
    GET DIAGNOSTICS v_changed_count = ROW_COUNT;
  ELSE
    DELETE FROM public.pyra_task_labels AS tl
    WHERE tl.task_id = p_task_id
      AND tl.label_id = p_label_id;
    GET DIAGNOSTICS v_changed_count = ROW_COUNT;
  END IF;

  IF v_changed_count > 0 THEN
    v_mutated_at := CASE
      WHEN v_task.updated_at IS NULL THEN pg_catalog.clock_timestamp()
      ELSE GREATEST(pg_catalog.clock_timestamp(), v_task.updated_at + interval '1 microsecond')
    END;

    UPDATE public.pyra_tasks AS t
    SET updated_at = v_mutated_at
    WHERE t.id = p_task_id
    RETURNING t.* INTO v_task;

    INSERT INTO public.pyra_task_activity (
      id, task_id, username, display_name, action, details, created_at
    ) VALUES (
      p_activity_id,
      p_task_id,
      p_actor_username,
      p_actor_display_name,
      CASE WHEN p_action = 'add' THEN 'label_added' ELSE 'label_removed' END,
      pg_catalog.jsonb_build_object('label_id', p_label_id),
      v_mutated_at
    );
  END IF;

  RETURN QUERY SELECT
    'ok'::text,
    pg_catalog.to_jsonb(v_task),
    pg_catalog.jsonb_build_object(
      'action', p_action,
      'label_id', p_label_id,
      'changed', v_changed_count > 0
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pyra_mutate_task_checklist_atomic(
  p_task_id varchar,
  p_expected_board_id varchar,
  p_expected_updated_at timestamptz,
  p_action varchar,
  p_item_id varchar,
  p_updates jsonb,
  p_actor_username varchar,
  p_actor_display_name varchar,
  p_activity_id varchar
)
RETURNS TABLE(status text, task jsonb, mutation jsonb)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_task public.pyra_tasks%ROWTYPE;
  v_item public.pyra_task_checklist%ROWTYPE;
  v_updates jsonb := COALESCE(p_updates, '{}'::jsonb);
  v_position integer;
  v_mutated_at timestamptz;
BEGIN
  IF p_task_id IS NULL
     OR pg_catalog.btrim(p_task_id) = ''
     OR pg_catalog.length(p_task_id) > 20
     OR p_expected_board_id IS NULL
     OR pg_catalog.btrim(p_expected_board_id) = ''
     OR pg_catalog.length(p_expected_board_id) > 20
     OR p_action IS NULL
     OR p_action NOT IN ('add', 'update', 'delete')
     OR p_item_id IS NULL
     OR pg_catalog.btrim(p_item_id) = ''
     OR pg_catalog.length(p_item_id) > 20
     OR p_actor_username IS NULL
     OR pg_catalog.btrim(p_actor_username) = ''
     OR p_actor_display_name IS NULL
     OR pg_catalog.btrim(p_actor_display_name) = ''
     OR p_activity_id IS NULL
     OR pg_catalog.btrim(p_activity_id) = ''
     OR pg_catalog.length(p_activity_id) > 20
     OR pg_catalog.jsonb_typeof(v_updates) IS DISTINCT FROM 'object' THEN
    RETURN QUERY SELECT 'invalid_relation_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_object_keys(v_updates) AS supplied(key)
    WHERE supplied.key NOT IN ('title', 'is_checked')
  ) THEN
    RETURN QUERY SELECT 'invalid_relation_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF p_action = 'add' AND (
       NOT (v_updates ? 'title')
       OR pg_catalog.jsonb_typeof(v_updates -> 'title') IS DISTINCT FROM 'string'
       OR pg_catalog.btrim(v_updates ->> 'title') = ''
       OR (
         v_updates ? 'is_checked'
         AND pg_catalog.jsonb_typeof(v_updates -> 'is_checked') IS DISTINCT FROM 'boolean'
       )
     ) THEN
    RETURN QUERY SELECT 'invalid_relation_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF p_action = 'update' AND (
       v_updates = '{}'::jsonb
       OR (
         v_updates ? 'title'
         AND (
           pg_catalog.jsonb_typeof(v_updates -> 'title') IS DISTINCT FROM 'string'
           OR pg_catalog.btrim(v_updates ->> 'title') = ''
         )
       )
       OR (
         v_updates ? 'is_checked'
         AND pg_catalog.jsonb_typeof(v_updates -> 'is_checked') IS DISTINCT FROM 'boolean'
       )
     ) THEN
    RETURN QUERY SELECT 'invalid_relation_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF p_action = 'delete' AND v_updates <> '{}'::jsonb THEN
    RETURN QUERY SELECT 'invalid_relation_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pyra_task_assignees', 42042)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_task_id, 42042)
  );

  SELECT t.*
  INTO v_task
  FROM public.pyra_tasks AS t
  WHERE t.id = p_task_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'task_not_found'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF v_task.board_id IS DISTINCT FROM p_expected_board_id
     OR v_task.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN QUERY SELECT 'task_write_conflict'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM c.id
  FROM public.pyra_task_checklist AS c
  WHERE c.task_id = p_task_id
  ORDER BY c.id
  FOR UPDATE;

  v_mutated_at := CASE
    WHEN v_task.updated_at IS NULL THEN pg_catalog.clock_timestamp()
    ELSE GREATEST(pg_catalog.clock_timestamp(), v_task.updated_at + interval '1 microsecond')
  END;

  IF p_action = 'add' THEN
    IF EXISTS (
      SELECT 1
      FROM public.pyra_task_checklist AS c
      WHERE c.id = p_item_id
    ) THEN
      RETURN QUERY SELECT 'task_write_conflict'::text, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;

    SELECT COALESCE(MAX(c.position), -1) + 1
    INTO v_position
    FROM public.pyra_task_checklist AS c
    WHERE c.task_id = p_task_id;

    INSERT INTO public.pyra_task_checklist (
      id, task_id, title, is_checked, position, created_at
    ) VALUES (
      p_item_id,
      p_task_id,
      pg_catalog.btrim(v_updates ->> 'title'),
      CASE
        WHEN v_updates ? 'is_checked' THEN (v_updates ->> 'is_checked')::boolean
        ELSE false
      END,
      v_position,
      v_mutated_at
    )
    RETURNING * INTO v_item;
  ELSE
    SELECT c.*
    INTO v_item
    FROM public.pyra_task_checklist AS c
    WHERE c.id = p_item_id
      AND c.task_id = p_task_id;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'relation_not_found'::text, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;

    IF p_action = 'update' THEN
      UPDATE public.pyra_task_checklist AS c
      SET title = CASE
            WHEN v_updates ? 'title' THEN pg_catalog.btrim(v_updates ->> 'title')
            ELSE c.title
          END,
          is_checked = CASE
            WHEN v_updates ? 'is_checked' THEN (v_updates ->> 'is_checked')::boolean
            ELSE c.is_checked
          END
      WHERE c.id = p_item_id
        AND c.task_id = p_task_id
      RETURNING c.* INTO v_item;
    ELSE
      DELETE FROM public.pyra_task_checklist AS c
      WHERE c.id = p_item_id
        AND c.task_id = p_task_id;
    END IF;
  END IF;

  UPDATE public.pyra_tasks AS t
  SET updated_at = v_mutated_at
  WHERE t.id = p_task_id
  RETURNING t.* INTO v_task;

  INSERT INTO public.pyra_task_activity (
    id, task_id, username, display_name, action, details, created_at
  ) VALUES (
    p_activity_id,
    p_task_id,
    p_actor_username,
    p_actor_display_name,
    CASE p_action
      WHEN 'add' THEN 'checklist_item_added'
      WHEN 'update' THEN 'checklist_item_updated'
      ELSE 'checklist_item_deleted'
    END,
    pg_catalog.jsonb_build_object(
      'item_id', p_item_id,
      'fields', CASE
        WHEN p_action = 'update' THEN v_updates
        ELSE NULL
      END
    ),
    v_mutated_at
  );

  RETURN QUERY SELECT
    'ok'::text,
    pg_catalog.to_jsonb(v_task),
    pg_catalog.jsonb_build_object(
      'action', p_action,
      'item', pg_catalog.to_jsonb(v_item),
      'changed', true
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pyra_advance_task_atomic(
  p_task_id varchar,
  p_board_id varchar,
  p_expected_column_id varchar,
  p_expected_target_column_id varchar,
  p_expected_target_column_type varchar,
  p_expected_updated_at timestamptz,
  p_moved_by varchar,
  p_history_id varchar,
  p_default_assignee_id varchar,
  p_attachment_id varchar,
  p_attachment_file_name varchar,
  p_attachment_file_url text,
  p_actor_display_name varchar,
  p_activity_id varchar
)
RETURNS TABLE(status text, task jsonb, transition jsonb)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_task public.pyra_tasks%ROWTYPE;
  v_source_column public.pyra_board_columns%ROWTYPE;
  v_target_column public.pyra_board_columns%ROWTYPE;
  v_source_rank integer;
  v_column_count integer;
  v_target_position integer;
  v_completion_percentage integer;
  v_moved_at timestamptz;
  v_previous_stage_entered_at timestamptz;
  v_attachment_required boolean;
  v_is_production_review boolean;
  v_assignees_snapshot jsonb;
BEGIN
  IF p_task_id IS NULL OR pg_catalog.btrim(p_task_id) = '' THEN
    RETURN QUERY SELECT 'invalid_transition_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pyra_task_assignees', 42042)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_task_id, 42042)
  );

  -- Lock stable parent rows first. Every transition RPC uses board -> column
  -- -> task ordering so opposing moves cannot deadlock each other.
  PERFORM b.id
  FROM public.pyra_boards AS b
  WHERE b.id = p_board_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_board'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM c.id
  FROM public.pyra_board_columns AS c
  WHERE c.board_id = p_board_id
  ORDER BY c.id
  FOR UPDATE;

  SELECT t.*
  INTO v_task
  FROM public.pyra_tasks AS t
  WHERE t.id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'task_not_found'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF v_task.board_id IS DISTINCT FROM p_board_id
     OR v_task.column_id IS DISTINCT FROM p_expected_column_id
     OR v_task.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN QUERY SELECT 'transition_conflict'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  SELECT c.*
  INTO v_source_column
  FROM public.pyra_board_columns AS c
  WHERE c.id = v_task.column_id
    AND c.board_id = p_board_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'current_column_not_found'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  SELECT ranked.rn
  INTO v_source_rank
  FROM (
    SELECT c.id,
           pg_catalog.row_number() OVER (
             ORDER BY c.position NULLS LAST, c.id
           )::integer AS rn
    FROM public.pyra_board_columns AS c
    WHERE c.board_id = p_board_id
  ) AS ranked
  WHERE ranked.id = v_source_column.id;

  SELECT pg_catalog.count(*)::integer
  INTO v_column_count
  FROM public.pyra_board_columns AS c
  WHERE c.board_id = p_board_id;

  SELECT c.*
  INTO v_target_column
  FROM public.pyra_board_columns AS c
  WHERE c.board_id = p_board_id
  ORDER BY c.position NULLS LAST, c.id
  OFFSET v_source_rank
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'already_last_stage'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF v_target_column.id IS DISTINCT FROM p_expected_target_column_id
     OR v_target_column.column_type IS DISTINCT FROM p_expected_target_column_type THEN
    RETURN QUERY SELECT 'transition_conflict'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF COALESCE(v_target_column.requires_approval, false) THEN
    RETURN QUERY SELECT 'next_stage_requires_approval'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF p_board_id = 'bd_production'
     AND v_target_column.column_type = 'review'
     AND (
       v_task.due_date IS NULL
       OR v_task.due_at IS NULL
       OR (v_task.due_at AT TIME ZONE 'Asia/Dubai')::date IS DISTINCT FROM v_task.due_date
     ) THEN
    RETURN QUERY SELECT 'production_deadline_required'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  v_attachment_required := v_target_column.column_type IN ('review', 'delivery');

  IF v_attachment_required AND (
    p_attachment_id IS NULL
    OR pg_catalog.btrim(p_attachment_id) = ''
    OR p_attachment_file_name IS NULL
    OR pg_catalog.btrim(p_attachment_file_name) = ''
    OR p_attachment_file_url IS NULL
    OR pg_catalog.btrim(p_attachment_file_url) = ''
  ) THEN
    RETURN QUERY SELECT 'attachment_required'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF v_attachment_required
     AND p_attachment_file_url !~* '^https://.+' THEN
    RETURN QUERY SELECT 'attachment_invalid'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF NOT v_attachment_required AND (
    p_attachment_id IS NOT NULL
    OR p_attachment_file_name IS NOT NULL
    OR p_attachment_file_url IS NOT NULL
  ) THEN
    RETURN QUERY SELECT 'attachment_unexpected'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF p_history_id IS NULL
     OR pg_catalog.btrim(p_history_id) = ''
     OR p_moved_by IS NULL
     OR pg_catalog.btrim(p_moved_by) = ''
     OR p_actor_display_name IS NULL
     OR pg_catalog.btrim(p_actor_display_name) = ''
     OR p_activity_id IS NULL
     OR pg_catalog.btrim(p_activity_id) = ''
     OR pg_catalog.length(p_activity_id) > 20 THEN
    RETURN QUERY SELECT 'invalid_transition_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF v_target_column.default_assignee IS NOT NULL
     AND (
       p_default_assignee_id IS NULL
       OR pg_catalog.btrim(p_default_assignee_id) = ''
     ) THEN
    RETURN QUERY SELECT 'invalid_transition_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  v_is_production_review := p_board_id = 'bd_production'
    AND v_target_column.column_type = 'review';

  -- The task advisory lock is the shared boundary for future assignee writers.
  -- Lock existing rows too, then snapshot before adding the review column's
  -- default assignee so attribution remains with the producers being reviewed.
  IF v_is_production_review OR v_target_column.default_assignee IS NOT NULL THEN
    PERFORM a.id
    FROM public.pyra_task_assignees AS a
    WHERE a.task_id = p_task_id
    ORDER BY a.id
    FOR UPDATE;
  END IF;

  IF v_is_production_review THEN
    SELECT COALESCE(
      pg_catalog.jsonb_agg(snapshot.username ORDER BY snapshot.username),
      '[]'::jsonb
    )
    INTO v_assignees_snapshot
    FROM (
      SELECT DISTINCT a.username
      FROM public.pyra_task_assignees AS a
      WHERE a.task_id = p_task_id
    ) AS snapshot;
  END IF;

  v_moved_at := CASE
    WHEN v_task.updated_at IS NULL THEN pg_catalog.clock_timestamp()
    ELSE GREATEST(
      pg_catalog.clock_timestamp(),
      v_task.updated_at + interval '1 microsecond'
    )
  END;
  v_previous_stage_entered_at := v_task.stage_entered_at;
  v_completion_percentage := pg_catalog.round(
    ((v_source_rank + 1)::numeric / v_column_count::numeric) * 100
  )::integer;

  -- Advance always appends to the next stage. Lock and normalize both task
  -- orders inside this transaction so the transition cannot leave duplicate
  -- or stale positions in either column.
  PERFORM t.id
  FROM public.pyra_tasks AS t
  WHERE t.column_id IN (p_expected_column_id, v_target_column.id)
  ORDER BY t.id
  FOR UPDATE;

  SELECT pg_catalog.count(*)::integer
  INTO v_target_position
  FROM public.pyra_tasks AS t
  WHERE t.column_id = v_target_column.id
    AND t.id <> p_task_id;

  WITH ordered AS (
    SELECT t.id,
           (pg_catalog.row_number() OVER (
             ORDER BY t.position NULLS LAST, t.id
           ) - 1)::integer AS desired_position
    FROM public.pyra_tasks AS t
    WHERE t.column_id = v_target_column.id
      AND t.id <> p_task_id
  )
  UPDATE public.pyra_tasks AS t
  SET position = o.desired_position,
      updated_at = CASE
        WHEN t.updated_at IS NULL THEN v_moved_at
        ELSE GREATEST(v_moved_at, t.updated_at + interval '1 microsecond')
      END
  FROM ordered AS o
  WHERE t.id = o.id
    AND t.position IS DISTINCT FROM o.desired_position;

  WITH ordered AS (
    SELECT t.id,
           (pg_catalog.row_number() OVER (
             ORDER BY t.position NULLS LAST, t.id
           ) - 1)::integer AS desired_position
    FROM public.pyra_tasks AS t
    WHERE t.column_id = p_expected_column_id
      AND t.id <> p_task_id
  )
  UPDATE public.pyra_tasks AS t
  SET position = o.desired_position,
      updated_at = CASE
        WHEN t.updated_at IS NULL THEN v_moved_at
        ELSE GREATEST(v_moved_at, t.updated_at + interval '1 microsecond')
      END
  FROM ordered AS o
  WHERE t.id = o.id
    AND t.position IS DISTINCT FROM o.desired_position;

  UPDATE public.pyra_tasks AS t
  SET column_id = v_target_column.id,
      position = v_target_position,
      stage_entered_at = v_moved_at,
      completion_percentage = v_completion_percentage,
      production_deadline_locked_at = CASE
        WHEN v_is_production_review THEN COALESCE(
          t.production_deadline_locked_at,
          v_moved_at
        )
        ELSE t.production_deadline_locked_at
      END,
      updated_at = v_moved_at
  WHERE t.id = p_task_id
  RETURNING t.* INTO v_task;

  IF v_attachment_required THEN
    INSERT INTO public.pyra_task_attachments (
      id,
      task_id,
      file_name,
      file_url,
      uploaded_by
    ) VALUES (
      p_attachment_id,
      p_task_id,
      pg_catalog.btrim(p_attachment_file_name),
      pg_catalog.btrim(p_attachment_file_url),
      p_moved_by
    );
  END IF;

  INSERT INTO public.pyra_task_stage_history (
    id,
    task_id,
    board_id,
    from_column_id,
    to_column_id,
    moved_by,
    created_at,
    time_in_stage,
    due_at_snapshot,
    task_created_at_snapshot,
    assignees_snapshot
  ) VALUES (
    p_history_id,
    p_task_id,
    p_board_id,
    p_expected_column_id,
    v_target_column.id,
    p_moved_by,
    v_moved_at,
    CASE
      WHEN v_previous_stage_entered_at IS NULL THEN NULL
      ELSE v_moved_at - v_previous_stage_entered_at
    END,
    CASE
      WHEN v_target_column.column_type = 'review' THEN v_task.due_at
      ELSE NULL
    END,
    CASE
      WHEN v_is_production_review THEN v_task.created_at
      ELSE NULL
    END,
    CASE
      WHEN v_is_production_review THEN v_assignees_snapshot
      ELSE NULL
    END
  );

  INSERT INTO public.pyra_task_activity (
    id,
    task_id,
    username,
    display_name,
    action,
    details,
    created_at
  ) VALUES (
    p_activity_id,
    p_task_id,
    p_moved_by,
    p_actor_display_name,
    'stage_advanced',
    pg_catalog.jsonb_build_object(
      'from', p_expected_column_id,
      'to', v_target_column.id,
      'stage_name', v_target_column.name
    ),
    v_moved_at
  );

  IF v_target_column.default_assignee IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.pyra_task_assignees AS a
       WHERE a.task_id = p_task_id
         AND a.username = v_target_column.default_assignee
     ) THEN
    INSERT INTO public.pyra_task_assignees (
      id,
      task_id,
      username,
      assigned_by,
      column_id,
      is_stage_assignee
    ) VALUES (
      p_default_assignee_id,
      p_task_id,
      v_target_column.default_assignee,
      'system',
      v_target_column.id,
      true
    ) ON CONFLICT (task_id, username) DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT
    'ok'::text,
    pg_catalog.to_jsonb(v_task),
    pg_catalog.jsonb_build_object(
      'from_column_id', p_expected_column_id,
      'to_column_id', v_target_column.id,
      'to_column_name', v_target_column.name,
      'to_column_type', v_target_column.column_type,
      'to_default_assignee', v_target_column.default_assignee,
      'position', v_target_position,
      'completion_percentage', v_completion_percentage,
      'moved_at', v_moved_at,
      'history_id', p_history_id,
      'attachment_id', CASE WHEN v_attachment_required THEN p_attachment_id ELSE NULL END,
      'assignees_snapshot', CASE WHEN v_is_production_review THEN v_assignees_snapshot ELSE NULL END
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pyra_move_task_atomic(
  p_task_id varchar,
  p_expected_board_id varchar,
  p_expected_column_id varchar,
  p_expected_updated_at timestamptz,
  p_target_board_id varchar,
  p_target_column_id varchar,
  p_target_position integer,
  p_moved_by varchar,
  p_history_id varchar,
  p_due_date date,
  p_due_at timestamptz,
  p_actor_display_name varchar,
  p_activity_id varchar
)
RETURNS TABLE(status text, task jsonb, transition jsonb)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_task public.pyra_tasks%ROWTYPE;
  v_source_column public.pyra_board_columns%ROWTYPE;
  v_target_column public.pyra_board_columns%ROWTYPE;
  v_target_board public.pyra_boards%ROWTYPE;
  v_is_cross_board boolean;
  v_is_cross_column boolean;
  v_is_pipeline_board boolean;
  v_destination_count integer;
  v_actual_position integer;
  v_target_rank integer;
  v_target_column_count integer;
  v_completion_percentage integer;
  v_moved_at timestamptz;
  v_effective_due_date date;
  v_effective_due_at timestamptz;
BEGIN
  IF p_task_id IS NULL OR pg_catalog.btrim(p_task_id) = '' THEN
    RETURN QUERY SELECT 'invalid_transition_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pyra_task_assignees', 42042)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_task_id, 42042)
  );

  IF p_target_position IS NULL OR p_target_position < 0 THEN
    RETURN QUERY SELECT 'invalid_position'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  -- Lock both boards and columns in stable identifier order. The expected
  -- source identifiers are inputs specifically so locks happen before task
  -- mutation while the later CAS still rejects stale route reads.
  PERFORM b.id
  FROM public.pyra_boards AS b
  WHERE b.id IN (p_expected_board_id, p_target_board_id)
  ORDER BY b.id
  FOR UPDATE;

  PERFORM c.id
  FROM public.pyra_board_columns AS c
  WHERE c.board_id IN (p_expected_board_id, p_target_board_id)
  ORDER BY c.id
  FOR UPDATE;

  SELECT t.*
  INTO v_task
  FROM public.pyra_tasks AS t
  WHERE t.id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'task_not_found'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF v_task.board_id IS DISTINCT FROM p_expected_board_id
     OR v_task.column_id IS DISTINCT FROM p_expected_column_id
     OR v_task.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN QUERY SELECT 'transition_conflict'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  SELECT c.*
  INTO v_source_column
  FROM public.pyra_board_columns AS c
  WHERE c.id = p_expected_column_id
    AND c.board_id = p_expected_board_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'current_column_not_found'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  SELECT c.*
  INTO v_target_column
  FROM public.pyra_board_columns AS c
  WHERE c.id = p_target_column_id
    AND c.board_id = p_target_board_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_destination'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  SELECT b.*
  INTO v_target_board
  FROM public.pyra_boards AS b
  WHERE b.id = p_target_board_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_destination'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  v_is_cross_board := p_expected_board_id IS DISTINCT FROM p_target_board_id;
  v_is_cross_column := p_expected_column_id IS DISTINCT FROM p_target_column_id;
  v_is_pipeline_board := COALESCE(v_target_board.is_pipeline, false);

  IF v_is_cross_column
     AND v_is_pipeline_board
     AND (
       v_target_column.column_type IN ('review', 'delivery')
       OR COALESCE(v_target_column.requires_approval, false)
     ) THEN
    RETURN QUERY SELECT 'gated_destination'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF v_is_cross_column
     AND (
       v_source_column.column_type IN ('review', 'approved')
       OR COALESCE(v_source_column.requires_approval, false)
     ) THEN
    RETURN QUERY SELECT 'gated_source'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF v_is_cross_board AND p_target_board_id = 'bd_production' THEN
    IF p_due_date IS NULL OR p_due_at IS NULL THEN
      RETURN QUERY SELECT 'production_deadline_required'::text, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;

    IF (p_due_at AT TIME ZONE 'Asia/Dubai')::date IS DISTINCT FROM p_due_date THEN
      RETURN QUERY SELECT 'production_deadline_invalid'::text, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;

    IF v_task.production_deadline_locked_at IS NOT NULL
       AND (
         v_task.due_date IS DISTINCT FROM p_due_date
         OR v_task.due_at IS DISTINCT FROM p_due_at
       ) THEN
      RETURN QUERY SELECT 'production_deadline_locked'::text, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;
  ELSIF p_due_date IS NOT NULL OR p_due_at IS NOT NULL THEN
    RETURN QUERY SELECT 'production_deadline_invalid'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  v_effective_due_date := CASE
    WHEN v_is_cross_board AND p_target_board_id = 'bd_production' THEN p_due_date
    ELSE v_task.due_date
  END;
  v_effective_due_at := CASE
    WHEN v_is_cross_board AND p_target_board_id = 'bd_production' THEN p_due_at
    ELSE v_task.due_at
  END;
  IF v_effective_due_at IS NOT NULL
     AND (
       v_effective_due_date IS NULL
       OR (v_effective_due_at AT TIME ZONE 'Asia/Dubai')::date
         IS DISTINCT FROM v_effective_due_date
     ) THEN
    RETURN QUERY SELECT 'production_deadline_invalid'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF p_moved_by IS NULL
     OR pg_catalog.btrim(p_moved_by) = ''
     OR p_history_id IS NULL
     OR pg_catalog.btrim(p_history_id) = ''
     OR p_actor_display_name IS NULL
     OR pg_catalog.btrim(p_actor_display_name) = ''
     OR p_activity_id IS NULL
     OR pg_catalog.btrim(p_activity_id) = '' THEN
    RETURN QUERY SELECT 'invalid_transition_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  -- Lock every affected task after the stable parent locks. This protects the
  -- order snapshot used by both destination insertion and source compaction.
  PERFORM t.id
  FROM public.pyra_tasks AS t
  WHERE t.column_id IN (p_expected_column_id, p_target_column_id)
  ORDER BY t.id
  FOR UPDATE;

  SELECT pg_catalog.count(*)::integer
  INTO v_destination_count
  FROM public.pyra_tasks AS t
  WHERE t.column_id = p_target_column_id
    AND t.id <> p_task_id;

  v_actual_position := LEAST(p_target_position, v_destination_count);
  v_moved_at := CASE
    WHEN v_task.updated_at IS NULL THEN pg_catalog.clock_timestamp()
    ELSE GREATEST(
      pg_catalog.clock_timestamp(),
      v_task.updated_at + interval '1 microsecond'
    )
  END;

  -- Normalize the destination order and reserve the requested slot.
  WITH ordered AS (
    SELECT t.id,
           (pg_catalog.row_number() OVER (
             ORDER BY t.position NULLS LAST, t.id
           ) - 1)::integer AS ordinal
    FROM public.pyra_tasks AS t
    WHERE t.column_id = p_target_column_id
      AND t.id <> p_task_id
  ), desired AS (
    SELECT o.id,
           CASE
             WHEN o.ordinal >= v_actual_position THEN o.ordinal + 1
             ELSE o.ordinal
           END AS desired_position
    FROM ordered AS o
  )
  UPDATE public.pyra_tasks AS t
  SET position = d.desired_position,
      updated_at = CASE
        WHEN t.updated_at IS NULL THEN v_moved_at
        ELSE GREATEST(v_moved_at, t.updated_at + interval '1 microsecond')
      END
  FROM desired AS d
  WHERE t.id = d.id
    AND t.position IS DISTINCT FROM d.desired_position;

  -- A real column transition removes the moved task from the source order.
  IF v_is_cross_column THEN
    WITH ordered AS (
      SELECT t.id,
             (pg_catalog.row_number() OVER (
               ORDER BY t.position NULLS LAST, t.id
             ) - 1)::integer AS desired_position
      FROM public.pyra_tasks AS t
      WHERE t.column_id = p_expected_column_id
        AND t.id <> p_task_id
    )
    UPDATE public.pyra_tasks AS t
    SET position = o.desired_position,
        updated_at = CASE
          WHEN t.updated_at IS NULL THEN v_moved_at
          ELSE GREATEST(v_moved_at, t.updated_at + interval '1 microsecond')
        END
    FROM ordered AS o
    WHERE t.id = o.id
      AND t.position IS DISTINCT FROM o.desired_position;
  END IF;

  v_completion_percentage := v_task.completion_percentage;
  IF v_is_cross_column AND v_is_pipeline_board THEN
    SELECT ranked.rn, ranked.total
    INTO v_target_rank, v_target_column_count
    FROM (
      SELECT c.id,
             pg_catalog.row_number() OVER (
               ORDER BY c.position NULLS LAST, c.id
             )::integer AS rn,
             pg_catalog.count(*) OVER ()::integer AS total
      FROM public.pyra_board_columns AS c
      WHERE c.board_id = p_target_board_id
    ) AS ranked
    WHERE ranked.id = p_target_column_id;

    v_completion_percentage := pg_catalog.round(
      (v_target_rank::numeric / v_target_column_count::numeric) * 100
    )::integer;
  END IF;

  UPDATE public.pyra_tasks AS t
  SET board_id = p_target_board_id,
      column_id = p_target_column_id,
      position = v_actual_position,
      due_date = v_effective_due_date,
      due_at = v_effective_due_at,
      stage_entered_at = CASE
        WHEN v_is_cross_column THEN v_moved_at
        ELSE v_task.stage_entered_at
      END,
      completion_percentage = v_completion_percentage,
      updated_at = v_moved_at
  WHERE t.id = p_task_id
  RETURNING t.* INTO v_task;

  IF v_is_cross_board THEN
    DELETE FROM public.pyra_task_labels AS tl
    WHERE tl.task_id = p_task_id;
  END IF;

  IF v_is_cross_column AND v_is_pipeline_board THEN
    INSERT INTO public.pyra_task_stage_history (
      id,
      task_id,
      board_id,
      from_column_id,
      to_column_id,
      moved_by,
      created_at
    ) VALUES (
      p_history_id,
      p_task_id,
      p_target_board_id,
      p_expected_column_id,
      p_target_column_id,
      p_moved_by,
      v_moved_at
    );
  END IF;

  INSERT INTO public.pyra_task_activity (
    id,
    task_id,
    username,
    display_name,
    action,
    details,
    created_at
  ) VALUES (
    p_activity_id,
    p_task_id,
    p_moved_by,
    p_actor_display_name,
    'moved',
    pg_catalog.jsonb_build_object(
      'column_id', p_target_column_id,
      'position', v_actual_position
    ),
    v_moved_at
  );

  RETURN QUERY
  SELECT
    'ok'::text,
    pg_catalog.to_jsonb(v_task),
    pg_catalog.jsonb_build_object(
      'from_column_id', p_expected_column_id,
      'to_column_id', p_target_column_id,
      'to_column_name', v_target_column.name,
      'to_column_type', v_target_column.column_type,
      'is_cross_column', v_is_cross_column,
      'is_cross_board', v_is_cross_board,
      'is_pipeline_board', v_is_pipeline_board,
      'position', v_actual_position,
      'completion_percentage', v_completion_percentage,
      'moved_at', v_moved_at,
      'history_id', CASE
        WHEN v_is_cross_column AND v_is_pipeline_board THEN p_history_id
        ELSE NULL
      END
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pyra_create_board_atomic(
  p_board_id varchar,
  p_name varchar,
  p_description text,
  p_project_id varchar,
  p_template text,
  p_view_mode varchar,
  p_is_pipeline boolean,
  p_auto_advance boolean,
  p_created_by varchar,
  p_columns jsonb,
  p_labels jsonb
)
RETURNS TABLE(status text, board jsonb, mutation jsonb)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_board public.pyra_boards%ROWTYPE;
  v_board_json jsonb;
  v_columns jsonb := p_columns;
  v_labels jsonb := p_labels;
BEGIN
  IF p_board_id IS NULL
     OR pg_catalog.btrim(p_board_id) = ''
     OR pg_catalog.length(p_board_id) > 20
     OR p_name IS NULL
     OR pg_catalog.btrim(p_name) = ''
     OR pg_catalog.length(p_name) > 255
     OR p_created_by IS NULL
     OR pg_catalog.btrim(p_created_by) = ''
     OR p_view_mode IS NULL
     OR pg_catalog.btrim(p_view_mode) = ''
     OR (p_project_id IS NOT NULL AND pg_catalog.btrim(p_project_id) = '') THEN
    RETURN QUERY SELECT 'invalid_board_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF pg_catalog.jsonb_typeof(v_columns) IS DISTINCT FROM 'array' THEN
    RETURN QUERY SELECT 'invalid_columns_payload'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_columns) AS column_item(value)
    WHERE pg_catalog.jsonb_typeof(column_item.value) IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(column_item.value -> 'id') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(column_item.value -> 'name') IS DISTINCT FROM 'string'
       OR pg_catalog.btrim(column_item.value ->> 'id') = ''
       OR pg_catalog.length(column_item.value ->> 'id') > 20
       OR pg_catalog.btrim(column_item.value ->> 'name') = ''
       OR pg_catalog.length(column_item.value ->> 'name') > 255
       OR (
         column_item.value ? 'color'
         AND (
           pg_catalog.jsonb_typeof(column_item.value -> 'color') IS DISTINCT FROM 'string'
           OR pg_catalog.btrim(column_item.value ->> 'color') = ''
           OR pg_catalog.length(column_item.value ->> 'color') > 20
         )
       )
       OR (
         column_item.value ? 'position'
         AND pg_catalog.jsonb_typeof(column_item.value -> 'position') IS DISTINCT FROM 'number'
       )
       OR CASE
         WHEN pg_catalog.jsonb_typeof(column_item.value -> 'position') = 'number'
           THEN (column_item.value ->> 'position')::numeric
             IS DISTINCT FROM pg_catalog.trunc((column_item.value ->> 'position')::numeric)
         ELSE false
       END
       OR (
         column_item.value ? 'is_done_column'
         AND pg_catalog.jsonb_typeof(column_item.value -> 'is_done_column') IS DISTINCT FROM 'boolean'
       )
  ) OR pg_catalog.jsonb_array_length(v_columns) IS DISTINCT FROM (
    SELECT pg_catalog.count(DISTINCT column_item.value ->> 'id')::integer
    FROM pg_catalog.jsonb_array_elements(v_columns) AS column_item(value)
  ) THEN
    RETURN QUERY SELECT 'invalid_columns_payload'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF pg_catalog.jsonb_typeof(v_labels) IS DISTINCT FROM 'array' THEN
    RETURN QUERY SELECT 'invalid_labels_payload'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_labels) AS label_item(value)
    WHERE pg_catalog.jsonb_typeof(label_item.value) IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(label_item.value -> 'id') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(label_item.value -> 'name') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(label_item.value -> 'color') IS DISTINCT FROM 'string'
       OR pg_catalog.btrim(label_item.value ->> 'id') = ''
       OR pg_catalog.length(label_item.value ->> 'id') > 20
       OR pg_catalog.btrim(label_item.value ->> 'name') = ''
       OR pg_catalog.length(label_item.value ->> 'name') > 100
       OR pg_catalog.btrim(label_item.value ->> 'color') = ''
       OR pg_catalog.length(label_item.value ->> 'color') > 20
  ) OR pg_catalog.jsonb_array_length(v_labels) IS DISTINCT FROM (
    SELECT pg_catalog.count(DISTINCT label_item.value ->> 'id')::integer
    FROM pg_catalog.jsonb_array_elements(v_labels) AS label_item(value)
  ) THEN
    RETURN QUERY SELECT 'invalid_labels_payload'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  -- This global lock deliberately precedes the project FK validation. A
  -- project DELETE also enters through the same lock before cascading.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pyra_task_assignees', 42042)
  );

  IF p_project_id IS NOT NULL THEN
    PERFORM p.id
    FROM public.pyra_projects AS p
    WHERE p.id = p_project_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'project_not_found'::text, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.pyra_boards (
      id,
      project_id,
      name,
      description,
      template,
      view_mode,
      is_pipeline,
      auto_advance,
      created_by
    ) VALUES (
      p_board_id,
      p_project_id,
      p_name,
      p_description,
      p_template,
      p_view_mode,
      COALESCE(p_is_pipeline, false),
      COALESCE(p_auto_advance, false),
      p_created_by
    )
    RETURNING * INTO v_board;

    INSERT INTO public.pyra_board_columns (
      id,
      board_id,
      name,
      color,
      position,
      is_done_column
    )
    SELECT
      column_row.id,
      p_board_id,
      column_row.name,
      COALESCE(column_row.color, 'gray'),
      COALESCE(column_row.position, 0),
      COALESCE(column_row.is_done_column, false)
    FROM pg_catalog.jsonb_to_recordset(v_columns) AS column_row(
      id varchar,
      name varchar,
      color varchar,
      position integer,
      is_done_column boolean
    );

    INSERT INTO public.pyra_board_labels (id, board_id, name, color)
    SELECT label_row.id, p_board_id, label_row.name, label_row.color
    FROM pg_catalog.jsonb_to_recordset(v_labels) AS label_row(
      id varchar,
      name varchar,
      color varchar
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN QUERY SELECT 'write_conflict'::text, NULL::jsonb, NULL::jsonb;
      RETURN;
  END;

  SELECT pg_catalog.to_jsonb(b) || pg_catalog.jsonb_build_object(
    'pyra_board_columns', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'color', c.color,
          'position', c.position,
          'wip_limit', c.wip_limit,
          'is_done_column', c.is_done_column,
          'requires_approval', c.requires_approval,
          'approval_role', c.approval_role,
          'default_assignee', c.default_assignee,
          'column_type', c.column_type
        ) ORDER BY c.position, c.id
      )
      FROM public.pyra_board_columns AS c
      WHERE c.board_id = p_board_id
    ), '[]'::jsonb)
  )
  INTO v_board_json
  FROM public.pyra_boards AS b
  WHERE b.id = p_board_id;

  RETURN QUERY
  SELECT
    'ok'::text,
    v_board_json,
    pg_catalog.jsonb_build_object(
      'columns_created', pg_catalog.jsonb_array_length(v_columns),
      'labels_created', pg_catalog.jsonb_array_length(v_labels)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pyra_create_board_column_atomic(
  p_column_id varchar,
  p_board_id varchar,
  p_name varchar,
  p_color varchar,
  p_position integer
)
RETURNS TABLE(status text, board_column jsonb, mutation jsonb)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_column public.pyra_board_columns%ROWTYPE;
BEGIN
  IF p_column_id IS NULL
     OR pg_catalog.btrim(p_column_id) = ''
     OR pg_catalog.length(p_column_id) > 20
     OR p_board_id IS NULL
     OR pg_catalog.btrim(p_board_id) = ''
     OR p_name IS NULL
     OR pg_catalog.btrim(p_name) = ''
     OR pg_catalog.length(p_name) > 255
     OR p_color IS NULL
     OR pg_catalog.btrim(p_color) = ''
     OR pg_catalog.length(p_color) > 20
     OR p_position IS NULL THEN
    RETURN QUERY SELECT 'invalid_column_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pyra_task_assignees', 42042)
  );

  PERFORM b.id
  FROM public.pyra_boards AS b
  WHERE b.id = p_board_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'board_not_found'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM c.id
  FROM public.pyra_board_columns AS c
  WHERE c.board_id = p_board_id
  ORDER BY c.id
  FOR UPDATE;

  BEGIN
    INSERT INTO public.pyra_board_columns (
      id, board_id, name, color, position
    ) VALUES (
      p_column_id, p_board_id, p_name, p_color, p_position
    )
    RETURNING * INTO v_column;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN QUERY SELECT 'write_conflict'::text, NULL::jsonb, NULL::jsonb;
      RETURN;
  END;

  RETURN QUERY
  SELECT
    'ok'::text,
    pg_catalog.to_jsonb(v_column),
    pg_catalog.jsonb_build_object('created', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pyra_update_board_columns_atomic(
  p_board_id varchar,
  p_columns jsonb
)
RETURNS TABLE(status text, mutation jsonb)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_columns jsonb := p_columns;
  v_payload_count integer;
  v_distinct_count integer;
  v_owned_count integer;
  v_updated_count integer;
BEGIN
  IF p_board_id IS NULL OR pg_catalog.btrim(p_board_id) = '' THEN
    RETURN QUERY SELECT 'invalid_board_input'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF pg_catalog.jsonb_typeof(v_columns) IS DISTINCT FROM 'array' THEN
    RETURN QUERY SELECT 'invalid_columns_payload'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_columns) AS patch(item)
    WHERE pg_catalog.jsonb_typeof(patch.item) IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(patch.item -> 'id') IS DISTINCT FROM 'string'
       OR pg_catalog.btrim(patch.item ->> 'id') = ''
       OR pg_catalog.length(patch.item ->> 'id') > 20
       OR (
         patch.item ? 'position'
         AND pg_catalog.jsonb_typeof(patch.item -> 'position') IS DISTINCT FROM 'number'
       )
       OR CASE
         WHEN pg_catalog.jsonb_typeof(patch.item -> 'position') = 'number'
           THEN (patch.item ->> 'position')::numeric
             IS DISTINCT FROM pg_catalog.trunc((patch.item ->> 'position')::numeric)
         ELSE false
       END
       OR (
         patch.item ? 'name'
         AND (
           pg_catalog.jsonb_typeof(patch.item -> 'name') IS DISTINCT FROM 'string'
           OR pg_catalog.btrim(patch.item ->> 'name') = ''
           OR pg_catalog.length(patch.item ->> 'name') > 255
         )
       )
       OR (
         patch.item ? 'color'
         AND (
           pg_catalog.jsonb_typeof(patch.item -> 'color') IS DISTINCT FROM 'string'
           OR pg_catalog.btrim(patch.item ->> 'color') = ''
           OR pg_catalog.length(patch.item ->> 'color') > 20
         )
       )
  ) THEN
    RETURN QUERY SELECT 'invalid_columns_payload'::text, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pyra_task_assignees', 42042)
  );

  PERFORM b.id
  FROM public.pyra_boards AS b
  WHERE b.id = p_board_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'board_not_found'::text, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM c.id
  FROM public.pyra_board_columns AS c
  WHERE c.board_id = p_board_id
  ORDER BY c.id
  FOR UPDATE;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(DISTINCT patch.item ->> 'id')::integer
  INTO v_payload_count, v_distinct_count
  FROM pg_catalog.jsonb_array_elements(v_columns) AS patch(item);
  IF v_payload_count IS DISTINCT FROM v_distinct_count THEN
    RETURN QUERY SELECT 'invalid_columns_payload'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_owned_count
  FROM public.pyra_board_columns AS c
  WHERE c.board_id = p_board_id
    AND c.id IN (
      SELECT patch.item ->> 'id'
      FROM pg_catalog.jsonb_array_elements(v_columns) AS patch(item)
    );
  IF v_owned_count IS DISTINCT FROM v_payload_count THEN
    RETURN QUERY SELECT 'column_not_in_board'::text, NULL::jsonb;
    RETURN;
  END IF;

  WITH patch AS (
    SELECT
      item ->> 'id' AS id,
      item ? 'position' AS has_position,
      CASE WHEN item ? 'position' THEN (item ->> 'position')::integer END AS position,
      item ? 'name' AS has_name,
      CASE WHEN item ? 'name' THEN item ->> 'name' END AS name,
      item ? 'color' AS has_color,
      CASE WHEN item ? 'color' THEN item ->> 'color' END AS color
    FROM pg_catalog.jsonb_array_elements(v_columns) AS input(item)
  ), updated AS (
    UPDATE public.pyra_board_columns AS c
    SET position = CASE WHEN patch.has_position THEN patch.position ELSE c.position END,
        name = CASE WHEN patch.has_name THEN patch.name ELSE c.name END,
        color = CASE WHEN patch.has_color THEN patch.color ELSE c.color END
    FROM patch
    WHERE c.id = patch.id
      AND c.board_id = p_board_id
    RETURNING c.id
  )
  SELECT pg_catalog.count(*)::integer
  INTO v_updated_count
  FROM updated;

  RETURN QUERY
  SELECT 'ok'::text, pg_catalog.jsonb_build_object('updated_count', v_updated_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pyra_delete_board_column_atomic(
  p_board_id varchar,
  p_column_id varchar
)
RETURNS TABLE(status text, mutation jsonb)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_task_count integer;
  v_history_count integer;
  v_from_history_count integer;
  v_to_history_count integer;
  v_mutation jsonb;
BEGIN
  IF p_board_id IS NULL
     OR pg_catalog.btrim(p_board_id) = ''
     OR p_column_id IS NULL
     OR pg_catalog.btrim(p_column_id) = '' THEN
    RETURN QUERY SELECT 'invalid_column_input'::text, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pyra_task_assignees', 42042)
  );

  PERFORM b.id
  FROM public.pyra_boards AS b
  WHERE b.id = p_board_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'board_not_found'::text, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM c.id
  FROM public.pyra_board_columns AS c
  WHERE c.board_id = p_board_id
  ORDER BY c.id
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pyra_board_columns AS c
    WHERE c.id = p_column_id
      AND c.board_id = p_board_id
  ) THEN
    RETURN QUERY SELECT 'column_not_in_board'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_task_count
  FROM public.pyra_tasks AS t
  WHERE t.column_id = p_column_id;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (WHERE h.from_column_id = p_column_id)::integer,
    pg_catalog.count(*) FILTER (WHERE h.to_column_id = p_column_id)::integer
  INTO v_history_count, v_from_history_count, v_to_history_count
  FROM public.pyra_task_stage_history AS h
  WHERE h.from_column_id = p_column_id
     OR h.to_column_id = p_column_id;

  v_mutation := pg_catalog.jsonb_build_object(
    'task_count', v_task_count,
    'history_count', v_history_count,
    'from_history_count', v_from_history_count,
    'to_history_count', v_to_history_count
  );

  IF v_task_count > 0 THEN
    RETURN QUERY SELECT 'column_has_tasks'::text, v_mutation;
    RETURN;
  END IF;
  IF v_history_count > 0 THEN
    RETURN QUERY SELECT 'column_has_history'::text, v_mutation;
    RETURN;
  END IF;

  DELETE FROM public.pyra_board_columns AS c
  WHERE c.id = p_column_id
    AND c.board_id = p_board_id;

  RETURN QUERY SELECT 'ok'::text, v_mutation;
END;
$function$;

-- Every protected parent/child statement enters through the same
-- global lock before PostgreSQL takes row locks or runs cascading deletes.
-- The row trigger below then owns only the sorted per-task locks.
CREATE OR REPLACE FUNCTION public.pyra_lock_task_write_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pyra_task_assignees', 42042)
  );
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.pyra_lock_task_write_entry()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_projects_task_write_entry
  ON public.pyra_projects;
CREATE TRIGGER trg_projects_task_write_entry
BEFORE DELETE ON public.pyra_projects
FOR EACH STATEMENT
EXECUTE FUNCTION public.pyra_lock_task_write_entry();

DROP TRIGGER IF EXISTS trg_boards_task_write_entry
  ON public.pyra_boards;
CREATE TRIGGER trg_boards_task_write_entry
BEFORE INSERT OR UPDATE OR DELETE ON public.pyra_boards
FOR EACH STATEMENT
EXECUTE FUNCTION public.pyra_lock_task_write_entry();

DROP TRIGGER IF EXISTS trg_tasks_task_write_entry
  ON public.pyra_tasks;
CREATE TRIGGER trg_tasks_task_write_entry
BEFORE INSERT OR UPDATE OR DELETE ON public.pyra_tasks
FOR EACH STATEMENT
EXECUTE FUNCTION public.pyra_lock_task_write_entry();

DROP TRIGGER IF EXISTS trg_task_assignees_write_entry
  ON public.pyra_task_assignees;
CREATE TRIGGER trg_task_assignees_write_entry
BEFORE INSERT OR UPDATE OR DELETE ON public.pyra_task_assignees
FOR EACH STATEMENT
EXECUTE FUNCTION public.pyra_lock_task_write_entry();

DROP TRIGGER IF EXISTS trg_board_columns_write_entry
  ON public.pyra_board_columns;
CREATE TRIGGER trg_board_columns_write_entry
BEFORE INSERT OR UPDATE OR DELETE ON public.pyra_board_columns
FOR EACH STATEMENT
EXECUTE FUNCTION public.pyra_lock_task_write_entry();

DROP TRIGGER IF EXISTS trg_task_stage_history_write_entry
  ON public.pyra_task_stage_history;
CREATE TRIGGER trg_task_stage_history_write_entry
BEFORE INSERT OR UPDATE OR DELETE ON public.pyra_task_stage_history
FOR EACH STATEMENT
EXECUTE FUNCTION public.pyra_lock_task_write_entry();

-- Serialize every assignee row mutation immediately when the additive
-- migration is installed. UPDATE locks OLD and NEW task ids in sorted order.
CREATE OR REPLACE FUNCTION public.pyra_lock_task_assignee_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_task_id varchar;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOR v_task_id IN
      SELECT DISTINCT task_id
      FROM (VALUES (OLD.task_id), (NEW.task_id)) AS task_ids(task_id)
      WHERE task_id IS NOT NULL
      ORDER BY task_id
    LOOP
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_task_id, 42042)
      );
    END LOOP;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_task_id := OLD.task_id;
  ELSE
    v_task_id := NEW.task_id;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_task_id, 42042)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.pyra_lock_task_assignee_write()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_task_assignees_atomic_lock
  ON public.pyra_task_assignees;

CREATE TRIGGER trg_task_assignees_atomic_lock
BEFORE INSERT OR UPDATE OR DELETE ON public.pyra_task_assignees
FOR EACH ROW
EXECUTE FUNCTION public.pyra_lock_task_assignee_write();

REVOKE ALL ON FUNCTION public.pyra_create_task_atomic(
  varchar, varchar, varchar, varchar, text, varchar, date, timestamptz, date,
  numeric, varchar, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pyra_create_task_atomic(
  varchar, varchar, varchar, varchar, text, varchar, date, timestamptz, date,
  numeric, varchar, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.pyra_duplicate_task_atomic(
  varchar, varchar, timestamptz, varchar, varchar, varchar, varchar, date,
  timestamptz, varchar, varchar, jsonb, jsonb, varchar
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pyra_duplicate_task_atomic(
  varchar, varchar, timestamptz, varchar, varchar, varchar, varchar, date,
  timestamptz, varchar, varchar, jsonb, jsonb, varchar
) TO service_role;

REVOKE ALL ON FUNCTION public.pyra_add_task_assignees_atomic(
  varchar, varchar, timestamptz, varchar, varchar, varchar, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pyra_add_task_assignees_atomic(
  varchar, varchar, timestamptz, varchar, varchar, varchar, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.pyra_remove_task_assignee_atomic(
  varchar, varchar, timestamptz, varchar, varchar, varchar, varchar
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pyra_remove_task_assignee_atomic(
  varchar, varchar, timestamptz, varchar, varchar, varchar, varchar
) TO service_role;

REVOKE ALL ON FUNCTION public.pyra_mutate_task_label_atomic(
  varchar, varchar, timestamptz, varchar, varchar, varchar, varchar, varchar
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pyra_mutate_task_label_atomic(
  varchar, varchar, timestamptz, varchar, varchar, varchar, varchar, varchar
) TO service_role;

REVOKE ALL ON FUNCTION public.pyra_mutate_task_checklist_atomic(
  varchar, varchar, timestamptz, varchar, varchar, jsonb, varchar, varchar,
  varchar
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pyra_mutate_task_checklist_atomic(
  varchar, varchar, timestamptz, varchar, varchar, jsonb, varchar, varchar,
  varchar
) TO service_role;

REVOKE ALL ON FUNCTION public.pyra_advance_task_atomic(
  varchar, varchar, varchar, varchar, varchar, timestamptz, varchar, varchar,
  varchar, varchar, varchar, text, varchar, varchar
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pyra_advance_task_atomic(
  varchar, varchar, varchar, varchar, varchar, timestamptz, varchar, varchar,
  varchar, varchar, varchar, text, varchar, varchar
) TO service_role;

REVOKE ALL ON FUNCTION public.pyra_move_task_atomic(
  varchar, varchar, varchar, timestamptz, varchar, varchar, integer, varchar,
  varchar, date, timestamptz, varchar, varchar
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pyra_move_task_atomic(
  varchar, varchar, varchar, timestamptz, varchar, varchar, integer, varchar,
  varchar, date, timestamptz, varchar, varchar
) TO service_role;

REVOKE ALL ON FUNCTION public.pyra_create_board_atomic(varchar, varchar, text, varchar, text, varchar, boolean, boolean, varchar, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pyra_create_board_atomic(varchar, varchar, text, varchar, text, varchar, boolean, boolean, varchar, jsonb, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.pyra_create_board_column_atomic(varchar, varchar, varchar, varchar, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pyra_create_board_column_atomic(varchar, varchar, varchar, varchar, integer) TO service_role;

REVOKE ALL ON FUNCTION public.pyra_update_board_columns_atomic(varchar, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pyra_update_board_columns_atomic(varchar, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.pyra_delete_board_column_atomic(varchar, varchar) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pyra_delete_board_column_atomic(varchar, varchar) TO service_role;

COMMIT;

-- -- DOWN (informational only; never auto-run -- use a new forward migration):
-- -- DROP FUNCTION IF EXISTS public.pyra_delete_board_column_atomic(varchar, varchar);
-- -- DROP FUNCTION IF EXISTS public.pyra_update_board_columns_atomic(varchar, jsonb);
-- -- DROP FUNCTION IF EXISTS public.pyra_create_board_column_atomic(varchar, varchar, varchar, varchar, integer);
-- -- DROP FUNCTION IF EXISTS public.pyra_create_board_atomic(varchar, varchar, text, varchar, text, varchar, boolean, boolean, varchar, jsonb, jsonb);
-- -- DROP FUNCTION IF EXISTS public.pyra_mutate_task_checklist_atomic(
-- --   varchar, varchar, timestamptz, varchar, varchar, jsonb, varchar,
-- --   varchar, varchar
-- -- );
-- -- DROP FUNCTION IF EXISTS public.pyra_mutate_task_label_atomic(
-- --   varchar, varchar, timestamptz, varchar, varchar, varchar, varchar,
-- --   varchar
-- -- );
-- -- DROP FUNCTION IF EXISTS public.pyra_remove_task_assignee_atomic(
-- --   varchar, varchar, timestamptz, varchar, varchar, varchar, varchar
-- -- );
-- -- DROP FUNCTION IF EXISTS public.pyra_add_task_assignees_atomic(
-- --   varchar, varchar, timestamptz, varchar, varchar, varchar, jsonb
-- -- );
-- -- DROP FUNCTION IF EXISTS public.pyra_duplicate_task_atomic(
-- --   varchar, varchar, timestamptz, varchar, varchar, varchar, varchar,
-- --   date, timestamptz, varchar, varchar, jsonb, jsonb, varchar
-- -- );
-- -- DROP FUNCTION IF EXISTS public.pyra_create_task_atomic(
-- --   varchar, varchar, varchar, varchar, text, varchar, date, timestamptz,
-- --   date, numeric, varchar, jsonb
-- -- );
-- -- DROP FUNCTION IF EXISTS public.pyra_move_task_atomic(
-- --   varchar, varchar, varchar, timestamptz, varchar, varchar, integer,
-- --   varchar, varchar, date, timestamptz, varchar, varchar
-- -- );
-- -- DROP FUNCTION IF EXISTS public.pyra_advance_task_atomic(
-- --   varchar, varchar, varchar, varchar, varchar, timestamptz, varchar,
-- --   varchar, varchar, varchar, varchar, text, varchar, varchar
-- -- );
-- -- DROP TRIGGER IF EXISTS trg_task_assignees_atomic_lock
-- --   ON public.pyra_task_assignees;
-- -- DROP FUNCTION IF EXISTS public.pyra_lock_task_assignee_write();
-- -- DROP TRIGGER IF EXISTS trg_task_assignees_write_entry
-- --   ON public.pyra_task_assignees;
-- -- DROP TRIGGER IF EXISTS trg_task_stage_history_write_entry
-- --   ON public.pyra_task_stage_history;
-- -- DROP TRIGGER IF EXISTS trg_board_columns_write_entry
-- --   ON public.pyra_board_columns;
-- -- DROP TRIGGER IF EXISTS trg_tasks_task_write_entry
-- --   ON public.pyra_tasks;
-- -- DROP TRIGGER IF EXISTS trg_boards_task_write_entry
-- --   ON public.pyra_boards;
-- -- DROP TRIGGER IF EXISTS trg_projects_task_write_entry
-- --   ON public.pyra_projects;
-- -- DROP FUNCTION IF EXISTS public.pyra_lock_task_write_entry();
-- -- DROP INDEX IF EXISTS public.idx_task_stage_history_to_column;
-- -- DROP INDEX IF EXISTS public.idx_task_stage_history_from_column;
