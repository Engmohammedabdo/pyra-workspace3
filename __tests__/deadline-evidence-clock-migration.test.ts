import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('migration 045 evidence clock hardening', () => {
  it('separates database evidence time from monotonic CAS versions in every stage writer', () => {
    const sql = readFileSync(resolve(
      process.cwd(),
      'supabase/migrations/045_production_evidence_clock.sql',
    ), 'utf8');

    expect(sql).toContain('Depends on migration 042');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.pyra_advance_task_atomic');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.pyra_move_task_atomic');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.pyra_review_task_atomic');
    expect(sql.match(/v_evidence_at timestamptz := pg_catalog\.clock_timestamp\(\)/g)).toHaveLength(3);
    expect(sql.match(/created_at,?[\s\S]{0,500}v_evidence_at/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(sql).toMatch(/decided_at[\s\S]{0,500}v_evidence_at/);
    expect(sql).toContain('v_version_at');
  });

  it('preserves the function-only review boundary established by migration 043', () => {
    const sql = readFileSync(resolve(
      process.cwd(),
      'supabase/migrations/045_production_evidence_clock.sql',
    ), 'utf8');
    const reviewStart = sql.indexOf(
      'CREATE OR REPLACE FUNCTION public.pyra_review_task_atomic',
    );
    const reviewEnd = sql.indexOf(
      '\nREVOKE ALL ON FUNCTION public.pyra_advance_task_atomic',
      reviewStart,
    );
    const reviewSql = sql.slice(reviewStart, reviewEnd);

    expect(reviewStart).toBeGreaterThanOrEqual(0);
    expect(reviewEnd).toBeGreaterThan(reviewStart);
    expect(reviewSql).toContain('SECURITY DEFINER');
    expect(reviewSql).not.toContain('SECURITY INVOKER');

    const commentInsert = reviewSql.indexOf(
      'INSERT INTO public.pyra_task_comments',
    );
    const activityInsert = reviewSql.indexOf(
      'INSERT INTO public.pyra_task_activity',
    );
    const decisionInsert = reviewSql.indexOf(
      'INSERT INTO public.pyra_task_review_decisions',
    );

    expect(commentInsert).toBeGreaterThanOrEqual(0);
    expect(activityInsert).toBeGreaterThan(commentInsert);
    expect(decisionInsert).toBeGreaterThan(activityInsert);
  });
});
