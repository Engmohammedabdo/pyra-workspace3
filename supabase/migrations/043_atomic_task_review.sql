-- =============================================================
-- Migration 043: Atomic task review decisions
-- =============================================================
-- Additive. The application does not call this function until the matching
-- route is deployed. Review mutation state is committed by one PostgreSQL
-- statement; unexpected failures roll the entire decision back.
-- =============================================================

BEGIN;

-- Native review-decision evidence is append-only. Every decision must keep its
-- exact history/activity/comment evidence, and reviewed production work can be
-- archived but never hard-deleted.
CREATE TABLE IF NOT EXISTS public.pyra_task_review_decisions (
  history_id varchar PRIMARY KEY,
  task_id varchar NOT NULL,
  board_id varchar NOT NULL,
  action varchar NOT NULL,
  rejection_kind varchar,
  note text,
  decided_by varchar NOT NULL,
  decided_at timestamptz NOT NULL,
  activity_id varchar NOT NULL UNIQUE,
  comment_id varchar,
  CONSTRAINT ck_task_review_decision_shape CHECK (
    (
      action = 'approve'
      AND rejection_kind IS NULL
      AND comment_id IS NULL
    )
    OR (
      action = 'reject'
      AND rejection_kind IN ('revision', 'outright')
      AND comment_id IS NOT NULL
      AND note IS NOT NULL
      AND pg_catalog.btrim(note) <> ''
    )
  )
);

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_task_review_decisions'::pg_catalog.regclass
      AND conname = 'fk_task_review_decision_history'
  ) THEN
    ALTER TABLE public.pyra_task_review_decisions
      ADD CONSTRAINT fk_task_review_decision_history
      FOREIGN KEY (history_id)
      REFERENCES public.pyra_task_stage_history(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_task_review_decisions'::pg_catalog.regclass
      AND conname = 'fk_task_review_decision_activity'
  ) THEN
    ALTER TABLE public.pyra_task_review_decisions
      ADD CONSTRAINT fk_task_review_decision_activity
      FOREIGN KEY (activity_id)
      REFERENCES public.pyra_task_activity(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pyra_task_review_decisions'::pg_catalog.regclass
      AND conname = 'fk_task_review_decision_comment'
  ) THEN
    ALTER TABLE public.pyra_task_review_decisions
      ADD CONSTRAINT fk_task_review_decision_comment
      FOREIGN KEY (comment_id)
      REFERENCES public.pyra_task_comments(id);
  END IF;
END;
$do$;

CREATE INDEX IF NOT EXISTS idx_task_review_decisions_board_decided
  ON public.pyra_task_review_decisions (board_id, decided_at, history_id);
CREATE INDEX IF NOT EXISTS idx_task_review_decisions_task
  ON public.pyra_task_review_decisions (task_id, decided_at, history_id);

ALTER TABLE public.pyra_task_review_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pyra_task_review_decisions
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.pyra_task_review_decisions TO service_role;

-- Legacy writers may omit rejection_kind. When a structured key is present,
-- however, the database accepts only the two centralized policy values. NOT
-- VALID avoids rewriting or reclassifying historical evidence.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.pyra_task_activity'::pg_catalog.regclass
      AND con.conname = 'ck_task_activity_rejection_kind'
  ) THEN
    ALTER TABLE public.pyra_task_activity
      ADD CONSTRAINT ck_task_activity_rejection_kind
      CHECK (
        action <> 'stage_rejected'
        OR details IS NULL
        OR pg_catalog.jsonb_typeof(details) <> 'object'
        OR NOT (details ? 'rejection_kind')
        OR COALESCE(
          (details ->> 'rejection_kind') IN ('revision', 'outright'),
          false
        )
      ) NOT VALID;
  END IF;
END;
$do$;

