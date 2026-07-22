-- =============================================================
-- Migration 044: Harden production evidence
-- =============================================================
-- POST-DEPLOY ONLY: apply after the exact date + time API writer is live and
-- verified. Reconciles any dated production task created between migration
-- 041 and that deploy, backfills the persistent review lock, then installs
-- the deadline and assignee-write guards.
--
-- The single verified historical task without a deadline remains unscored.
-- No deadline is fabricated for it or for any other task without a date.
-- Forward-only (Phase 14.2).
-- =============================================================

BEGIN;

-- Match every protected writer's lock order before taking table locks. This
-- prevents deploy hardening from holding a table lock while waiting for the
-- global writer lock held by an in-flight RPC.
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('pyra_task_assignees', 42042)
);

-- Fail fast instead of waiting in a lock-order cycle: a direct writer acquires
-- its relation lock before the statement advisory-lock trigger, while every
-- verified atomic RPC acquires the advisory lock first. Apply during a quiet
-- deploy window and retry if any protected writer is already in flight.
LOCK TABLE public.pyra_tasks,
  public.pyra_task_stage_history,
  public.pyra_board_columns,
  public.pyra_task_assignees,
  public.pyra_boards,
  public.pyra_projects
IN SHARE ROW EXCLUSIVE MODE NOWAIT;

-- Remove the prior guard when this idempotent migration is re-run so the
-- evidence reset below can execute inside the same transaction.
DROP TRIGGER IF EXISTS trg_tasks_production_deadline_immutable
  ON public.pyra_tasks;
DROP TRIGGER IF EXISTS trg_tasks_production_deadline_insert_guard
  ON public.pyra_tasks;
DROP TRIGGER IF EXISTS trg_tasks_production_deadline_lock_evidence
  ON public.pyra_tasks;
DROP TRIGGER IF EXISTS trg_production_review_deadline_guard
  ON public.pyra_task_stage_history;

-- The reset below intentionally violates the installed CHECK for a few
-- statements. Drop and recreate it on every run so the migration is actually
-- idempotent, including when a prior 044 run completed successfully.
ALTER TABLE public.pyra_tasks
  DROP CONSTRAINT IF EXISTS ck_tasks_production_exact_deadline;

-- Discard every pre-hardening flag value: authenticated DML is still open
-- between migrations 042 and 044, so none of those values is trusted.
UPDATE public.pyra_tasks
SET production_deadline_exempt = false
WHERE production_deadline_exempt;

-- Migration 041 had no source time to preserve: every legacy date-only
-- production task received the deterministic Dubai 23:59:59.999 compatibility
-- value. The task may since have moved to another board, so mark that exact
-- sentinel across every board. No current writer can generate its .999 value.
UPDATE public.pyra_tasks
SET production_deadline_exempt = true
WHERE due_date IS NOT NULL
  AND due_at = (
    (due_date::timestamp + interval '1 day' - interval '1 millisecond')
    AT TIME ZONE 'Asia/Dubai'
  );

-- This is the one live row independently documented before the exact-time
-- writer existed. Preserve that provenance if the task has since moved boards;
-- any additional null production deadline must stop the migration below.
UPDATE public.pyra_tasks
SET production_deadline_exempt = true
WHERE id = 'tk_IOhdJMui9uW0bblj'
  AND due_date IS NULL
  AND due_at IS NULL;

-- Never infer a historical snapshot from the task's current deadline. Migration
-- 041 already captured its legacy sentinel, and migration 042 captures every
-- new exact review atomically. Any unexplained gap is rejected below.

-- Migration 042 writes the lock atomically for every new production review.
-- Legacy review rows receive only the earliest documented history timestamp.
-- Assignee attribution is deliberately not backfilled: no historical roster
-- is reconstructed or guessed.
WITH first_review AS (
  SELECT h.task_id,
         pg_catalog.min(h.created_at) AS locked_at
  FROM public.pyra_task_stage_history AS h
  JOIN public.pyra_board_columns AS c ON c.id = h.to_column_id
  WHERE h.board_id = 'bd_production'
    AND c.board_id = 'bd_production'
    AND c.column_type = 'review'
    AND h.created_at IS NOT NULL
  GROUP BY h.task_id
)
UPDATE public.pyra_tasks AS t
SET production_deadline_locked_at = first_review.locked_at
FROM first_review
WHERE t.id = first_review.task_id
  AND t.production_deadline_locked_at IS NULL;

