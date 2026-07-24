-- =============================================================
-- Migration 045: Production evidence clock hardening
-- =============================================================
-- Depends on migration 042 for atomic advance/move writers.
-- Also preserves the review writer introduced by 043 and the evidence guards
-- hardened by 044. This migration is additive and intentionally redefines the
-- three writers without changing their signatures.
--
-- Evidence timestamps must reflect the database wall clock. updated_at remains
-- a monotonic CAS/version value and may advance by one microsecond under rapid
-- writes; it must never be reused as business or audit evidence.
-- =============================================================

BEGIN;

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
  v_evidence_at timestamptz := pg_catalog.clock_timestamp();
  v_version_at timestamptz;
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

  v_version_at := CASE
    WHEN v_task.updated_at IS NULL THEN v_evidence_at
    ELSE GREATEST(
      v_evidence_at,
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
        WHEN t.updated_at IS NULL THEN v_version_at
        ELSE GREATEST(v_version_at, t.updated_at + interval '1 microsecond')
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
        WHEN t.updated_at IS NULL THEN v_version_at
        ELSE GREATEST(v_version_at, t.updated_at + interval '1 microsecond')
      END
  FROM ordered AS o
  WHERE t.id = o.id
    AND t.position IS DISTINCT FROM o.desired_position;

  UPDATE public.pyra_tasks AS t
  SET column_id = v_target_column.id,
      position = v_target_position,
      stage_entered_at = v_evidence_at,
      completion_percentage = v_completion_percentage,
      production_deadline_locked_at = CASE
        WHEN v_is_production_review THEN COALESCE(
          t.production_deadline_locked_at,
          v_evidence_at
        )
        ELSE t.production_deadline_locked_at
      END,
      updated_at = v_version_at
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
    v_evidence_at,
    CASE
      WHEN v_previous_stage_entered_at IS NULL THEN NULL
      ELSE v_evidence_at - v_previous_stage_entered_at
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
    v_evidence_at
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
      'moved_at', v_evidence_at,
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
  v_evidence_at timestamptz := pg_catalog.clock_timestamp();
  v_version_at timestamptz;
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
  v_version_at := CASE
    WHEN v_task.updated_at IS NULL THEN v_evidence_at
    ELSE GREATEST(
      v_evidence_at,
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
        WHEN t.updated_at IS NULL THEN v_version_at
        ELSE GREATEST(v_version_at, t.updated_at + interval '1 microsecond')
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
          WHEN t.updated_at IS NULL THEN v_version_at
          ELSE GREATEST(v_version_at, t.updated_at + interval '1 microsecond')
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
        WHEN v_is_cross_column THEN v_evidence_at
        ELSE v_task.stage_entered_at
      END,
      completion_percentage = v_completion_percentage,
      updated_at = v_version_at
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
      v_evidence_at
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
    v_evidence_at
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
      'moved_at', v_evidence_at,
      'history_id', CASE
        WHEN v_is_cross_column AND v_is_pipeline_board THEN p_history_id
        ELSE NULL
      END
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pyra_review_task_atomic(
  p_task_id varchar,
  p_board_id varchar,
  p_expected_column_id varchar,
  p_expected_updated_at timestamptz,
  p_actor_username varchar,
  p_actor_display_name varchar,
  p_action varchar,
  p_note text,
  p_rejection_kind varchar,
  p_history_id varchar,
  p_default_assignee_id varchar,
  p_comment_id varchar,
  p_activity_id varchar
)
RETURNS TABLE(status text, task jsonb, decision jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_board public.pyra_boards%ROWTYPE;
  v_task public.pyra_tasks%ROWTYPE;
  v_source_column public.pyra_board_columns%ROWTYPE;
  v_target_column public.pyra_board_columns%ROWTYPE;
  v_source_rank integer;
  v_target_rank integer;
  v_column_count integer;
  v_completion_percentage integer;
  v_evidence_at timestamptz := pg_catalog.clock_timestamp();
  v_version_at timestamptz;
  v_previous_stage_entered_at timestamptz;
BEGIN
  IF p_task_id IS NULL
     OR pg_catalog.btrim(p_task_id) = ''
     OR p_board_id IS NULL
     OR pg_catalog.btrim(p_board_id) = ''
     OR p_expected_column_id IS NULL
     OR pg_catalog.btrim(p_expected_column_id) = ''
     OR p_actor_username IS NULL
     OR pg_catalog.btrim(p_actor_username) = ''
     OR p_actor_display_name IS NULL
     OR pg_catalog.btrim(p_actor_display_name) = ''
     OR p_action NOT IN ('approve', 'reject')
     OR p_history_id IS NULL
     OR pg_catalog.btrim(p_history_id) = ''
     OR p_activity_id IS NULL
     OR pg_catalog.btrim(p_activity_id) = '' THEN
    RETURN QUERY SELECT 'invalid_review_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF p_action = 'reject' AND (
    p_note IS NULL
    OR pg_catalog.btrim(p_note) = ''
    OR p_rejection_kind IS NULL
    OR p_rejection_kind NOT IN ('revision', 'outright')
    OR p_comment_id IS NULL
    OR pg_catalog.btrim(p_comment_id) = ''
  ) THEN
    RETURN QUERY SELECT 'invalid_review_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF p_action = 'approve' AND (
    p_rejection_kind IS NOT NULL
    OR p_comment_id IS NOT NULL
  ) THEN
    RETURN QUERY SELECT 'invalid_review_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  -- Match every assignee-aware writer: shared global lock first, then task.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pyra_task_assignees', 42042)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_task_id, 42042)
  );

  -- Match the lock order of the advance/move RPCs: board, stable columns,
  -- task. This prevents review decisions racing a move or assignee snapshot.
  SELECT b.*
  INTO v_board
  FROM public.pyra_boards AS b
  WHERE b.id = p_board_id
  FOR UPDATE;

  IF NOT FOUND OR NOT COALESCE(v_board.is_pipeline, false) THEN
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

  -- Review decisions are keyed only on immutable column semantics. Display
  -- names (including the current Arabic names) never control this branch.
  IF v_source_column.column_type IS DISTINCT FROM 'review'
     OR COALESCE(v_source_column.is_done_column, false) THEN
    RETURN QUERY SELECT 'no_pending_review'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  SELECT ranked.rn, ranked.total
  INTO v_source_rank, v_column_count
  FROM (
    SELECT c.id,
           pg_catalog.row_number() OVER (
             ORDER BY c.position NULLS LAST, c.id
           )::integer AS rn,
           pg_catalog.count(*) OVER ()::integer AS total
    FROM public.pyra_board_columns AS c
    WHERE c.board_id = p_board_id
  ) AS ranked
  WHERE ranked.id = v_source_column.id;

  IF p_action = 'approve' THEN
    SELECT c.*
    INTO v_target_column
    FROM public.pyra_board_columns AS c
    WHERE c.board_id = p_board_id
    ORDER BY c.position NULLS LAST, c.id
    OFFSET v_source_rank
    LIMIT 1;

    IF NOT FOUND OR NOT COALESCE(v_target_column.requires_approval, false) THEN
      RETURN QUERY SELECT 'no_pending_review'::text, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;
  ELSE
    IF v_source_rank <= 1 THEN
      RETURN QUERY SELECT 'no_pending_review'::text, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;

    SELECT c.*
    INTO v_target_column
    FROM public.pyra_board_columns AS c
    WHERE c.board_id = p_board_id
    ORDER BY c.position NULLS LAST, c.id
    OFFSET (v_source_rank - 2)
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN QUERY SELECT 'no_pending_review'::text, NULL::jsonb, NULL::jsonb;
      RETURN;
    END IF;
  END IF;

  SELECT ranked.rn
  INTO v_target_rank
  FROM (
    SELECT c.id,
           pg_catalog.row_number() OVER (
             ORDER BY c.position NULLS LAST, c.id
           )::integer AS rn
    FROM public.pyra_board_columns AS c
    WHERE c.board_id = p_board_id
  ) AS ranked
  WHERE ranked.id = v_target_column.id;

  IF v_target_column.default_assignee IS NOT NULL
     AND (
       p_default_assignee_id IS NULL
       OR pg_catalog.btrim(p_default_assignee_id) = ''
     ) THEN
    RETURN QUERY SELECT 'invalid_review_input'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM a.id
  FROM public.pyra_task_assignees AS a
  WHERE a.task_id = p_task_id
  ORDER BY a.id
  FOR UPDATE;

  v_version_at := CASE
    WHEN v_task.updated_at IS NULL THEN v_evidence_at
    ELSE GREATEST(
      v_evidence_at,
      v_task.updated_at + interval '1 microsecond'
    )
  END;
  v_previous_stage_entered_at := v_task.stage_entered_at;
  v_completion_percentage := pg_catalog.round(
    (v_target_rank::numeric / v_column_count::numeric) * 100
  )::integer;

  UPDATE public.pyra_tasks AS t
  SET column_id = v_target_column.id,
      stage_entered_at = v_evidence_at,
      completion_percentage = v_completion_percentage,
      updated_at = v_version_at
  WHERE t.id = p_task_id
  RETURNING t.* INTO v_task;

  INSERT INTO public.pyra_task_stage_history (
    id,
    task_id,
    board_id,
    from_column_id,
    to_column_id,
    moved_by,
    approved_by,
    time_in_stage,
    created_at
  ) VALUES (
    p_history_id,
    p_task_id,
    p_board_id,
    p_expected_column_id,
    v_target_column.id,
    p_actor_username,
    CASE WHEN p_action = 'approve' THEN p_actor_username ELSE NULL END,
    CASE
      WHEN v_previous_stage_entered_at IS NULL THEN NULL
      ELSE v_evidence_at - v_previous_stage_entered_at
    END,
    v_evidence_at
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
      p_actor_username,
      v_target_column.id,
      true
    ) ON CONFLICT (task_id, username) DO NOTHING;
  END IF;

  IF p_action = 'reject' THEN
    INSERT INTO public.pyra_task_comments (
      id,
      task_id,
      author_username,
      author_name,
      content,
      created_at,
      updated_at
    ) VALUES (
      p_comment_id,
      p_task_id,
      p_actor_username,
      p_actor_display_name,
      pg_catalog.btrim(p_note),
      v_evidence_at,
      v_evidence_at
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
    p_actor_username,
    p_actor_display_name,
    CASE WHEN p_action = 'approve' THEN 'stage_approved' ELSE 'stage_rejected' END,
    pg_catalog.jsonb_build_object(
      'note', COALESCE(pg_catalog.btrim(p_note), ''),
      'sent_back_to', CASE WHEN p_action = 'reject' THEN v_target_column.name ELSE NULL END,
      'rejection_kind', CASE WHEN p_action = 'reject' THEN p_rejection_kind ELSE NULL END
    ),
    v_evidence_at
  );

  -- Migration 043 makes review evidence function-only and validates the exact
  -- linked history/activity/comment rows. Keep the decision last so the
  -- validator sees a complete, atomic evidence set.
  INSERT INTO public.pyra_task_review_decisions (
    history_id,
    task_id,
    board_id,
    action,
    rejection_kind,
    note,
    decided_by,
    decided_at,
    activity_id,
    comment_id
  ) VALUES (
    p_history_id,
    p_task_id,
    p_board_id,
    p_action,
    CASE WHEN p_action = 'reject' THEN p_rejection_kind ELSE NULL END,
    NULLIF(pg_catalog.btrim(p_note), ''),
    p_actor_username,
    v_evidence_at,
    p_activity_id,
    CASE WHEN p_action = 'reject' THEN p_comment_id ELSE NULL END
  );

  RETURN QUERY
  SELECT
    'ok'::text,
    pg_catalog.to_jsonb(v_task),
    pg_catalog.jsonb_build_object(
      'action', p_action,
      'from_column_id', p_expected_column_id,
      'to_column_id', v_target_column.id,
      'to_column_name', v_target_column.name,
      'to_column_type', v_target_column.column_type,
      'to_is_done_column', v_target_column.is_done_column,
      'to_default_assignee', v_target_column.default_assignee,
      'completion_percentage', v_completion_percentage,
      'decided_at', v_evidence_at,
      'history_id', p_history_id,
      'comment_id', CASE WHEN p_action = 'reject' THEN p_comment_id ELSE NULL END,
      'activity_id', p_activity_id,
      'rejection_kind', CASE WHEN p_action = 'reject' THEN p_rejection_kind ELSE NULL END
    );
END;
$function$;

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

REVOKE ALL ON FUNCTION public.pyra_review_task_atomic(
  varchar, varchar, varchar, timestamptz, varchar, varchar, varchar, text,
  varchar, varchar, varchar, varchar, varchar
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pyra_review_task_atomic(
  varchar, varchar, varchar, timestamptz, varchar, varchar, varchar, text,
  varchar, varchar, varchar, varchar, varchar
) TO service_role;

COMMIT;

-- -- DOWN (manual, intentionally non-executable):
-- -- Reapply the writer definitions from migrations 042 and 043 only if a
-- -- coordinated rollback explicitly accepts their coupled evidence/version
-- -- timestamp behavior.
