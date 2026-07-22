import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readRepoFile(path: string): string {
  const absolutePath = resolve(repoRoot, path);
  expect(existsSync(absolutePath), `${path} must exist`).toBe(true);
  return readFileSync(absolutePath, 'utf8');
}

function functionBody(sql: string, name: string, nextName: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nextName}`, start + 1);
  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
  expect(end, `${nextName} must follow ${name}`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe('atomic board-writer migration', () => {
  it('defines the four exact service-role-only SECURITY INVOKER RPC signatures', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const verifier = readRepoFile('scripts/sql/verify-042-atomic-task-transitions.sql');
    const contracts = [
      {
        name: 'pyra_create_board_atomic',
        args: 'varchar, varchar, text, varchar, text, varchar, boolean, boolean, varchar, jsonb, jsonb',
        regprocedure: 'character varying,character varying,text,character varying,text,character varying,boolean,boolean,character varying,jsonb,jsonb',
        returns: 'RETURNS TABLE(status text, board jsonb, mutation jsonb)',
      },
      {
        name: 'pyra_create_board_column_atomic',
        args: 'varchar, varchar, varchar, varchar, integer',
        regprocedure: 'character varying,character varying,character varying,character varying,integer',
        returns: 'RETURNS TABLE(status text, board_column jsonb, mutation jsonb)',
      },
      {
        name: 'pyra_update_board_columns_atomic',
        args: 'varchar, jsonb',
        regprocedure: 'character varying,jsonb',
        returns: 'RETURNS TABLE(status text, mutation jsonb)',
      },
      {
        name: 'pyra_delete_board_column_atomic',
        args: 'varchar, varchar',
        regprocedure: 'character varying,character varying',
        returns: 'RETURNS TABLE(status text, mutation jsonb)',
      },
    ];

    for (const contract of contracts) {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${contract.name}`);
      const next = sql.indexOf('CREATE OR REPLACE FUNCTION public.', start + 1);
      const body = sql.slice(start, next);
      expect(start, contract.name).toBeGreaterThanOrEqual(0);
      expect(body).toContain(contract.returns);
      expect(body).toContain('SECURITY INVOKER');
      expect(body).toContain("SET search_path = ''");
      expect(sql).toContain(
        `REVOKE ALL ON FUNCTION public.${contract.name}(${contract.args}) FROM PUBLIC, anon, authenticated, service_role;`,
      );
      expect(sql).toContain(
        `GRANT EXECUTE ON FUNCTION public.${contract.name}(${contract.args}) TO service_role;`,
      );
      expect(verifier).toContain(`public.${contract.name}(${contract.regprocedure})`);
    }
  });

  it('creates the board, every column, and every label in one conflict-safe RPC', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const body = functionBody(
      sql,
      'pyra_create_board_atomic',
      'pyra_create_board_column_atomic',
    );
    const globalLock = body.indexOf("hashtextextended('pyra_task_assignees', 42042)");
    const projectValidation = body.indexOf('FROM public.pyra_projects AS p');
    const boardInsert = body.indexOf('INSERT INTO public.pyra_boards');

    expect(globalLock).toBeGreaterThanOrEqual(0);
    expect(projectValidation).toBeGreaterThan(globalLock);
    expect(boardInsert).toBeGreaterThan(projectValidation);
    expect(body).toContain('INSERT INTO public.pyra_board_columns');
    expect(body).toContain('INSERT INTO public.pyra_board_labels');
    expect(body).toContain('jsonb_to_recordset');
    expect(body).toContain("jsonb_typeof(v_columns) IS DISTINCT FROM 'array'");
    expect(body).toContain("jsonb_typeof(v_labels) IS DISTINCT FROM 'array'");
    expect(body).toMatch(/EXCEPTION[\s\S]+WHEN unique_violation THEN[\s\S]+'write_conflict'/);
    expect(body).toContain("'columns_created'");
    expect(body).toContain("'labels_created'");
  });

  it('serializes column create through global, board, and stable column locks', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const body = functionBody(
      sql,
      'pyra_create_board_column_atomic',
      'pyra_update_board_columns_atomic',
    );
    const globalLock = body.indexOf("hashtextextended('pyra_task_assignees', 42042)");
    const boardLock = body.indexOf('FROM public.pyra_boards AS b');
    const columnsLock = body.indexOf('FROM public.pyra_board_columns AS c');
    const insert = body.indexOf('INSERT INTO public.pyra_board_columns');

    expect(globalLock).toBeGreaterThanOrEqual(0);
    expect(boardLock).toBeGreaterThan(globalLock);
    expect(body.slice(boardLock, columnsLock)).toContain('FOR UPDATE');
    expect(columnsLock).toBeGreaterThan(boardLock);
    expect(body.slice(columnsLock, insert)).toMatch(/ORDER BY c\.id[\s\S]+FOR UPDATE/);
    expect(insert).toBeGreaterThan(columnsLock);
    expect(body).toContain("'created'");
  });

  it('validates duplicate and foreign batch members before one set-based optional-field update', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const body = functionBody(
      sql,
      'pyra_update_board_columns_atomic',
      'pyra_delete_board_column_atomic',
    );
    const globalLock = body.indexOf("hashtextextended('pyra_task_assignees', 42042)");
    const boardLock = body.indexOf('FROM public.pyra_boards AS b');
    const columnsLock = body.indexOf('FROM public.pyra_board_columns AS c');
    const duplicateCheck = body.indexOf('count(DISTINCT');
    const membershipCheck = body.indexOf("'column_not_in_board'");
    const update = body.indexOf('UPDATE public.pyra_board_columns');

    expect(globalLock).toBeGreaterThanOrEqual(0);
    expect(boardLock).toBeGreaterThan(globalLock);
    expect(columnsLock).toBeGreaterThan(boardLock);
    expect(body.slice(columnsLock, duplicateCheck)).toMatch(/ORDER BY c\.id[\s\S]+FOR UPDATE/);
    expect(duplicateCheck).toBeGreaterThan(columnsLock);
    expect(membershipCheck).toBeGreaterThan(duplicateCheck);
    expect(update).toBeGreaterThan(membershipCheck);
    expect(body.match(/UPDATE public\.pyra_board_columns/g)).toHaveLength(1);
    expect(body).not.toMatch(/\bLOOP\b/);
    expect(body).toContain("item ? 'position'");
    expect(body).toContain("item ? 'name'");
    expect(body).toContain("item ? 'color'");
    expect(body).toContain("'updated_count'");
  });

  it('deletes only an empty column with no archived task or from/to history evidence', () => {
    const sql = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const body = functionBody(
      sql,
      'pyra_delete_board_column_atomic',
      'pyra_lock_task_write_entry',
    );
    const globalLock = body.indexOf("hashtextextended('pyra_task_assignees', 42042)");
    const boardLock = body.indexOf('FROM public.pyra_boards AS b');
    const columnsLock = body.indexOf('FROM public.pyra_board_columns AS c');
    const taskCount = body.indexOf('FROM public.pyra_tasks AS t');
    const historyCount = body.indexOf('FROM public.pyra_task_stage_history AS h');
    const deletion = body.indexOf('DELETE FROM public.pyra_board_columns');

    expect(globalLock).toBeGreaterThanOrEqual(0);
    expect(boardLock).toBeGreaterThan(globalLock);
    expect(columnsLock).toBeGreaterThan(boardLock);
    expect(body.slice(columnsLock, taskCount)).toMatch(/ORDER BY c\.id[\s\S]+FOR UPDATE/);
    expect(taskCount).toBeGreaterThan(columnsLock);
    expect(historyCount).toBeGreaterThan(taskCount);
    expect(deletion).toBeGreaterThan(historyCount);
    expect(body).not.toContain('is_archived');
    expect(body).toContain('h.from_column_id = p_column_id');
    expect(body).toContain('h.to_column_id = p_column_id');
    expect(body).toContain("'column_has_tasks'");
    expect(body).toContain("'column_has_history'");
    for (const countKey of [
      'task_count',
      'history_count',
      'from_history_count',
      'to_history_count',
    ]) {
      expect(body).toContain(`'${countKey}'`);
    }
  });

  it('adds history lookup indexes and six exact statement-entry lock triggers in 042 and 044', () => {
    const sql042 = readRepoFile('supabase/migrations/042_atomic_task_transitions.sql');
    const sql044 = readRepoFile('supabase/migrations/044_harden_production_evidence.sql');
    const verifier042 = readRepoFile('scripts/sql/verify-042-atomic-task-transitions.sql');
    const verifier044 = readRepoFile('scripts/sql/verify-044-production-evidence.sql');

    expect(sql042).toMatch(/CREATE INDEX IF NOT EXISTS idx_task_stage_history_from_column[\s\S]+ON public\.pyra_task_stage_history\(from_column_id\)[\s\S]+WHERE from_column_id IS NOT NULL;/);
    expect(sql042).toMatch(/CREATE INDEX IF NOT EXISTS idx_task_stage_history_to_column[\s\S]+ON public\.pyra_task_stage_history\(to_column_id\);/);

    const triggers = [
      ['trg_projects_task_write_entry', 'pyra_projects', 'DELETE'],
      ['trg_boards_task_write_entry', 'pyra_boards', 'INSERT OR UPDATE OR DELETE'],
      ['trg_tasks_task_write_entry', 'pyra_tasks', 'INSERT OR UPDATE OR DELETE'],
      ['trg_task_assignees_write_entry', 'pyra_task_assignees', 'INSERT OR UPDATE OR DELETE'],
      ['trg_board_columns_write_entry', 'pyra_board_columns', 'INSERT OR UPDATE OR DELETE'],
      ['trg_task_stage_history_write_entry', 'pyra_task_stage_history', 'INSERT OR UPDATE OR DELETE'],
    ] as const;

    for (const migration of [sql042, sql044]) {
      for (const [triggerName, tableName, events] of triggers) {
        expect(migration).toMatch(new RegExp(
          `CREATE TRIGGER ${triggerName}[\\s\\S]+BEFORE ${events} ON public\\.${tableName}[\\s\\S]+FOR EACH STATEMENT[\\s\\S]+EXECUTE FUNCTION public\\.pyra_lock_task_write_entry\\(\\);`,
        ));
      }
    }

    for (const verifier of [verifier042, verifier044]) {
      expect(verifier).toContain('idx_task_stage_history_from_column');
      expect(verifier).toContain('idx_task_stage_history_to_column');
      expect(verifier).toContain("('pyra_boards', 'trg_boards_task_write_entry', 30::smallint)");
      expect(verifier).toContain("('pyra_tasks', 'trg_tasks_task_write_entry', 30::smallint)");
      expect(verifier).toContain("('pyra_board_columns', 'trg_board_columns_write_entry', 30::smallint)");
      expect(verifier).toContain("('pyra_task_stage_history', 'trg_task_stage_history_write_entry', 30::smallint)");
      expect(verifier).toContain('IS DISTINCT FROM 6');
    }
  });
});