DO $do$
DECLARE
  v_invalid_task_ids text;
  v_invalid_exemption_ids text;
  v_invalid_history_ids text;
  v_invalid_snapshot_ids text;
  v_unlocked_review_task_ids text;
BEGIN
  SELECT pg_catalog.string_agg(t.id, ', ' ORDER BY t.id)
  INTO v_invalid_task_ids
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

  IF v_invalid_task_ids IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration 044 stopped: production tasks lack an exact matching deadline: %',
      v_invalid_task_ids;
  END IF;

  SELECT pg_catalog.string_agg(t.id, ', ' ORDER BY t.id)
  INTO v_invalid_exemption_ids
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

  IF v_invalid_exemption_ids IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration 044 stopped: unverified exemption provenance for tasks: %',
      v_invalid_exemption_ids;
  END IF;

  SELECT pg_catalog.string_agg(h.id, ', ' ORDER BY h.id)
  INTO v_invalid_history_ids
  FROM public.pyra_task_stage_history AS h
  LEFT JOIN public.pyra_board_columns AS c ON c.id = h.to_column_id
  WHERE (
      h.board_id = 'bd_production'
      AND c.board_id IS DISTINCT FROM 'bd_production'
    ) OR (
      c.board_id = 'bd_production'
      AND h.board_id IS DISTINCT FROM 'bd_production'
    );

  IF v_invalid_history_ids IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration 044 stopped: production history board/column mismatch: %',
      v_invalid_history_ids;
  END IF;

  SELECT pg_catalog.string_agg(h.id, ', ' ORDER BY h.id)
  INTO v_invalid_snapshot_ids
  FROM public.pyra_task_stage_history AS h
  JOIN public.pyra_tasks AS t ON t.id = h.task_id
  JOIN public.pyra_board_columns AS c ON c.id = h.to_column_id
  WHERE h.board_id = 'bd_production'
    AND c.board_id = 'bd_production'
    AND c.column_type = 'review'
    AND NOT t.production_deadline_exempt
    AND h.due_at_snapshot IS DISTINCT FROM t.due_at;

  IF v_invalid_snapshot_ids IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration 044 stopped: review deadline snapshots disagree with tasks: %',
      v_invalid_snapshot_ids;
  END IF;

  SELECT pg_catalog.string_agg(reviewed.task_id, ', ' ORDER BY reviewed.task_id)
  INTO v_unlocked_review_task_ids
  FROM (
    SELECT DISTINCT h.task_id
    FROM public.pyra_task_stage_history AS h
    JOIN public.pyra_tasks AS t ON t.id = h.task_id
    JOIN public.pyra_board_columns AS c ON c.id = h.to_column_id
    WHERE h.board_id = 'bd_production'
      AND c.board_id = 'bd_production'
      AND c.column_type = 'review'
      AND t.production_deadline_locked_at IS NULL
  ) AS reviewed;

  IF v_unlocked_review_task_ids IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration 044 stopped: reviewed production tasks lack a persistent deadline lock: %',
      v_unlocked_review_task_ids;
  END IF;
END;
$do$;

