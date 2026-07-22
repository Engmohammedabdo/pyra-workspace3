import { describe, expect, it } from 'vitest';
import { categorizeMyTasksByDeadline } from '@/app/dashboard/my-tasks/my-tasks-client';

describe('my tasks unverified deadline categorization', () => {
  it('keeps a past migration deadline in a dedicated action-required bucket', () => {
    const legacy = {
      id: 'legacy',
      title: 'Legacy production task',
      _source: 'board_task' as const,
      due_date: '2026-07-21',
      due_at: '2026-07-21T19:59:59.999Z',
      production_deadline_exempt: true,
      pyra_board_columns: { is_done_column: false },
    };

    const result = categorizeMyTasksByDeadline(
      [legacy],
      '2026-07-22T08:00:00.000Z',
      '2026-07-22',
      '2026-07-25',
    );

    expect(result.unverified).toEqual([legacy]);
    expect(result.upcoming).toEqual([]);
    expect(result.overdue).toEqual([]);
  });
});
