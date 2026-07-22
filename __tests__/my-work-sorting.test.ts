import { describe, expect, it } from 'vitest';
import { categorizeMyWorkTasks, sortMyWorkTasks } from '@/lib/production/my-work';

const currentInstant = '2026-07-21T14:00:00.000000Z';

function task(
  id: string,
  dueAt: string,
  productionDeadlineExempt = false,
) {
  return {
    id,
    due_date: '2026-07-21',
    due_at: dueAt,
    production_deadline_exempt: productionDeadlineExempt,
    is_done_column: false,
  };
}

describe('my-work exact deadline sorting', () => {
  it('preserves PostgreSQL microseconds in the main consumer order', () => {
    const later = task('a-later', '2026-07-21T14:30:00.000002Z');
    const earlier = task('z-earlier', '2026-07-21T14:30:00.000001Z');
    expect(sortMyWorkTasks([later, earlier], currentInstant).map((row) => row.id))
      .toEqual(['z-earlier', 'a-later']);
  });

  it('preserves PostgreSQL microseconds inside categorized lists', () => {
    const later = task('a-later', '2026-07-21T14:30:00.000002Z');
    const earlier = task('z-earlier', '2026-07-21T14:30:00.000001Z');
    const categorized = categorizeMyWorkTasks(
      [later, earlier],
      currentInstant,
      '2026-07-21',
      '2026-07-25',
    );
    expect(categorized.today.map((row) => row.id)).toEqual(['z-earlier', 'a-later']);
  });

  it('never treats a provenance-marked legacy deadline as exact or overdue', () => {
    const legacy = task('legacy-flagged', '2026-07-21T19:59:59.999Z', true);
    const categorized = categorizeMyWorkTasks(
      [legacy],
      '2026-07-22T08:00:00.000Z',
      '2026-07-22',
      '2026-07-25',
    );

    expect(categorized.overdue).toEqual([]);
    expect(categorized.unverified).toEqual([legacy]);
    expect(sortMyWorkTasks([legacy], '2026-07-22T08:00:00.000Z')).toEqual([legacy]);
  });

  it('recognizes the literal migration sentinel even before the flag is backfilled', () => {
    const sentinel = task('legacy-literal', '2026-07-21T19:59:59.999Z', false);
    const categorized = categorizeMyWorkTasks(
      [sentinel],
      '2026-07-21T10:00:00.000Z',
      '2026-07-21',
      '2026-07-25',
    );

    expect(categorized.overdue).toEqual([]);
    expect(categorized.today).toEqual([]);
    expect(categorized.unverified).toEqual([sentinel]);
  });
});