-- A direct row cannot become quality evidence merely by knowing the table
-- shape. It must match the immutable history row and the exact activity and
-- comment written by the atomic review function.
CREATE OR REPLACE FUNCTION public.pyra_validate_task_review_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.pyra_task_stage_history AS h
    JOIN public.pyra_board_columns AS source_column
      ON source_column.id = h.from_column_id
     AND source_column.board_id = h.board_id
     AND source_column.column_type = 'review'
    WHERE h.id = NEW.history_id
      AND h.task_id = NEW.task_id
      AND h.board_id = NEW.board_id
      AND h.moved_by = NEW.decided_by
      AND h.created_at IS NOT DISTINCT FROM NEW.decided_at
      AND (
        (
          NEW.action = 'approve'
          AND h.approved_by = NEW.decided_by
        )
        OR (
          NEW.action = 'reject'
          AND h.approved_by IS NULL
        )
      )
  ) THEN
    RAISE EXCEPTION 'PYRA_REVIEW_DECISION_LINKAGE_INVALID: history';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pyra_task_activity AS activity
    JOIN public.pyra_task_stage_history AS h ON h.id = NEW.history_id
    JOIN public.pyra_board_columns AS target_column
      ON target_column.id = h.to_column_id
     AND target_column.board_id = h.board_id
    WHERE activity.id = NEW.activity_id
      AND activity.task_id = NEW.task_id
      AND activity.username = NEW.decided_by
      AND activity.created_at IS NOT DISTINCT FROM NEW.decided_at
      AND pg_catalog.jsonb_typeof(activity.details) = 'object'
      AND activity.details ->> 'note' IS NOT DISTINCT FROM COALESCE(NEW.note, '')
      AND (
        (
          NEW.action = 'approve'
          AND activity.action = 'stage_approved'
          AND activity.details ->> 'rejection_kind' IS NULL
          AND activity.details ->> 'sent_back_to' IS NULL
        )
        OR (
          NEW.action = 'reject'
          AND activity.action = 'stage_rejected'
          AND activity.details ->> 'rejection_kind' = NEW.rejection_kind
          AND activity.details ->> 'sent_back_to' = target_column.name
        )
      )
  ) THEN
    RAISE EXCEPTION 'PYRA_REVIEW_DECISION_LINKAGE_INVALID: activity';
  END IF;

  IF NEW.action = 'reject' AND NOT EXISTS (
    SELECT 1
    FROM public.pyra_task_comments AS comment
    WHERE comment.id = NEW.comment_id
      AND comment.task_id = NEW.task_id
      AND comment.author_username = NEW.decided_by
      AND comment.content = NEW.note
      AND comment.created_at IS NOT DISTINCT FROM NEW.decided_at
      AND comment.updated_at IS NOT DISTINCT FROM NEW.decided_at
  ) THEN
    RAISE EXCEPTION 'PYRA_REVIEW_DECISION_LINKAGE_INVALID: comment';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.pyra_validate_task_review_decision()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_validate_task_review_decision
  ON public.pyra_task_review_decisions;
CREATE TRIGGER trg_validate_task_review_decision
BEFORE INSERT OR UPDATE ON public.pyra_task_review_decisions
FOR EACH ROW
EXECUTE FUNCTION public.pyra_validate_task_review_decision();

-- Review evidence is salary-impacting evidence. Archive remains available,
-- but direct task deletion and board/project cascade deletion are rejected.
CREATE OR REPLACE FUNCTION public.pyra_guard_reviewed_production_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_has_reviewed_production_task boolean := false;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pyra_task_assignees', 42042)
  );

  IF TG_TABLE_NAME = 'pyra_tasks' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(OLD.id, 42042)
    );
    SELECT EXISTS (
      SELECT 1
      FROM public.pyra_task_stage_history AS h
      LEFT JOIN public.pyra_board_columns AS review_column
        ON review_column.id = h.to_column_id
       AND review_column.board_id = h.board_id
      WHERE h.task_id = OLD.id
        AND h.board_id = 'bd_production'
        AND (
          h.to_column_id = 'col_prod_review'
          OR review_column.column_type = 'review'
        )
    ) INTO v_has_reviewed_production_task;
  ELSIF TG_TABLE_NAME = 'pyra_boards' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.pyra_task_stage_history AS h
      LEFT JOIN public.pyra_board_columns AS review_column
        ON review_column.id = h.to_column_id
       AND review_column.board_id = h.board_id
      LEFT JOIN public.pyra_tasks AS current_task ON current_task.id = h.task_id
      WHERE h.board_id = 'bd_production'
        AND (
          h.to_column_id = 'col_prod_review'
          OR review_column.column_type = 'review'
        )
        AND (
          h.board_id = OLD.id
          OR current_task.board_id = OLD.id
        )
    ) INTO v_has_reviewed_production_task;
  ELSIF TG_TABLE_NAME = 'pyra_projects' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.pyra_task_stage_history AS h
      LEFT JOIN public.pyra_board_columns AS review_column
        ON review_column.id = h.to_column_id
       AND review_column.board_id = h.board_id
      LEFT JOIN public.pyra_tasks AS current_task ON current_task.id = h.task_id
      LEFT JOIN public.pyra_boards AS current_board ON current_board.id = current_task.board_id
      LEFT JOIN public.pyra_boards AS evidence_board ON evidence_board.id = h.board_id
      WHERE h.board_id = 'bd_production'
        AND (
          h.to_column_id = 'col_prod_review'
          OR review_column.column_type = 'review'
        )
        AND (
          current_board.project_id = OLD.id
          OR evidence_board.project_id = OLD.id
        )
    ) INTO v_has_reviewed_production_task;
  END IF;

  IF v_has_reviewed_production_task THEN
    RAISE EXCEPTION 'PYRA_PRODUCTION_REVIEW_DELETE_BLOCKED'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.pyra_guard_reviewed_production_delete()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_tasks_reviewed_production_delete_guard
  ON public.pyra_tasks;
CREATE TRIGGER trg_tasks_reviewed_production_delete_guard
BEFORE DELETE ON public.pyra_tasks
FOR EACH ROW
EXECUTE FUNCTION public.pyra_guard_reviewed_production_delete();

DROP TRIGGER IF EXISTS trg_boards_reviewed_production_delete_guard
  ON public.pyra_boards;
