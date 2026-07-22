import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readRepoFile(path: string): string {
  const absolutePath = resolve(repoRoot, path);
  expect(existsSync(absolutePath), `${path} must exist`).toBe(true);
  return readFileSync(absolutePath, 'utf8');
}

describe('atomic task-transition migrations', () => {
  it('owns create, duplicate, and assignee mutations in service-only atomic RPCs', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const verifier = readRepoFile('scripts/sql/verify-042-atomic-task-transitions.sql');

    for (const functionName of [
      'pyra_create_task_atomic',
      'pyra_duplicate_task_atomic',
      'pyra_add_task_assignees_atomic',
      'pyra_remove_task_assignee_atomic',
      'pyra_mutate_task_label_atomic',
      'pyra_mutate_task_checklist_atomic',
    ]) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${functionName}`);
      expect(sql).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${functionName}[\\s\\S]+FROM PUBLIC, anon, authenticated, service_role;`,
      ));
      expect(sql).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${functionName}[\\s\\S]+TO service_role;`,
      ));
      expect(verifier).toContain(functionName);
    }
  });

  it('takes the global assignee lock before every per-task writer lock', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const functionNames = [
      'pyra_create_task_atomic',
      'pyra_duplicate_task_atomic',
      'pyra_add_task_assignees_atomic',
      'pyra_remove_task_assignee_atomic',
    ];

    for (const functionName of functionNames) {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}`);
      const nextStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.', start + 1);
      const body = sql.slice(start, nextStart === -1 ? sql.length : nextStart);
      const globalLock = body.indexOf("hashtextextended('pyra_task_assignees', 42042)");
      const taskLock = body.search(/hashtextextended\((?:p_task_id|p_new_task_id|v_lock_task_id), 42042\)/);
      expect(globalLock, functionName).toBeGreaterThanOrEqual(0);
      expect(taskLock, functionName).toBeGreaterThan(globalLock);
    }
  });

  it('calculates ordering and copies every duplicate relation inside PostgreSQL', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const createStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_create_task_atomic');
    const duplicateStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_duplicate_task_atomic');
    const addStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_add_task_assignees_atomic');
    const createBody = sql.slice(createStart, duplicateStart);
    const duplicateBody = sql.slice(duplicateStart, addStart);

    for (const body of [createBody, duplicateBody]) {
      expect(body).toContain('FOR UPDATE');
      expect(body).toContain('MAX(t.position)');
      expect(body).toContain('MAX(t.task_number)');
      expect(body).toContain('INSERT INTO public.pyra_tasks');
      expect(body).toContain('INSERT INTO public.pyra_task_assignees');
      expect(body).toContain("column_type IN ('review', 'delivery')");
      expect(body).toContain("AT TIME ZONE 'Asia/Dubai'");
    }
    expect(duplicateBody).toContain('INSERT INTO public.pyra_task_labels');
    expect(duplicateBody).toContain('INSERT INTO public.pyra_task_checklist');
    expect(duplicateBody).toContain('INSERT INTO public.pyra_task_activity');
  });

  it('serializes task label and checklist mutations with CAS, relation validation, and atomic activity', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const labelStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_mutate_task_label_atomic');
    const checklistStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_mutate_task_checklist_atomic');
    const advanceStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_advance_task_atomic');
    const labelBody = sql.slice(labelStart, checklistStart);
    const checklistBody = sql.slice(checklistStart, advanceStart);

    expect(labelStart).toBeGreaterThan(-1);
    expect(checklistStart).toBeGreaterThan(labelStart);
    for (const body of [labelBody, checklistBody]) {
      const globalLock = body.indexOf("hashtextextended('pyra_task_assignees', 42042)");
      const taskLock = body.indexOf('hashtextextended(p_task_id, 42042)');
      expect(globalLock).toBeGreaterThan(-1);
      expect(taskLock).toBeGreaterThan(globalLock);
      expect(body).toMatch(/WHERE t\.id = p_task_id[\s\S]+FOR UPDATE/);
      expect(body).toContain('v_task.board_id IS DISTINCT FROM p_expected_board_id');
      expect(body).toContain('v_task.updated_at IS DISTINCT FROM p_expected_updated_at');
      expect(body).toContain('UPDATE public.pyra_tasks AS t');
      expect(body).toContain('INSERT INTO public.pyra_task_activity');
    }
    expect(labelBody).toMatch(/FROM public\.pyra_board_labels AS bl[\s\S]+bl\.board_id = p_expected_board_id[\s\S]+FOR KEY SHARE/);
    expect(labelBody).toContain('INSERT INTO public.pyra_task_labels');
    expect(labelBody).toContain('DELETE FROM public.pyra_task_labels');
    expect(checklistBody).toMatch(/FROM public\.pyra_task_checklist AS c[\s\S]+ORDER BY c\.id[\s\S]+FOR UPDATE/);
    expect(checklistBody).toContain('MAX(c.position)');
    expect(checklistBody).toContain('INSERT INTO public.pyra_task_checklist');
    expect(checklistBody).toContain('UPDATE public.pyra_task_checklist');
    expect(checklistBody).toContain('DELETE FROM public.pyra_task_checklist');
  });

  it('closes assignee scope races with locked board/version checks and task version bumps', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const addStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_add_task_assignees_atomic');
    const removeStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_remove_task_assignee_atomic');
    const triggerStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_lock_task_assignee_write');
    const addBody = sql.slice(addStart, removeStart);
    const removeBody = sql.slice(removeStart, triggerStart);

    for (const body of [addBody, removeBody]) {
      expect(body).toContain('FOR UPDATE');
      expect(body).toContain('v_task.board_id IS DISTINCT FROM p_expected_board_id');
      expect(body).toContain('v_task.updated_at IS DISTINCT FROM p_expected_updated_at');
      expect(body).toContain("'task_write_conflict'::text");
      expect(body).toMatch(/UPDATE public\.pyra_tasks AS t[\s\S]+SET updated_at = v_mutated_at/);
    }
  });

  it('accepts only internally consistent exact deadlines on every board', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const createStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_create_task_atomic');
    const duplicateStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_duplicate_task_atomic');
    const addStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_add_task_assignees_atomic');
    const moveStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_move_task_atomic');
    const triggerStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_lock_task_assignee_write');
    const createBody = sql.slice(createStart, duplicateStart);
    const duplicateBody = sql.slice(duplicateStart, addStart);
    const moveBody = sql.slice(moveStart, triggerStart);

    for (const body of [createBody, duplicateBody]) {
      expect(body).toMatch(
        /p_due_at IS NOT NULL[\s\S]+p_due_date IS NULL[\s\S]+AT TIME ZONE 'Asia\/Dubai'[\s\S]+IS DISTINCT FROM p_due_date/,
      );
      expect(body).not.toContain('ELSIF p_due_at IS NOT NULL THEN');
    }
    expect(moveBody).toMatch(
      /v_effective_due_at IS NOT NULL[\s\S]+v_effective_due_date IS NULL[\s\S]+AT TIME ZONE 'Asia\/Dubai'[\s\S]+IS DISTINCT FROM v_effective_due_date/,
    );
  });

  it('keeps duplicate task ownership and activity display-name fields in the correct columns', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const duplicateStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_duplicate_task_atomic');
    const addStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_add_task_assignees_atomic');
    const duplicateBody = sql.slice(duplicateStart, addStart);
    const taskInsert = duplicateBody.match(
      /INSERT INTO public\.pyra_tasks\s*\([\s\S]*?created_by,[\s\S]*?\) VALUES \([\s\S]*?p_created_by,[\s\S]*?\)\s*RETURNING/,
    );
    const activityInsert = duplicateBody.match(
      /INSERT INTO public\.pyra_task_activity\s*\(\s*id,\s*task_id,\s*username,\s*display_name,\s*action,\s*details,\s*created_at\s*\) VALUES \(\s*p_activity_id,\s*p_new_task_id,\s*p_created_by,\s*p_actor_display_name,\s*'created'/,
    );
    expect(taskInsert).not.toBeNull();
    expect(activityInsert).not.toBeNull();
  });

  it('commits stage_advanced evidence atomically with the transition timestamp', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const advanceStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_advance_task_atomic');
    const moveStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_move_task_atomic');
    const advanceBody = sql.slice(advanceStart, moveStart);

    expect(advanceBody).toContain('p_actor_display_name varchar');
    expect(advanceBody).toContain('p_activity_id varchar');
    expect(advanceBody).toMatch(
      /INSERT INTO public\.pyra_task_activity\s*\(\s*id,\s*task_id,\s*username,\s*display_name,\s*action,\s*details,\s*created_at\s*\) VALUES \(\s*p_activity_id,\s*p_task_id,\s*p_moved_by,\s*p_actor_display_name,\s*'stage_advanced',\s*pg_catalog\.jsonb_build_object\([\s\S]+v_moved_at\s*\);/,
    );
    expect(advanceBody.indexOf('INSERT INTO public.pyra_task_activity')).toBeLessThan(
      advanceBody.lastIndexOf('RETURN QUERY'),
    );
  });

  it('commits moved evidence atomically with the transition timestamp', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const moveStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_move_task_atomic');
    const lockStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_lock_task_write_entry');
    const moveBody = sql.slice(moveStart, lockStart);

    expect(moveBody).toContain('p_actor_display_name varchar');
    expect(moveBody).toContain('p_activity_id varchar');
    expect(moveBody).toMatch(
      /INSERT INTO public\.pyra_task_activity\s*\(\s*id,\s*task_id,\s*username,\s*display_name,\s*action,\s*details,\s*created_at\s*\) VALUES \(\s*p_activity_id,\s*p_task_id,\s*p_moved_by,\s*p_actor_display_name,\s*'moved',\s*pg_catalog\.jsonb_build_object\(\s*'column_id',\s*p_target_column_id,\s*'position',\s*v_actual_position\s*\),\s*v_moved_at\s*\);/,
    );
    expect(moveBody.indexOf('INSERT INTO public.pyra_task_activity')).toBeLessThan(
      moveBody.lastIndexOf('RETURN QUERY'),
    );
  });

  it('validates only new assignment inputs against locked user rows', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const createStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_create_task_atomic');
    const duplicateStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_duplicate_task_atomic');
    const addStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_add_task_assignees_atomic');
    const removeStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_remove_task_assignee_atomic');
    const createBody = sql.slice(createStart, duplicateStart);
    const duplicateBody = sql.slice(duplicateStart, addStart);
    const addBody = sql.slice(addStart, removeStart);

    for (const body of [createBody, addBody]) {
      expect(body).toContain('FROM public.pyra_users AS u');
      expect(body).toContain('FOR KEY SHARE');
      expect(body).toContain("'invalid_assignees'::text");
      expect(body).toContain('v_existing_user_count');
    }
    expect(duplicateBody).not.toContain('FROM public.pyra_users AS u');
  });

  it('keeps migration 042 additive and service-role-only', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.pyra_advance_task_atomic');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.pyra_move_task_atomic');
    expect(sql).toContain('p_expected_target_column_id varchar');
    expect(sql).toContain('p_expected_target_column_type varchar');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS production_deadline_locked_at timestamptz');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS production_deadline_exempt boolean NOT NULL DEFAULT false');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS task_created_at_snapshot timestamptz');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS assignees_snapshot jsonb');
    expect(sql).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(sql).toContain('production_deadline_locked_at');
    expect(sql).toContain('task_created_at_snapshot');
    expect(sql).toContain('assignees_snapshot');
    expect(sql).toMatch(/jsonb_agg\([\s\S]+ORDER BY[\s\S]+username/);
    expect(sql).toContain('ON CONFLICT (task_id, username) DO NOTHING');
    expect(sql).toContain('c.board_id IN (p_expected_board_id, p_target_board_id)');
    const historyInserts = sql.match(
      /INSERT INTO public\.pyra_task_stage_history\s*\([\s\S]*?\)\s*VALUES\s*\([\s\S]*?\);/g,
    );
    expect(historyInserts).toHaveLength(2);
    for (const historyInsert of historyInserts || []) {
      expect(historyInsert).toMatch(/\bcreated_at\b/);
      expect(historyInsert).toMatch(/\bv_moved_at\b/);
      expect(historyInsert).not.toMatch(/p_(?:created|moved)_at/);
    }
    expect(sql.match(/SECURITY INVOKER/g)).toHaveLength(12);
    expect(sql.match(/SECURITY DEFINER/g)).toHaveLength(2);
    expect(sql.match(/SET search_path = ''/g)).toHaveLength(14);
    expect(sql).not.toMatch(/pg_catalog\.(?:coalesce|greatest|least)\s*\(/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.pyra_advance_task_atomic[\s\S]+FROM PUBLIC, anon, authenticated, service_role;/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.pyra_move_task_atomic[\s\S]+FROM PUBLIC, anon, authenticated, service_role;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.pyra_advance_task_atomic[\s\S]+TO service_role;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.pyra_move_task_atomic[\s\S]+TO service_role;/);
    expect(sql).not.toContain('ck_tasks_production_exact_deadline');
    expect(sql).not.toContain('trg_tasks_production_deadline_immutable');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.pyra_lock_task_assignee_write()');
    expect(sql).toContain('CREATE TRIGGER trg_task_assignees_atomic_lock');
    expect(sql).toContain('pg_catalog.hashtextextended(v_task_id, 42042)');
    expect(sql).toMatch(/SELECT DISTINCT task_id[\s\S]+ORDER BY task_id/);
    expect(sql).not.toMatch(/REVOKE\s+(?:INSERT|UPDATE|DELETE)/i);
  });

  it('rejects a review-to-delivery meaning race on the same target id before mutation', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const advanceSql = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_advance_task_atomic'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_move_task_atomic'),
    );
    const targetIdCas = advanceSql.indexOf(
      'v_target_column.id IS DISTINCT FROM p_expected_target_column_id',
    );
    const targetTypeCas = advanceSql.indexOf(
      'v_target_column.column_type IS DISTINCT FROM p_expected_target_column_type',
    );
    const firstMutation = advanceSql.indexOf('UPDATE public.pyra_tasks');

    expect(targetIdCas).toBeGreaterThan(-1);
    expect(targetTypeCas).toBeGreaterThan(targetIdCas);
    expect(targetTypeCas).toBeLessThan(firstMutation);
    expect(advanceSql.slice(targetIdCas, firstMutation)).toContain("RETURN QUERY SELECT 'transition_conflict'");
  });

  it('atomically compacts the source order and appends an advanced task to the target order', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const advanceSql = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_advance_task_atomic'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_move_task_atomic'),
    );

    expect(advanceSql).toContain('v_target_position integer');
    expect(advanceSql).toMatch(/WHERE t\.column_id IN \(p_expected_column_id, v_target_column\.id\)[\s\S]+FOR UPDATE/);
    expect(advanceSql).toMatch(/WHERE t\.column_id = v_target_column\.id[\s\S]+desired_position/);
    expect(advanceSql).toMatch(/WHERE t\.column_id = p_expected_column_id[\s\S]+desired_position/);
    expect(advanceSql).toMatch(/SET column_id = v_target_column\.id,[\s\S]+position = v_target_position/);
  });

  it('takes one statement-entry global lock before parent cascades and assignee row task locks', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const globalLock = "hashtextextended('pyra_task_assignees', 42042)";
    const advanceSql = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_advance_task_atomic'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_move_task_atomic'),
    );
    const moveSql = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_move_task_atomic'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_lock_task_assignee_write'),
    );
    const entryTriggerSql = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_lock_task_write_entry'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_lock_task_assignee_write'),
    );
    const rowTriggerSql = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_lock_task_assignee_write'),
      sql.indexOf('REVOKE ALL ON FUNCTION public.pyra_lock_task_assignee_write'),
    );

    for (const functionSql of [advanceSql, moveSql]) {
      expect(functionSql).toContain(globalLock);
      expect(functionSql.indexOf(globalLock)).toBeLessThan(
        functionSql.indexOf('hashtextextended(p_task_id, 42042)'),
      );
    }
    expect(entryTriggerSql).toContain(globalLock);
    expect(entryTriggerSql).not.toContain('hashtextextended(v_task_id, 42042)');
    expect(rowTriggerSql).not.toContain(globalLock);
    expect(rowTriggerSql).toContain('hashtextextended(v_task_id, 42042)');
    expect(rowTriggerSql).toMatch(/SELECT DISTINCT task_id[\s\S]+ORDER BY task_id/);

    for (const [triggerName, tableName, events] of [
      ['trg_projects_task_write_entry', 'pyra_projects', 'DELETE'],
      ['trg_boards_task_write_entry', 'pyra_boards', 'INSERT OR UPDATE OR DELETE'],
      ['trg_tasks_task_write_entry', 'pyra_tasks', 'INSERT OR UPDATE OR DELETE'],
      ['trg_task_assignees_write_entry', 'pyra_task_assignees', 'INSERT OR UPDATE OR DELETE'],
      ['trg_board_columns_write_entry', 'pyra_board_columns', 'INSERT OR UPDATE OR DELETE'],
      ['trg_task_stage_history_write_entry', 'pyra_task_stage_history', 'INSERT OR UPDATE OR DELETE'],
    ] as const) {
      expect(sql).toMatch(new RegExp(
        `CREATE TRIGGER ${triggerName}[\\s\\S]+BEFORE ${events} ON public\\.${tableName}[\\s\\S]+FOR EACH STATEMENT[\\s\\S]+EXECUTE FUNCTION public\\.pyra_lock_task_write_entry\\(\\);`,
      ));
    }
    expect(sql).toMatch(/CREATE TRIGGER trg_task_assignees_atomic_lock[\s\S]+FOR EACH ROW[\s\S]+EXECUTE FUNCTION public\.pyra_lock_task_assignee_write\(\);/);
  });

  it('reserves enforcement and coordinated revokes for post-deploy migration 044', () => {
    const oldPath = resolve(repoRoot, 'supabase/migrations/042_enforce_production_deadlines.sql');
    const old043Path = resolve(repoRoot, 'supabase/migrations/043_enforce_production_deadlines.sql');
    const sql = readRepoFile('supabase/migrations/044_harden_production_evidence.sql');

    expect(existsSync(oldPath)).toBe(false);
    expect(existsSync(old043Path)).toBe(false);
    const begin = sql.indexOf('BEGIN;');
    const deploymentGlobalLock = sql.indexOf(
      "pg_catalog.hashtextextended('pyra_task_assignees', 42042)",
      begin,
    );
    const protectedLock = sql.indexOf('LOCK TABLE public.pyra_tasks');
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(deploymentGlobalLock).toBeGreaterThan(begin);
    expect(deploymentGlobalLock).toBeLessThan(protectedLock);
    expect(protectedLock).toBeGreaterThan(-1);
    expect(sql).toContain('IN SHARE ROW EXCLUSIVE MODE NOWAIT');
    expect(sql.slice(protectedLock, sql.indexOf('IN SHARE ROW EXCLUSIVE MODE NOWAIT')))
      .toContain('public.pyra_projects');
    expect(sql.slice(protectedLock, sql.indexOf('IN SHARE ROW EXCLUSIVE MODE NOWAIT')))
      .toContain('public.pyra_boards');
    expect(protectedLock).toBeLessThan(sql.indexOf('DROP TRIGGER IF EXISTS trg_tasks_production_deadline_immutable'));
    expect(protectedLock).toBeLessThan(sql.indexOf('DROP CONSTRAINT IF EXISTS ck_tasks_production_exact_deadline'));
    expect(sql.indexOf('DROP CONSTRAINT IF EXISTS ck_tasks_production_exact_deadline'))
      .toBeLessThan(sql.indexOf('SET production_deadline_exempt = false'));
    expect(protectedLock).toBeLessThan(sql.indexOf('SET production_deadline_exempt = false'));
    expect(protectedLock).toBeLessThan(sql.indexOf(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE',
    ));
    expect(sql).toContain('ck_tasks_production_exact_deadline');
    expect(sql).toContain('trg_tasks_production_deadline_immutable');
    expect(sql).toContain('trg_production_review_deadline_guard');
    expect(sql).toContain('pyra_guard_production_review_deadline');
    expect(sql).toContain('trg_tasks_production_deadline_lock_evidence');
    expect(sql).toContain('pyra_validate_production_deadline_lock_evidence');
    expect(sql).toContain('v_target_column_board_id');
    expect(sql).toContain('Production review history board must match its target column');
    expect(sql).toContain('Production review requires the persistent deadline lock');
    expect(sql).toContain('Production review deadline evidence is immutable');
    expect(sql).toContain('Production deadline lock requires matching first-review evidence');
    expect(sql).toMatch(
      /WHERE c\.id = NEW\.to_column_id;[\s\S]+v_target_column_board_id IS DISTINCT FROM 'bd_production'/,
    );
    expect(sql).not.toMatch(
      /WHERE c\.id = NEW\.to_column_id\s+AND c\.board_id = 'bd_production'/,
    );
    expect(sql).toContain('SET production_deadline_locked_at = first_review.locked_at');
    expect(sql).toContain('OLD.production_deadline_locked_at IS NOT NULL');
    expect(sql).toContain('OLD.production_deadline_exempt IS DISTINCT FROM NEW.production_deadline_exempt');
    expect(sql).toContain('NEW.production_deadline_exempt := false');
    expect(sql).toMatch(
      /OLD\.production_deadline_exempt[\s\S]+OLD\.board_id IS DISTINCT FROM NEW\.board_id[\s\S]+NEW\.board_id = 'bd_production'[\s\S]+NEW\.due_at[\s\S]+interval '1 millisecond'[\s\S]+NEW\.production_deadline_exempt := false/,
    );
    expect(sql).toContain('CREATE TRIGGER trg_tasks_production_deadline_insert_guard');
    expect(sql).toMatch(
      /CREATE TRIGGER trg_tasks_production_deadline_insert_guard\s+BEFORE INSERT ON public\.pyra_tasks/,
    );
    expect(sql).toContain('BEFORE UPDATE OF board_id, due_date, due_at, production_deadline_locked_at, production_deadline_exempt');
    expect(sql).toContain('New production tasks require a genuine exact deadline');
    expect(sql).toContain('Legacy deadline exemptions require a genuine exact deadline before production entry');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.pyra_lock_task_assignee_write()');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.pyra_lock_task_write_entry()');
    expect(sql).toContain('CREATE TRIGGER trg_task_assignees_atomic_lock');
    expect(sql).toContain('CREATE TRIGGER trg_projects_task_write_entry');
    expect(sql).toContain('CREATE TRIGGER trg_boards_task_write_entry');
    expect(sql).toContain('CREATE TRIGGER trg_tasks_task_write_entry');
    expect(sql).toContain('CREATE TRIGGER trg_task_assignees_write_entry');
    const entryFunctionStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_lock_task_write_entry');
    const rowFunctionStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.pyra_lock_task_assignee_write');
    expect(entryFunctionStart).toBeGreaterThan(-1);
    expect(rowFunctionStart).toBeGreaterThan(entryFunctionStart);
    expect(sql.slice(entryFunctionStart, rowFunctionStart)).toContain("hashtextextended('pyra_task_assignees', 42042)");
    expect(sql.slice(rowFunctionStart, sql.indexOf('DO $do$', rowFunctionStart))).not.toContain("hashtextextended('pyra_task_assignees', 42042)");
    expect(sql).toContain('pg_catalog.hashtextextended(v_task_id, 42042)');
    expect(sql).toMatch(/SELECT DISTINCT task_id[\s\S]+ORDER BY task_id/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE[\s\S]+public\.pyra_tasks,[\s\S]+public\.pyra_task_stage_history,[\s\S]+public\.pyra_board_columns,[\s\S]+public\.pyra_task_assignees[\s\S]+FROM anon, authenticated;/);
    expect(sql).not.toMatch(/REVOKE[^;]+SELECT[^;]+FROM authenticated;/i);
    expect(sql).toContain('production_deadline_exempt');
    const exemptionReset = sql.indexOf('SET production_deadline_exempt = false');
    const verifiedExemption = sql.indexOf('SET production_deadline_exempt = true');
    expect(exemptionReset).toBeGreaterThan(-1);
    expect(verifiedExemption).toBeGreaterThan(exemptionReset);
    expect(sql).toContain("interval '1 day' - interval '1 millisecond'");
    const firstExemptionUpdate = sql.indexOf('SET production_deadline_exempt = true');
    const secondExemptionUpdate = sql.indexOf(
      'SET production_deadline_exempt = true',
      firstExemptionUpdate + 1,
    );
    expect(firstExemptionUpdate).toBeGreaterThan(-1);
    expect(secondExemptionUpdate).toBeGreaterThan(firstExemptionUpdate);
    const sentinelUpdate = sql.slice(firstExemptionUpdate, secondExemptionUpdate);
    expect(sentinelUpdate).toContain("interval '1 day' - interval '1 millisecond'");
    expect(sentinelUpdate).not.toContain("board_id = 'bd_production'");
    const missingUpdate = sql.slice(secondExemptionUpdate, sql.indexOf(';', secondExemptionUpdate));
    expect(missingUpdate).toContain("id = 'tk_IOhdJMui9uW0bblj'");
    expect(missingUpdate).toContain('due_date IS NULL');
    expect(missingUpdate).toContain('due_at IS NULL');
    expect(sql).not.toMatch(/SET due_at_snapshot\s*=/);
    expect(sql).not.toMatch(
      /SET due_at = \([\s\S]+interval '1 day' - interval '1 millisecond'/,
    );
    const constraintStart = sql.indexOf('ADD CONSTRAINT ck_tasks_production_exact_deadline');
    const constraintEnd = sql.indexOf(') NOT VALID;', constraintStart);
    const constraintSql = sql.slice(constraintStart, constraintEnd);
    expect(constraintSql).toContain('tk_IOhdJMui9uW0bblj');
    expect(constraintSql).toContain('NOT production_deadline_exempt');
    expect(constraintSql).toContain("interval '1 day' - interval '1 millisecond'");
    expect(sql).not.toMatch(/SET\s+assignees_snapshot\s*=/i);
    expect(sql).not.toContain('pyra_advance_task_atomic');
    expect(sql).not.toContain('pyra_move_task_atomic');
    expect(sql).toMatch(
      /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE[\s\S]+FROM anon, authenticated;/,
    );
  });

  it('ships separate read-only catalog verifiers for 042 and 044', () => {
    const atomicVerifier = readRepoFile('scripts/sql/verify-042-atomic-task-transitions.sql');
    const deadlineVerifier = readRepoFile('scripts/sql/verify-044-production-evidence.sql');

    expect(atomicVerifier).toContain('pg_catalog.pg_proc');
    expect(atomicVerifier).toContain('pyra_advance_task_atomic');
    expect(atomicVerifier).toContain('pyra_move_task_atomic');
    expect(atomicVerifier).toContain('service_role');
    expect(atomicVerifier).toContain('authenticated');
    expect(atomicVerifier).toContain('production_deadline_locked_at');
    expect(atomicVerifier).toContain('production_deadline_exempt');
    expect(atomicVerifier).toContain('task_created_at_snapshot');
    expect(atomicVerifier).toContain('assignees_snapshot');
    expect(atomicVerifier).toContain('trg_task_assignees_atomic_lock');
    expect(atomicVerifier).toContain('trg_projects_task_write_entry');
    expect(atomicVerifier).toContain('trg_boards_task_write_entry');
    expect(atomicVerifier).toContain('trg_tasks_task_write_entry');
    expect(atomicVerifier).toContain('trg_task_assignees_write_entry');
    expect(atomicVerifier).toContain('Migration 042 postflight: history created_at is not DB-derived');
    expect(atomicVerifier).toContain("('pyra_task_assignees', 'SELECT')");
    expect(atomicVerifier).toContain("('pyra_task_assignees', 'INSERT')");
    for (const table of [
      'pyra_boards',
      'pyra_board_columns',
      'pyra_users',
      'pyra_task_assignees',
      'pyra_task_labels',
      'pyra_task_checklist',
    ]) {
      expect(atomicVerifier).toContain(`('${table}', 'UPDATE')`);
    }
    expect(atomicVerifier).not.toContain("'SELECT,INSERT");
    expect(atomicVerifier).not.toContain("'SELECT,UPDATE");
    expect(atomicVerifier).not.toContain("'SELECT,INSERT,UPDATE,DELETE'");
    expect(atomicVerifier).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE)\b/im);

    expect(deadlineVerifier).toContain('ck_tasks_production_exact_deadline');
    expect(deadlineVerifier).toContain('trg_tasks_production_deadline_immutable');
    expect(deadlineVerifier).toContain('trg_production_review_deadline_guard');
    expect(deadlineVerifier).toContain('pyra_guard_production_review_deadline');
    expect(deadlineVerifier).toContain('trg_tasks_production_deadline_lock_evidence');
    expect(deadlineVerifier).toContain('pyra_validate_production_deadline_lock_evidence');
    expect(deadlineVerifier).toContain('v_target_column_board_id');
    expect(deadlineVerifier).toContain('Production review history board must match its target column');
    expect(deadlineVerifier).toContain('NEW.production_deadline_exempt := false');
    expect(deadlineVerifier).toContain('OLD.board_id IS DISTINCT FROM NEW.board_id');
    expect(deadlineVerifier).toContain('production_deadline_locked_at');
    expect(deadlineVerifier).toContain('trg_task_assignees_atomic_lock');
    expect(deadlineVerifier).toContain('trg_projects_task_write_entry');
    expect(deadlineVerifier).toContain('trg_boards_task_write_entry');
    expect(deadlineVerifier).toContain('trg_tasks_task_write_entry');
    expect(deadlineVerifier).toContain('trg_task_assignees_write_entry');
    expect(deadlineVerifier).toContain('unauthorized production deadline exemptions');
    expect(deadlineVerifier).toContain("(VALUES ('anon'), ('authenticated'))");
    expect(deadlineVerifier).toContain("('service_role', 'pyra_tasks', 'SELECT')");
    expect(deadlineVerifier).toContain("('service_role', 'pyra_tasks', 'INSERT')");
    expect(deadlineVerifier).not.toContain(
      "'service_role', 'public.pyra_tasks', 'SELECT,INSERT,UPDATE,DELETE'",
    );
    for (const table of [
      'pyra_tasks',
      'pyra_task_stage_history',
      'pyra_board_columns',
      'pyra_task_assignees',
    ]) {
      expect(deadlineVerifier).toContain(`('${table}')`);
    }
    for (const privilege of [
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
    ]) {
      expect(deadlineVerifier).toContain(`('${privilege}')`);
    }
    expect(deadlineVerifier).toContain("'authenticated', 'public.pyra_tasks', 'SELECT'");
    expect(deadlineVerifier).toContain("'authenticated', 'public.pyra_task_stage_history', 'SELECT'");
    expect(deadlineVerifier).toContain("'authenticated', 'public.pyra_board_columns', 'SELECT'");
    expect(deadlineVerifier).toContain("'authenticated', 'public.pyra_task_assignees', 'SELECT'");
    expect(deadlineVerifier).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE)\b/im);
  });

  it('makes the live 042 preflight fail closed for every artifact, fixture, and the exact 041 prerequisite', () => {
    const sql = readRepoFile('.superpowers/sdd/task3-042-live-preflight.sql');
    const assertionStart = sql.indexOf('DO $preflight$');
    const diagnosticStart = sql.indexOf('WITH required_columns', assertionStart + 1);

    expect(assertionStart).toBeGreaterThanOrEqual(0);
    expect(sql.slice(assertionStart, diagnosticStart)).toContain('RAISE EXCEPTION');
    expect(diagnosticStart).toBeGreaterThan(assertionStart);

    for (const signature of [
      'public.pyra_create_task_atomic(character varying,character varying,character varying,character varying,text,character varying,date,timestamp with time zone,date,numeric,character varying,jsonb)',
      'public.pyra_duplicate_task_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,date,timestamp with time zone,character varying,character varying,jsonb,jsonb,character varying)',
      'public.pyra_add_task_assignees_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,jsonb)',
      'public.pyra_remove_task_assignee_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying)',
      'public.pyra_mutate_task_label_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,character varying)',
      'public.pyra_mutate_task_checklist_atomic(character varying,character varying,timestamp with time zone,character varying,character varying,jsonb,character varying,character varying,character varying)',
      'public.pyra_advance_task_atomic(character varying,character varying,character varying,character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,character varying,text,character varying,character varying)',
      'public.pyra_move_task_atomic(character varying,character varying,character varying,timestamp with time zone,character varying,character varying,integer,character varying,character varying,date,timestamp with time zone,character varying,character varying)',
      'public.pyra_create_board_atomic(character varying,character varying,text,character varying,text,character varying,boolean,boolean,character varying,jsonb,jsonb)',
      'public.pyra_create_board_column_atomic(character varying,character varying,character varying,character varying,integer)',
      'public.pyra_update_board_columns_atomic(character varying,jsonb)',
      'public.pyra_delete_board_column_atomic(character varying,character varying)',
      'public.pyra_lock_task_write_entry()',
      'public.pyra_lock_task_assignee_write()',
    ]) {
      expect(sql.slice(assertionStart, diagnosticStart)).toContain(signature);
    }

    for (const triggerName of [
      'trg_projects_task_write_entry',
      'trg_boards_task_write_entry',
      'trg_tasks_task_write_entry',
      'trg_task_assignees_write_entry',
      'trg_task_assignees_atomic_lock',
      'trg_board_columns_write_entry',
      'trg_task_stage_history_write_entry',
    ]) {
      expect(sql.slice(assertionStart, diagnosticStart)).toContain(triggerName);
    }

    for (const artifact of [
      'production_deadline_locked_at',
      'production_deadline_exempt',
      'task_created_at_snapshot',
      'assignees_snapshot',
      'idx_task_stage_history_from_column',
      'idx_task_stage_history_to_column',
      'smoke_boards',
      'smoke_columns',
      'smoke_board_labels',
      'smoke_tasks',
      'smoke_assignees',
      'smoke_task_labels',
      'smoke_checklist',
      'smoke_activity',
      'smoke_stage_history',
      '041_employee_deductions',
      '52e36f0942f183e91c3fcc8e83ebd2765cd487207adb0252b3010039876f54d0',
    ]) {
      expect(sql.slice(assertionStart, diagnosticStart)).toContain(artifact);
    }
  });

  it('makes the rollback postcondition fail closed for every 042 artifact and fixture group', () => {
    const sql = readRepoFile('.superpowers/sdd/task3-atomic-writer-rollback-postcondition.sql');
    const assertionStart = sql.indexOf('DO $rollback_postcondition$');
    const diagnosticStart = sql.indexOf('SELECT pg_catalog.jsonb_build_object');

    expect(assertionStart).toBeGreaterThanOrEqual(0);
    expect(sql).toContain('RAISE EXCEPTION');
    expect(diagnosticStart).toBeGreaterThan(assertionStart);

    for (const functionName of [
      'pyra_create_task_atomic',
      'pyra_duplicate_task_atomic',
      'pyra_add_task_assignees_atomic',
      'pyra_remove_task_assignee_atomic',
      'pyra_mutate_task_label_atomic',
      'pyra_mutate_task_checklist_atomic',
      'pyra_advance_task_atomic',
      'pyra_move_task_atomic',
      'pyra_lock_task_assignee_write',
      'pyra_lock_task_write_entry',
      'pyra_create_board_atomic',
      'pyra_create_board_column_atomic',
      'pyra_update_board_columns_atomic',
      'pyra_delete_board_column_atomic',
    ]) {
      expect(sql.slice(assertionStart, diagnosticStart)).toContain(functionName);
    }

    for (const triggerName of [
      'trg_projects_task_write_entry',
      'trg_boards_task_write_entry',
      'trg_tasks_task_write_entry',
      'trg_task_assignees_write_entry',
      'trg_task_assignees_atomic_lock',
      'trg_board_columns_write_entry',
      'trg_task_stage_history_write_entry',
    ]) {
      expect(sql.slice(assertionStart, diagnosticStart)).toContain(triggerName);
    }

    for (const columnName of [
      'production_deadline_locked_at',
      'production_deadline_exempt',
      'task_created_at_snapshot',
      'assignees_snapshot',
    ]) {
      expect(sql.slice(assertionStart, diagnosticStart)).toContain(columnName);
    }

    for (const fixtureGroup of [
      'smoke_boards',
      'smoke_columns',
      'smoke_board_labels',
      'smoke_tasks',
      'smoke_assignees',
      'smoke_task_labels',
      'smoke_checklist',
      'smoke_activity',
      'smoke_stage_history',
    ]) {
      expect(sql.slice(assertionStart, diagnosticStart)).toContain(fixtureGroup);
    }
    expect(sql.slice(assertionStart, diagnosticStart)).toContain('idx_task_stage_history_from_column');
    expect(sql.slice(assertionStart, diagnosticStart)).toContain('idx_task_stage_history_to_column');
  });
});
