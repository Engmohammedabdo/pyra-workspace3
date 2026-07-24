import { describe, expect, it } from 'vitest';
import {
  compareBoardTaskDeadlines,
  formatBoardTaskDeadline,
  getBoardTaskDeadline,
  hasMatchingExactBoardTaskDeadline,
  isBoardTaskDeadlineOverdue,
} from '@/hooks/useBoardTasks';
import { applyFilters, EMPTY_FILTERS } from '@/components/boards/board-toolbar';

describe('board deadline UI helpers', () => {
  it('uses the exact production instant and converts it to Dubai wall time', () => {
    expect(getBoardTaskDeadline({
      due_date: '2026-07-21',
      due_at: '2026-07-21T14:30:00.000Z',
    })).toEqual({
      date: '2026-07-21',
      time: '18:30',
      exact: true,
      instant: '2026-07-21T14:30:00.000Z',
    });
  });

  it('uses a date-only deadline only when no exact timestamp is present', () => {
    expect(getBoardTaskDeadline({ due_date: '2026-07-21', due_at: null })).toEqual({
      date: '2026-07-21',
      time: null,
      exact: false,
      instant: '2026-07-21T19:59:59.999Z',
    });
  });

  it('does not guess from due_date when a present exact timestamp is invalid', () => {
    expect(getBoardTaskDeadline({ due_date: '2026-07-21', due_at: 'invalid' })).toBeNull();
  });

  it('never presents or evaluates a migration-generated legacy time as exact', () => {
    const task = {
      due_date: '2026-07-21',
      due_at: '2026-07-21T19:59:59.999Z',
      production_deadline_exempt: true,
    };

    expect(getBoardTaskDeadline(task)).toEqual({
      date: '2026-07-21',
      time: null,
      exact: false,
      instant: null,
      unverified: true,
    });
    expect(isBoardTaskDeadlineOverdue(task, new Date('2026-07-22T00:00:00.000Z'))).toBe(false);
    expect(hasMatchingExactBoardTaskDeadline(task)).toBe(false);
  });

  it('recognizes the migration sentinel before the exemption backfill is applied', () => {
    const task = {
      due_date: '2026-07-21',
      due_at: '2026-07-21T19:59:59.999Z',
      production_deadline_exempt: false,
    };
    expect(getBoardTaskDeadline(task)).toMatchObject({
      date: '2026-07-21',
      time: null,
      exact: false,
      instant: null,
      unverified: true,
    });
    expect(hasMatchingExactBoardTaskDeadline(task)).toBe(false);
  });

  it('preserves unverified provenance while formatting a migration-generated deadline', () => {
    expect(formatBoardTaskDeadline({
      due_date: '2026-07-21',
      due_at: '2026-07-21T19:59:59.999Z',
      production_deadline_exempt: true,
    }, 'en')).toEqual({
      date: '21 Jul',
      time: null,
      unverified: true,
    });
  });

  it('keeps a known unverified task visible even when the legacy row has no date', () => {
    const task = {
      due_date: null,
      due_at: null,
      production_deadline_exempt: true,
    };

    expect(getBoardTaskDeadline(task)).toEqual({
      date: null,
      time: null,
      exact: false,
      instant: null,
      unverified: true,
    });
    expect(formatBoardTaskDeadline(task, 'en')).toEqual({
      date: null,
      time: null,
      unverified: true,
    });
    expect(isBoardTaskDeadlineOverdue(task, new Date('2026-07-22T00:00:00.000Z'))).toBe(false);
  });

  it('marks verified formatted deadlines explicitly as verified', () => {
    expect(formatBoardTaskDeadline({
      due_date: '2026-07-21',
      due_at: '2026-07-21T14:30:00.000Z',
    }, 'en')).toMatchObject({
      unverified: false,
      time: '18:30',
    });
  });

  it('treats the exact deadline instant as on time and the next millisecond as overdue', () => {
    const task = { due_at: '2026-07-21T14:30:00.000Z' };
    expect(isBoardTaskDeadlineOverdue(task, new Date('2026-07-21T14:30:00.000Z'))).toBe(false);
    expect(isBoardTaskDeadlineOverdue(task, new Date('2026-07-21T14:30:00.001Z'))).toBe(true);
  });

  it('never marks a task in a done column as overdue', () => {
    const task = { due_at: '2026-07-21T14:30:00.000Z' };
    expect(
      isBoardTaskDeadlineOverdue(task, new Date('2026-07-21T14:30:00.001Z'), true),
    ).toBe(false);
  });

  it('sorts exact instants before later legacy day-end deadlines and missing values last', () => {
    const exact = { due_at: '2026-07-21T14:30:00.000Z' };
    const legacy = { due_date: '2026-07-21', due_at: null };
    const missing = { due_date: null, due_at: null };
    expect(compareBoardTaskDeadlines(exact, legacy)).toBeLessThan(0);
    expect(compareBoardTaskDeadlines(legacy, missing)).toBeLessThan(0);
  });

  it('preserves PostgreSQL microseconds when sorting exact board deadlines', () => {
    const later = { due_at: '2026-07-21T14:30:00.000002Z' };
    const earlier = { due_at: '2026-07-21T14:30:00.000001Z' };
    expect(compareBoardTaskDeadlines(earlier, later)).toBe(-1);

    const sorted = applyFilters(
      [
        { id: 'later', title: 'Later', priority: 'medium', column_id: 'working', position: 0, ...later },
        { id: 'earlier', title: 'Earlier', priority: 'medium', column_id: 'working', position: 1, ...earlier },
      ],
      { ...EMPTY_FILTERS, sortBy: 'due_date' },
      'en',
    );
    expect(sorted.map((task) => task.id)).toEqual(['earlier', 'later']);
  });

  it('accepts a source exact deadline only when its Dubai date matches due_date', async () => {
    const helpers = await import('@/hooks/useBoardTasks') as unknown as {
      hasMatchingExactBoardTaskDeadline?: (task: {
        due_date?: string | null;
        due_at?: string | null;
      }) => boolean;
    };
    expect(helpers.hasMatchingExactBoardTaskDeadline).toBeTypeOf('function');

    const hasMatchingExactDeadline = helpers.hasMatchingExactBoardTaskDeadline!;
    expect(hasMatchingExactDeadline({
      due_date: '2026-07-21',
      due_at: '2026-07-21T14:30:00.000Z',
    })).toBe(true);
    expect(hasMatchingExactDeadline({
      due_date: '2026-07-20',
      due_at: '2026-07-21T14:30:00.000Z',
    })).toBe(false);
    expect(hasMatchingExactDeadline({
      due_date: null,
      due_at: '2026-07-21T14:30:00.000Z',
    })).toBe(false);
  });

  it('keeps locked deadlines immutable and prompts only when a production transfer lacks a matching exact deadline', async () => {
    const helpers = await import('@/hooks/useBoardTasks') as unknown as {
      canSubmitProductionDeadlineUpdate?: (
        task: { deadline_locked?: boolean },
        date: string,
        time: string,
      ) => boolean;
      needsProductionDeadlineOnTransfer?: (
        targetBoardId: string,
        task: { due_date?: string | null; due_at?: string | null },
      ) => boolean;
    };
    expect(helpers.canSubmitProductionDeadlineUpdate).toBeTypeOf('function');
    expect(helpers.needsProductionDeadlineOnTransfer).toBeTypeOf('function');

    expect(helpers.canSubmitProductionDeadlineUpdate!({ deadline_locked: true }, '2026-07-21', '18:30'))
      .toBe(false);
    expect(helpers.canSubmitProductionDeadlineUpdate!({ deadline_locked: false }, '2026-07-21', ''))
      .toBe(false);
    expect(helpers.canSubmitProductionDeadlineUpdate!({ deadline_locked: false }, '2026-07-21', '18:30'))
      .toBe(true);

    const matchingDeadline = {
      due_date: '2026-07-21',
      due_at: '2026-07-21T14:30:00.000Z',
    };
    expect(helpers.needsProductionDeadlineOnTransfer!('bd_production', matchingDeadline)).toBe(false);
    expect(helpers.needsProductionDeadlineOnTransfer!('bd_production', {
      ...matchingDeadline,
      due_date: '2026-07-20',
    })).toBe(true);
    expect(helpers.needsProductionDeadlineOnTransfer!('bd_general', {
      due_date: null,
      due_at: null,
    })).toBe(false);
  });

  it('builds quick-add and calendar drafts without guessing a production time', async () => {
    type Draft = {
      columnId: string;
      title: string;
      priority: string;
      dueDate: string;
      dueTime: string;
      assignees: string[];
    };
    const helpers = await import('@/hooks/useBoardTasks') as unknown as {
      buildBoardTaskCreateDraft?: (columnId: string, title?: string, dueDate?: string) => Draft;
      canSubmitBoardTaskCreateDraft?: (draft: Draft, isProductionBoard: boolean) => boolean;
    };
    expect(helpers.buildBoardTaskCreateDraft).toBeTypeOf('function');
    expect(helpers.canSubmitBoardTaskCreateDraft).toBeTypeOf('function');

    const quickAdd = helpers.buildBoardTaskCreateDraft!('col-1', 'Video');
    expect(quickAdd).toMatchObject({ title: 'Video', dueDate: '', dueTime: '' });
    expect(helpers.canSubmitBoardTaskCreateDraft!(quickAdd, true)).toBe(false);

    const calendarAdd = helpers.buildBoardTaskCreateDraft!('col-1', '', '2026-07-23');
    expect(calendarAdd).toMatchObject({ dueDate: '2026-07-23', dueTime: '' });
    expect(helpers.canSubmitBoardTaskCreateDraft!({ ...calendarAdd, title: 'Video' }, true)).toBe(false);
    expect(helpers.canSubmitBoardTaskCreateDraft!({
      ...calendarAdd,
      title: 'Video',
      dueTime: '18:30',
    }, true)).toBe(true);
  });

  it('excludes done-column tasks from the overdue filter at the shared instant', () => {
    const tasks = [
      {
        id: 'open', title: 'Open', priority: 'high', column_id: 'working', position: 0,
        due_at: '2026-07-21T10:00:00.000Z',
      },
      {
        id: 'done', title: 'Done', priority: 'high', column_id: 'delivered', position: 1,
        due_at: '2026-07-21T10:00:00.000Z',
      },
    ];
    const filtered = applyFilters(
      tasks,
      { ...EMPTY_FILTERS, dueDateFilter: 'overdue' },
      'en',
      new Date('2026-07-21T10:00:00.001Z'),
      new Set(['delivered']),
    );
    expect(filtered.map(task => task.id)).toEqual(['open']);
  });
});