-- The first production review permanently locks the deadline even if the task
-- is later moved to another board. API-level optimistic concurrency protects
-- the deploy window; this trigger is the durable post-deploy database guard.
CREATE OR REPLACE FUNCTION public.pyra_guard_production_deadline_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.production_deadline_exempt THEN
      RAISE EXCEPTION 'New tasks cannot create a legacy production deadline exemption'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.production_deadline_locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'New tasks cannot start with a production deadline lock'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.board_id = 'bd_production'
       AND (
         NEW.due_date IS NULL
         OR NEW.due_at IS NULL
         OR (NEW.due_at AT TIME ZONE 'Asia/Dubai')::date IS DISTINCT FROM NEW.due_date
         OR NEW.due_at = (
           (NEW.due_date::timestamp + interval '1 day' - interval '1 millisecond')
           AT TIME ZONE 'Asia/Dubai'
         )
       ) THEN
      RAISE EXCEPTION 'New production tasks require a genuine exact deadline'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  -- A legacy task can retain its provenance flag while it lives outside the
  -- production board. The move API requires a fresh UAE date + time before it
  -- may re-enter production; normalize that one documented transition here so
  -- the exact deadline and its provenance commit in the same transaction.
  IF OLD.production_deadline_exempt
     AND OLD.production_deadline_locked_at IS NULL
     AND OLD.board_id IS DISTINCT FROM NEW.board_id
     AND NEW.board_id = 'bd_production'
     AND NEW.due_date IS NOT NULL
     AND NEW.due_at IS NOT NULL
     AND (NEW.due_at AT TIME ZONE 'Asia/Dubai')::date = NEW.due_date
     AND NEW.due_at <> (
       (NEW.due_date::timestamp + interval '1 day' - interval '1 millisecond')
       AT TIME ZONE 'Asia/Dubai'
     ) THEN
    NEW.production_deadline_exempt := false;
  END IF;

  IF OLD.board_id IS DISTINCT FROM NEW.board_id
     AND NEW.board_id = 'bd_production'
     AND (
       NEW.production_deadline_exempt
       OR NEW.due_date IS NULL
       OR NEW.due_at IS NULL
       OR (NEW.due_at AT TIME ZONE 'Asia/Dubai')::date IS DISTINCT FROM NEW.due_date
       OR NEW.due_at = (
         (NEW.due_date::timestamp + interval '1 day' - interval '1 millisecond')
         AT TIME ZONE 'Asia/Dubai'
       )
     ) THEN
    RAISE EXCEPTION 'Legacy deadline exemptions require a genuine exact deadline before production entry'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.production_deadline_exempt IS DISTINCT FROM NEW.production_deadline_exempt THEN
    IF OLD.production_deadline_locked_at IS NOT NULL
       OR NOT OLD.production_deadline_exempt
       OR NEW.production_deadline_exempt
       OR NEW.due_date IS NULL
       OR NEW.due_at IS NULL
       OR (NEW.due_at AT TIME ZONE 'Asia/Dubai')::date <> NEW.due_date
       OR NEW.due_at = (
         (NEW.due_date::timestamp + interval '1 day' - interval '1 millisecond')
         AT TIME ZONE 'Asia/Dubai'
       ) THEN
      RAISE EXCEPTION 'Production deadline exemption can only be cleared by a genuine exact deadline before first review'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD.production_deadline_locked_at IS NOT NULL
     AND NEW.production_deadline_locked_at IS DISTINCT FROM OLD.production_deadline_locked_at THEN
    RAISE EXCEPTION 'Production deadline lock is immutable after the first review submission'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.production_deadline_locked_at IS NULL
     AND NEW.production_deadline_locked_at IS NOT NULL
     AND (
       NEW.board_id IS DISTINCT FROM 'bd_production'
       OR NEW.production_deadline_exempt
       OR NEW.due_date IS NULL
       OR NEW.due_at IS NULL
       OR (NEW.due_at AT TIME ZONE 'Asia/Dubai')::date IS DISTINCT FROM NEW.due_date
       OR NEW.due_at = (
         (NEW.due_date::timestamp + interval '1 day' - interval '1 millisecond')
         AT TIME ZONE 'Asia/Dubai'
       )
     ) THEN
    RAISE EXCEPTION 'Production deadline lock requires a genuine exact deadline'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.production_deadline_locked_at IS NOT NULL
     AND (
       OLD.due_date IS DISTINCT FROM NEW.due_date
       OR OLD.due_at IS DISTINCT FROM NEW.due_at
     ) THEN
    RAISE EXCEPTION 'Production deadline is locked after the first review submission'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.pyra_guard_production_deadline_immutable()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_tasks_production_deadline_immutable
  ON public.pyra_tasks;
DROP TRIGGER IF EXISTS trg_tasks_production_deadline_insert_guard
  ON public.pyra_tasks;

CREATE TRIGGER trg_tasks_production_deadline_insert_guard
BEFORE INSERT ON public.pyra_tasks
FOR EACH ROW
EXECUTE FUNCTION public.pyra_guard_production_deadline_immutable();

CREATE TRIGGER trg_tasks_production_deadline_immutable
BEFORE UPDATE OF board_id, due_date, due_at, production_deadline_locked_at, production_deadline_exempt ON public.pyra_tasks
FOR EACH ROW
WHEN (
  OLD.board_id IS DISTINCT FROM NEW.board_id
  OR OLD.due_date IS DISTINCT FROM NEW.due_date
  OR OLD.due_at IS DISTINCT FROM NEW.due_at
  OR OLD.production_deadline_locked_at IS DISTINCT FROM NEW.production_deadline_locked_at
  OR OLD.production_deadline_exempt IS DISTINCT FROM NEW.production_deadline_exempt
)
EXECUTE FUNCTION public.pyra_guard_production_deadline_immutable();

