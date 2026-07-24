import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  const absolute = resolve(process.cwd(), path);
  expect(existsSync(absolute), `${path} must exist`).toBe(true);
  return readFileSync(absolute, 'utf8');
}

describe('atomic task review migration', () => {
  it('ships one service-only transaction with DB timestamps and structured rejection data', () => {
    const sql = read('supabase/migrations/043_atomic_task_review.sql');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.pyra_review_task_atomic');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.pyra_task_review_decisions');
    expect(sql).toContain('history_id varchar PRIMARY KEY');
    expect(sql).toContain('board_id varchar NOT NULL');
    expect(sql).toContain('INSERT INTO public.pyra_task_review_decisions');
    expect(sql).toContain('pg_catalog.hashtextextended(p_task_id, 42042)');
    expect(sql).toMatch(/ORDER BY c\.id[\s\S]+FOR UPDATE/);
    expect(sql).toContain('p_expected_column_id');
    expect(sql).toContain('p_expected_updated_at');
    expect(sql).toContain("p_rejection_kind NOT IN ('revision', 'outright')");
    expect(sql).toContain("pg_catalog.jsonb_build_object(");
    expect(sql).toContain(
      "'rejection_kind', CASE WHEN p_action = 'reject' THEN p_rejection_kind ELSE NULL END",
    );
    expect(sql).toMatch(/INSERT INTO public\.pyra_task_stage_history[\s\S]+created_at[\s\S]+v_decided_at/);
    expect(sql).toMatch(/INSERT INTO public\.pyra_task_comments[\s\S]+created_at[\s\S]+updated_at[\s\S]+v_decided_at/);
    expect(sql).toMatch(/INSERT INTO public\.pyra_task_activity[\s\S]+created_at[\s\S]+v_decided_at/);
    expect(sql).toContain('ON CONFLICT (task_id, username) DO NOTHING');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.pyra_review_task_atomic[\s\S]+FROM PUBLIC, anon, authenticated, service_role;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.pyra_review_task_atomic[\s\S]+TO service_role;/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.pyra_task_review_decisions[\s\S]+FROM PUBLIC, anon, authenticated, service_role;/);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.pyra_task_review_decisions TO service_role;/);
    expect(sql).not.toMatch(/GRANT[^;]*INSERT[^;]*pyra_task_review_decisions[^;]*TO service_role;/);
    expect(sql).toContain('REFERENCES public.pyra_task_stage_history(id)');
    expect(sql).toContain('REFERENCES public.pyra_task_activity(id)');
    expect(sql).toContain('REFERENCES public.pyra_task_comments(id)');
    expect(sql).toContain('pyra_validate_task_review_decision');
    expect(sql).toContain('pyra_guard_reviewed_production_delete');
    expect(sql).toContain('PYRA_PRODUCTION_REVIEW_DELETE_BLOCKED');
    expect(sql).not.toMatch(/nextCol\.name|معتمد/);
  });

  it('ships a read-only catalog verifier', () => {
    const sql = read('scripts/sql/verify-043-atomic-task-review.sql');
    expect(sql).toContain('pyra_review_task_atomic');
    expect(sql).toContain('service_role');
    expect(sql).toContain('authenticated');
    expect(sql).toContain('ck_task_activity_rejection_kind');
    expect(sql).toContain("has_table_privilege('service_role', 'public.pyra_task_review_decisions', 'SELECT')");
    for (const privilege of ['INSERT', 'UPDATE', 'DELETE']) {
      expect(sql).toContain(
        `has_table_privilege('service_role', 'public.pyra_task_review_decisions', '${privilege}')`,
      );
      expect(sql).toContain(
        `has_table_privilege('anon', 'public.pyra_task_review_decisions', '${privilege}')`,
      );
      expect(sql).toContain(
        `has_table_privilege('authenticated', 'public.pyra_task_review_decisions', '${privilege}')`,
      );
    }
    expect(sql).toContain('acl.grantee = 0');
    expect(sql).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE)\b/im);
  });

  it('takes the shared global writer lock before the per-task lock', () => {
    const sql = read('supabase/migrations/043_atomic_task_review.sql');
    const functionStart = sql.indexOf(
      'CREATE OR REPLACE FUNCTION public.pyra_review_task_atomic',
    );
    const globalLock = sql.indexOf(
      "hashtextextended('pyra_task_assignees', 42042)",
      functionStart,
    );
    const taskLock = sql.indexOf('hashtextextended(p_task_id, 42042)', functionStart);

    expect(functionStart).toBeGreaterThanOrEqual(0);
    expect(globalLock).toBeGreaterThan(functionStart);
    expect(taskLock).toBeGreaterThan(globalLock);
  });

  it('never schema-qualifies SQL special forms in migration or verifier', () => {
    for (const path of [
      'supabase/migrations/043_atomic_task_review.sql',
      'scripts/sql/verify-043-atomic-task-review.sql',
    ]) {
      expect(read(path)).not.toMatch(/\bpg_catalog\.(?:coalesce|greatest|least)\s*\(/i);
    }
  });

  it('makes the verifier fail closed on every exact review-writer column and write', () => {
    const sql = read('scripts/sql/verify-043-atomic-task-review.sql');

    expect(sql).toContain('information_schema.columns');
    for (const table of [
      'pyra_boards',
      'pyra_board_columns',
      'pyra_tasks',
      'pyra_task_stage_history',
      'pyra_task_assignees',
      'pyra_task_comments',
      'pyra_task_activity',
      'pyra_task_review_decisions',
    ]) {
      expect(sql).toContain(table);
    }
    for (const column of [
      'updated_at',
      'stage_entered_at',
      'completion_percentage',
      'from_column_id',
      'to_column_id',
      'approved_by',
      'author_username',
      'author_name',
      'content',
      'details',
      'created_at',
    ]) {
      expect(sql).toContain(column);
    }
    for (const write of [
      'UPDATE public.pyra_tasks',
      'INSERT INTO public.pyra_task_stage_history',
      'INSERT INTO public.pyra_task_comments',
      'INSERT INTO public.pyra_task_activity',
      'INSERT INTO public.pyra_task_review_decisions',
    ]) {
      expect(sql).toContain(write);
    }
    expect(sql).toContain("hashtextextended('pyra_task_assignees', 42042)");
    expect(sql).toContain('hashtextextended(p_task_id, 42042)');
  });

  it('ships rollback-only runtime smoke and postcondition coverage', () => {
    const smoke = read('.superpowers/sdd/task4-review-rollback-smoke.sql');
    const postcondition = read('.superpowers/sdd/task4-review-rollback-postcondition.sql');

    for (const status of ['ok', 'invalid_review_input', 'transition_conflict']) {
      expect(smoke).toContain(`'${status}'`);
    }
    for (const artifact of [
      'stage_rejected',
      'stage_approved',
      "'rejection_kind', 'outright'",
      'pyra_task_stage_history',
      'pyra_task_comments',
      'pyra_task_activity',
      'pyra_task_review_decisions',
      'unique_violation',
      'PYRA_PRODUCTION_REVIEW_DELETE_BLOCKED',
      "has_table_privilege('service_role', 'public.pyra_task_review_decisions', 'INSERT')",
    ]) {
      expect(smoke).toContain(artifact);
    }
    expect(postcondition).toContain('pyra_review_task_atomic');
    expect(postcondition).toContain('ck_task_activity_rejection_kind');
    for (const fixtureGroup of [
      'smoke_boards',
      'smoke_columns',
      'smoke_tasks',
      'smoke_assignees',
      'smoke_comments',
      'smoke_activity',
      'smoke_stage_history',
      'smoke_review_decisions',
    ]) {
      expect(postcondition).toContain(fixtureGroup);
    }
  });
});
