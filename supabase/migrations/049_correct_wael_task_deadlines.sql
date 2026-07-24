-- 049_correct_wael_task_deadlines.sql
-- Owner-directed correction for two legacy production tasks whose date-only
-- deadlines were migrated as exempt end-of-day sentinels. The owner supplied
-- the missing exact time: 18:00 Asia/Dubai on each task's existing due date.

BEGIN;

LOCK TABLE public.pyra_tasks IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.pyra_task_assignees IN SHARE MODE;

DO $do$
DECLARE
  v_target_count integer;
  v_invalid_count integer;
BEGIN
  SELECT count(*)
  INTO v_target_count
  FROM public.pyra_tasks AS task
  WHERE (
      task.id = 'tk_nRfrQhPIyrEPFeZo'
      AND task.title = '4 marketing Hacks'
      AND task.due_date = date '2026-07-20'
    )
    OR (
      task.id = 'tk_WT5YlHFDv7Y_Svs5'
      AND task.title = 'فيديو مريم'
      AND task.due_date = date '2026-07-21'
    );

  IF v_target_count IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Migration 049 stopped: the two owner-confirmed tasks were not found exactly';
  END IF;

  SELECT count(*)
  INTO v_invalid_count
  FROM public.pyra_tasks AS task
  WHERE task.id IN ('tk_nRfrQhPIyrEPFeZo', 'tk_WT5YlHFDv7Y_Svs5')
    AND (
      task.board_id IS DISTINCT FROM 'bd_production'
      OR task.production_deadline_locked_at IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.pyra_task_assignees AS assignee
        WHERE assignee.task_id = task.id
          AND assignee.username = 'wael.hany'
      )
      OR EXISTS (
        SELECT 1
        FROM public.pyra_task_assignees AS assignee
        WHERE assignee.task_id = task.id
          AND assignee.username IS DISTINCT FROM 'wael.hany'
      )
      OR (
        NOT (
          task.production_deadline_exempt = false
          AND task.due_at = CASE task.id
            WHEN 'tk_nRfrQhPIyrEPFeZo' THEN timestamptz '2026-07-20 18:00:00+04'
            WHEN 'tk_WT5YlHFDv7Y_Svs5' THEN timestamptz '2026-07-21 18:00:00+04'
          END
        )
        AND (
          task.column_id IS DISTINCT FROM 'col_prod_wip'
          OR task.production_deadline_exempt IS DISTINCT FROM true
          OR task.due_at IS DISTINCT FROM CASE task.id
            WHEN 'tk_nRfrQhPIyrEPFeZo' THEN timestamptz '2026-07-20 23:59:59.999+04'
            WHEN 'tk_WT5YlHFDv7Y_Svs5' THEN timestamptz '2026-07-21 23:59:59.999+04'
          END
        )
      )
    );

  IF v_invalid_count <> 0 THEN
    RAISE EXCEPTION 'Migration 049 stopped: task ownership, board, lock, column, or prior deadline changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = 'public.pyra_tasks'::pg_catalog.regclass
      AND trigger_row.tgname = 'trg_tasks_production_deadline_immutable'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'Migration 049 stopped: production deadline guard is missing or disabled';
  END IF;
END;
$do$;

-- These tasks already reached review before exact-time deadlines were enabled.
-- The narrow trigger suspension is transaction-scoped by DDL locking, targets
-- only the two verified ids, and is restored before commit.
ALTER TABLE public.pyra_tasks
  DISABLE TRIGGER trg_tasks_production_deadline_immutable;

UPDATE public.pyra_tasks AS task
SET due_at = CASE task.id
      WHEN 'tk_nRfrQhPIyrEPFeZo' THEN timestamptz '2026-07-20 18:00:00+04'
      WHEN 'tk_WT5YlHFDv7Y_Svs5' THEN timestamptz '2026-07-21 18:00:00+04'
    END,
    production_deadline_exempt = false,
    updated_at = pg_catalog.clock_timestamp()
WHERE task.id IN ('tk_nRfrQhPIyrEPFeZo', 'tk_WT5YlHFDv7Y_Svs5')
  AND (
    task.production_deadline_exempt
    OR task.due_at IS DISTINCT FROM CASE task.id
      WHEN 'tk_nRfrQhPIyrEPFeZo' THEN timestamptz '2026-07-20 18:00:00+04'
      WHEN 'tk_WT5YlHFDv7Y_Svs5' THEN timestamptz '2026-07-21 18:00:00+04'
    END
  );

ALTER TABLE public.pyra_tasks
  ENABLE TRIGGER trg_tasks_production_deadline_immutable;

INSERT INTO public.pyra_task_activity (
  id,
  task_id,
  username,
  display_name,
  action,
  details,
  created_at
)
VALUES
  (
    'act_deadline_4hack',
    'tk_nRfrQhPIyrEPFeZo',
    'elharm',
    'Mohamed',
    'deadline_corrected',
    pg_catalog.jsonb_build_object(
      'source', 'owner_deadline_correction_2026_07_22',
      'timezone', 'Asia/Dubai',
      'old_due_at', '2026-07-20T23:59:59.999+04:00',
      'new_due_at', '2026-07-20T18:00:00+04:00'
    ),
    pg_catalog.clock_timestamp()
  ),
  (
    'act_deadline_mary',
    'tk_WT5YlHFDv7Y_Svs5',
    'elharm',
    'Mohamed',
    'deadline_corrected',
    pg_catalog.jsonb_build_object(
      'source', 'owner_deadline_correction_2026_07_22',
      'timezone', 'Asia/Dubai',
      'old_due_at', '2026-07-21T23:59:59.999+04:00',
      'new_due_at', '2026-07-21T18:00:00+04:00'
    ),
    pg_catalog.clock_timestamp()
  )
ON CONFLICT (id) DO NOTHING;

DO $do$
DECLARE
  v_correct_count integer;
BEGIN
  SELECT count(*)
  INTO v_correct_count
  FROM public.pyra_tasks AS task
  WHERE (
      task.id = 'tk_nRfrQhPIyrEPFeZo'
      AND task.due_date = date '2026-07-20'
      AND task.due_at = timestamptz '2026-07-20 18:00:00+04'
      AND NOT task.production_deadline_exempt
    )
    OR (
      task.id = 'tk_WT5YlHFDv7Y_Svs5'
      AND task.due_date = date '2026-07-21'
      AND task.due_at = timestamptz '2026-07-21 18:00:00+04'
      AND NOT task.production_deadline_exempt
    );

  IF v_correct_count IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Migration 049 stopped: corrected deadline postcondition failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = 'public.pyra_tasks'::pg_catalog.regclass
      AND trigger_row.tgname = 'trg_tasks_production_deadline_immutable'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'Migration 049 stopped: production deadline guard was not restored';
  END IF;
END;
$do$;

COMMIT;

-- -- DOWN is intentionally omitted: this is an owner-directed factual data correction.
-- -- Reverting after a new review submission would corrupt immutable deadline evidence.