-- A first-review lock is only valid when the same transaction leaves behind
-- the earliest production review history row. Deferred validation permits the
-- atomic RPC's required order: lock the task first, then insert the evidence.
CREATE OR REPLACE FUNCTION public.pyra_validate_production_deadline_lock_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_first_review_at timestamptz;
BEGIN
  IF NEW.production_deadline_locked_at IS NULL
     OR OLD.production_deadline_locked_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pyra_tasks AS t
    WHERE t.id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT pg_catalog.min(h.created_at)
  INTO v_first_review_at
  FROM public.pyra_task_stage_history AS h
  JOIN public.pyra_board_columns AS c ON c.id = h.to_column_id
  WHERE h.task_id = NEW.id
    AND h.board_id = 'bd_production'
    AND c.board_id = 'bd_production'
    AND c.column_type = 'review';

  IF v_first_review_at IS DISTINCT FROM NEW.production_deadline_locked_at THEN
    RAISE EXCEPTION 'Production deadline lock requires matching first-review evidence'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.pyra_validate_production_deadline_lock_evidence()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_tasks_production_deadline_lock_evidence
  ON public.pyra_tasks;

CREATE CONSTRAINT TRIGGER trg_tasks_production_deadline_lock_evidence
AFTER UPDATE OF production_deadline_locked_at ON public.pyra_tasks
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (
  OLD.production_deadline_locked_at IS NULL
  AND NEW.production_deadline_locked_at IS NOT NULL
)
EXECUTE FUNCTION public.pyra_validate_production_deadline_lock_evidence();

-- The route validates the same rule for a localized user-facing error. This
-- database trigger is the authoritative boundary: even a future service-role
-- writer cannot lock or snapshot a migration sentinel as a real deadline.
CREATE OR REPLACE FUNCTION public.pyra_guard_production_review_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_task public.pyra_tasks%ROWTYPE;
  v_old_target_column_board_id varchar;
  v_old_target_column_type text;
  v_target_column_board_id varchar;
  v_target_column_type text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT c.board_id, c.column_type
    INTO v_old_target_column_board_id, v_old_target_column_type
    FROM public.pyra_board_columns AS c
    WHERE c.id = OLD.to_column_id;

    IF v_old_target_column_board_id = 'bd_production'
       AND v_old_target_column_type = 'review'
       AND (
         OLD.task_id IS DISTINCT FROM NEW.task_id
         OR OLD.board_id IS DISTINCT FROM NEW.board_id
         OR OLD.from_column_id IS DISTINCT FROM NEW.from_column_id
         OR OLD.to_column_id IS DISTINCT FROM NEW.to_column_id
         OR OLD.moved_by IS DISTINCT FROM NEW.moved_by
         OR OLD.created_at IS DISTINCT FROM NEW.created_at
         OR OLD.due_at_snapshot IS DISTINCT FROM NEW.due_at_snapshot
         OR OLD.task_created_at_snapshot IS DISTINCT FROM NEW.task_created_at_snapshot
         OR OLD.assignees_snapshot IS DISTINCT FROM NEW.assignees_snapshot
       ) THEN
      RAISE EXCEPTION 'Production review deadline evidence is immutable'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT c.board_id, c.column_type
  INTO v_target_column_board_id, v_target_column_type
  FROM public.pyra_board_columns AS c
  WHERE c.id = NEW.to_column_id;

  -- pyra_task_stage_history has no FK from to_column_id to board_id. Do not
  -- trust the caller's board_id: either side naming production must agree with
  -- the actual target column before this history row can be accepted.
  IF (
       NEW.board_id = 'bd_production'
       AND v_target_column_board_id IS DISTINCT FROM 'bd_production'
     ) OR (
       v_target_column_board_id = 'bd_production'
       AND NEW.board_id IS DISTINCT FROM 'bd_production'
     ) THEN
    RAISE EXCEPTION 'Production review history board must match its target column'
      USING ERRCODE = '23514';
  END IF;

  IF v_target_column_board_id IS DISTINCT FROM 'bd_production'
     OR v_target_column_type IS DISTINCT FROM 'review' THEN
    RETURN NEW;
  END IF;

  SELECT t.*
  INTO v_task
  FROM public.pyra_tasks AS t
  WHERE t.id = NEW.task_id;

  IF NOT FOUND
     OR v_task.board_id IS DISTINCT FROM 'bd_production'
     OR v_task.production_deadline_exempt
     OR v_task.due_date IS NULL
     OR v_task.due_at IS NULL
     OR (v_task.due_at AT TIME ZONE 'Asia/Dubai')::date IS DISTINCT FROM v_task.due_date
     OR v_task.due_at = (
       (v_task.due_date::timestamp + interval '1 day' - interval '1 millisecond')
       AT TIME ZONE 'Asia/Dubai'
     )
     OR NEW.due_at_snapshot IS DISTINCT FROM v_task.due_at THEN
    RAISE EXCEPTION 'Production review requires a verified exact deadline snapshot'
      USING ERRCODE = '23514';
  END IF;

  IF v_task.production_deadline_locked_at IS NULL THEN
    RAISE EXCEPTION 'Production review requires the persistent deadline lock'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.pyra_guard_production_review_deadline()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_production_review_deadline_guard
