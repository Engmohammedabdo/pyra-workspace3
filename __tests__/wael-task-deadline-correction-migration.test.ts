import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/049_correct_wael_task_deadlines.sql'),
  'utf8',
);

describe('Wael exact-deadline owner correction migration', () => {
  it('targets only the two owner-confirmed task ids and exact Dubai instants', () => {
    expect(migration).toContain(
      "task.id IN ('tk_nRfrQhPIyrEPFeZo', 'tk_WT5YlHFDv7Y_Svs5')",
    );
    expect(migration).toContain("timestamptz '2026-07-20 18:00:00+04'");
    expect(migration).toContain("timestamptz '2026-07-21 18:00:00+04'");
    expect(migration).toContain('production_deadline_exempt = false');
  });

  it('fails closed when identity, ownership, or the observed legacy state changed', () => {
    expect(migration).toContain("task.title = '4 marketing Hacks'");
    expect(migration).toContain("task.title = 'فيديو مريم'");
    expect(migration).toContain("assignee.username = 'wael.hany'");
    expect(migration).toContain("task.column_id IS DISTINCT FROM 'col_prod_wip'");
    expect(migration).toContain('production_deadline_locked_at IS NULL');
    expect(migration).toContain('Migration 049 stopped: task ownership, board, lock, column, or prior deadline changed');
  });

  it('suspends the immutable trigger narrowly and restores it before commit', () => {
    const disable = migration.indexOf(
      'DISABLE TRIGGER trg_tasks_production_deadline_immutable',
    );
    const update = migration.indexOf('UPDATE public.pyra_tasks AS task');
    const enable = migration.indexOf(
      'ENABLE TRIGGER trg_tasks_production_deadline_immutable',
    );
    const commit = migration.indexOf('COMMIT;');

    expect(disable).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(disable);
    expect(enable).toBeGreaterThan(update);
    expect(commit).toBeGreaterThan(enable);
    expect(migration).toContain('production deadline guard was not restored');
  });

  it('adds an idempotent audit entry without rewriting prior stage history', () => {
    expect(migration).toContain("'deadline_corrected'");
    expect(migration).toContain("'owner_deadline_correction_2026_07_22'");
    expect(migration).toContain('ON CONFLICT (id) DO NOTHING');
    expect(migration).not.toMatch(/UPDATE\s+public\.pyra_task_stage_history/i);
  });
});