CREATE TRIGGER trg_boards_reviewed_production_delete_guard
BEFORE DELETE ON public.pyra_boards
FOR EACH ROW
EXECUTE FUNCTION public.pyra_guard_reviewed_production_delete();

DROP TRIGGER IF EXISTS trg_projects_reviewed_production_delete_guard
  ON public.pyra_projects;
CREATE TRIGGER trg_projects_reviewed_production_delete_guard
BEFORE DELETE ON public.pyra_projects
FOR EACH ROW
EXECUTE FUNCTION public.pyra_guard_reviewed_production_delete();

-- The existing project endpoint used four independent DELETE statements. One
-- definer RPC keeps those deletes atomic, so a late review guard cannot leave
-- file or comment data partially removed.
CREATE OR REPLACE FUNCTION public.pyra_delete_project_atomic(p_project_id varchar)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_project_id varchar;
BEGIN
  IF p_project_id IS NULL OR pg_catalog.btrim(p_project_id) = '' THEN
    RETURN 'project_not_found';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pyra_task_assignees', 42042)
  );

  SELECT project.id
  INTO v_project_id
  FROM public.pyra_projects AS project
  WHERE project.id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'project_not_found';
  END IF;

  DELETE FROM public.pyra_file_approvals AS approval
  WHERE approval.file_id IN (
    SELECT file.id
    FROM public.pyra_project_files AS file
    WHERE file.project_id = p_project_id
  );

  DELETE FROM public.pyra_client_comments AS comment
  WHERE comment.project_id = p_project_id;

  DELETE FROM public.pyra_project_files AS file
  WHERE file.project_id = p_project_id;

  DELETE FROM public.pyra_projects AS project
  WHERE project.id = p_project_id;

  RETURN 'ok';
END;
$function$;

REVOKE ALL ON FUNCTION public.pyra_delete_project_atomic(varchar)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pyra_delete_project_atomic(varchar)
  TO service_role;

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
  v_decided_at timestamptz;
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

  v_decided_at := CASE
    WHEN v_task.updated_at IS NULL THEN pg_catalog.clock_timestamp()
    ELSE GREATEST(
      pg_catalog.clock_timestamp(),
      v_task.updated_at + interval '1 microsecond'
    )
  END;
  v_previous_stage_entered_at := v_task.stage_entered_at;
  v_completion_percentage := pg_catalog.round(
    (v_target_rank::numeric / v_column_count::numeric) * 100
  )::integer;

  UPDATE public.pyra_tasks AS t
  SET column_id = v_target_column.id,
      stage_entered_at = v_decided_at,
      completion_percentage = v_completion_percentage,
      updated_at = v_decided_at
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
      ELSE v_decided_at - v_previous_stage_entered_at
    END,
    v_decided_at
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
      v_decided_at,
      v_decided_at
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
    v_decided_at
  );

  -- Insert the decision last: its validation trigger can now verify every
  -- linked evidence row, and any failure rolls this entire RPC back.
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
    v_decided_at,
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
      'decided_at', v_decided_at,
      'history_id', p_history_id,
      'comment_id', CASE WHEN p_action = 'reject' THEN p_comment_id ELSE NULL END,
      'activity_id', p_activity_id,
      'rejection_kind', CASE WHEN p_action = 'reject' THEN p_rejection_kind ELSE NULL END
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.pyra_review_task_atomic(
  varchar, varchar, varchar, timestamptz, varchar, varchar, varchar, text,
  varchar, varchar, varchar, varchar, varchar
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pyra_review_task_atomic(
  varchar, varchar, varchar, timestamptz, varchar, varchar, varchar, text,
  varchar, varchar, varchar, varchar, varchar
) TO service_role;

COMMIT;

-- -- DOWN (informational only; never auto-run -- use a new forward migration):
-- -- ALTER TABLE public.pyra_task_activity
-- --   DROP CONSTRAINT IF EXISTS ck_task_activity_rejection_kind;
-- -- DROP TRIGGER IF EXISTS trg_projects_reviewed_production_delete_guard ON public.pyra_projects;
-- -- DROP TRIGGER IF EXISTS trg_boards_reviewed_production_delete_guard ON public.pyra_boards;
-- -- DROP TRIGGER IF EXISTS trg_tasks_reviewed_production_delete_guard ON public.pyra_tasks;
-- -- DROP FUNCTION IF EXISTS public.pyra_guard_reviewed_production_delete();
-- -- DROP TRIGGER IF EXISTS trg_validate_task_review_decision ON public.pyra_task_review_decisions;
-- -- DROP FUNCTION IF EXISTS public.pyra_validate_task_review_decision();
-- -- DROP FUNCTION IF EXISTS public.pyra_delete_project_atomic(varchar);
-- -- DROP TABLE IF EXISTS public.pyra_task_review_decisions;
-- -- DROP FUNCTION IF EXISTS public.pyra_review_task_atomic(
-- --   varchar, varchar, varchar, timestamptz, varchar, varchar, varchar, text,
-- --   varchar, varchar, varchar, varchar, varchar
-- -- );