BEFORE INSERT OR UPDATE ON public.pyra_task_stage_history
FOR EACH ROW
EXECUTE FUNCTION public.pyra_guard_production_review_deadline();

-- Preserve migration 042's lock entry boundary for every protected writer.
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

-- The row trigger owns only sorted per-task locks. UPDATE locks OLD and NEW
-- task ids in order so cross-task reassignment cannot deadlock.
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

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS c
    WHERE c.conrelid = 'public.pyra_tasks'::pg_catalog.regclass
      AND c.conname = 'ck_tasks_production_exact_deadline'
  ) THEN
    ALTER TABLE public.pyra_tasks
      ADD CONSTRAINT ck_tasks_production_exact_deadline
      CHECK (
        board_id <> 'bd_production'
        OR (
          production_deadline_exempt
          AND (
            (
              id = 'tk_IOhdJMui9uW0bblj'
              AND due_date IS NULL
              AND due_at IS NULL
            )
            OR (
              due_date IS NOT NULL
              AND due_at = (
                (due_date::timestamp + interval '1 day' - interval '1 millisecond')
                AT TIME ZONE 'Asia/Dubai'
              )
            )
          )
        )
        OR (
          NOT production_deadline_exempt
          AND due_date IS NOT NULL
          AND due_at IS NOT NULL
          AND (due_at AT TIME ZONE 'Asia/Dubai')::date = due_date
          AND due_at <> (
            (due_date::timestamp + interval '1 day' - interval '1 millisecond')
            AT TIME ZONE 'Asia/Dubai'
          )
        )
      ) NOT VALID;
  END IF;
END;
$do$;

ALTER TABLE public.pyra_tasks
  VALIDATE CONSTRAINT ck_tasks_production_exact_deadline;

-- This is one coherent post-deploy boundary. Apply only after every writer for
-- these protected tables has moved behind a permission gate and service-role
-- client. Reads remain available to authenticated users.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.pyra_tasks,
  public.pyra_task_stage_history,
  public.pyra_board_columns,
  public.pyra_task_assignees
FROM anon, authenticated;

COMMIT;

-- -- DOWN (informational only; never auto-run -- use a new forward migration):
-- -- DROP TRIGGER IF EXISTS trg_tasks_production_deadline_immutable
-- --   ON public.pyra_tasks;
-- -- DROP TRIGGER IF EXISTS trg_tasks_production_deadline_insert_guard
-- --   ON public.pyra_tasks;
-- -- DROP FUNCTION IF EXISTS public.pyra_guard_production_deadline_immutable();
-- -- DROP TRIGGER IF EXISTS trg_tasks_production_deadline_lock_evidence
-- --   ON public.pyra_tasks;
-- -- DROP FUNCTION IF EXISTS public.pyra_validate_production_deadline_lock_evidence();
-- -- DROP TRIGGER IF EXISTS trg_production_review_deadline_guard
-- --   ON public.pyra_task_stage_history;
-- -- DROP FUNCTION IF EXISTS public.pyra_guard_production_review_deadline();
-- -- DROP TRIGGER IF EXISTS trg_task_assignees_atomic_lock
-- --   ON public.pyra_task_assignees;
-- -- DROP FUNCTION IF EXISTS public.pyra_lock_task_assignee_write();
-- -- DROP TRIGGER IF EXISTS trg_task_assignees_write_entry
-- --   ON public.pyra_task_assignees;
-- -- DROP TRIGGER IF EXISTS trg_tasks_task_write_entry
-- --   ON public.pyra_tasks;
-- -- DROP TRIGGER IF EXISTS trg_boards_task_write_entry
-- --   ON public.pyra_boards;
-- -- DROP TRIGGER IF EXISTS trg_projects_task_write_entry
-- --   ON public.pyra_projects;
-- -- DROP FUNCTION IF EXISTS public.pyra_lock_task_write_entry();
-- -- ALTER TABLE public.pyra_tasks
-- --   DROP CONSTRAINT IF EXISTS ck_tasks_production_exact_deadline;
