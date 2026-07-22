import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PRODUCTION_ATTRIBUTION_STATUS, PRODUCTION_BOARD_ID } from '@/lib/constants/production';
import {
  computeProductivity,
  computeProductivityTrends,
  fetchAllProductivityPages,
} from '@/lib/production/report';

type Row = Record<string, unknown>;

function fakeSupabase(tables: Record<string, Row[]>): SupabaseClient {
  return {
    from(table: string) {
      let rows = [...(tables[table] || [])];
      const query = {
        select() { return query; },
        eq(column: string, value: unknown) {
          rows = rows.filter((row) => row[column] === value);
          return query;
        },
        in(column: string, values: unknown[]) {
          rows = rows.filter((row) => values.includes(row[column]));
          return query;
        },
        gte(column: string, value: unknown) {
          rows = rows.filter((row) => String(row[column]) >= String(value));
          return query;
        },
        lte(column: string, value: unknown) {
          rows = rows.filter((row) => String(row[column]) <= String(value));
          return query;
        },
        order(column: string) {
          rows.sort((left, right) => String(left[column]).localeCompare(String(right[column])));
          return query;
        },
        async range(from: number, to: number) {
          return { data: rows.slice(from, to + 1), error: null };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

describe('productivity report pagination', () => {
  it('continues until a short page so row caps cannot silently truncate evidence', async () => {
    const page = vi.fn(async (from: number, to: number) => ({
      data: [0, 1, 2, 3, 4].slice(from, to + 1),
      error: null,
    }));

    await expect(fetchAllProductivityPages(page, 2, 'test rows')).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(page.mock.calls).toEqual([[0, 1], [2, 3], [4, 5]]);
  });

  it('fails closed instead of returning a partial report after any page error', async () => {
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: ['first page'], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'history read failed' } });

    await expect(fetchAllProductivityPages(page, 1, 'production history'))
      .rejects.toThrow('production history: history read failed');
  });

  it('uses production history snapshots and never current assignees for reviewed attribution', async () => {
    const client = fakeSupabase({
      pyra_boards: [{ id: PRODUCTION_BOARD_ID }, { id: 'bd_other' }],
      pyra_board_columns: [
        { id: 'review', board_id: PRODUCTION_BOARD_ID, column_type: 'review', is_done_column: false, position: 1 },
        { id: 'done', board_id: PRODUCTION_BOARD_ID, column_type: 'done', is_done_column: true, position: 2 },
      ],
      pyra_task_stage_history: [
        {
          id: 'history-verified',
          task_id: 'reviewed-verified',
          board_id: PRODUCTION_BOARD_ID,
          from_column_id: 'work',
          to_column_id: 'review',
          created_at: '2026-07-10T10:00:00.000001Z',
          due_at_snapshot: '2026-07-10T10:00:00.000000Z',
          task_created_at_snapshot: '2026-07-01T08:00:00.000000Z',
          assignees_snapshot: ['snapshot.user', 'missing.one', 'missing.two'],
        },
        {
          id: 'history-legacy',
          task_id: 'reviewed-legacy',
          board_id: PRODUCTION_BOARD_ID,
          from_column_id: 'work',
          to_column_id: 'review',
          created_at: '2026-07-10T09:00:00.000000Z',
          due_at_snapshot: '2026-07-10T10:00:00.000000Z',
          task_created_at_snapshot: null,
          assignees_snapshot: null,
        },
        {
          id: 'history-rejected',
          task_id: 'reviewed-verified',
          board_id: PRODUCTION_BOARD_ID,
          from_column_id: 'review',
          to_column_id: 'work',
          created_at: '2026-07-10T11:00:00.000000Z',
          due_at_snapshot: '2026-07-10T10:00:00.000000Z',
          task_created_at_snapshot: '2026-07-01T08:00:00.000000Z',
          assignees_snapshot: ['snapshot.user'],
        },
        {
          id: 'history-verified-resubmitted',
          task_id: 'reviewed-verified',
          board_id: PRODUCTION_BOARD_ID,
          from_column_id: 'work',
          to_column_id: 'review',
          created_at: '2026-07-10T12:00:00.000000Z',
          due_at_snapshot: '2026-07-10T10:00:00.000000Z',
          task_created_at_snapshot: '2026-07-01T08:00:00.000000Z',
          assignees_snapshot: ['snapshot.user'],
        },
        {
          id: 'history-approved',
          task_id: 'reviewed-verified',
          board_id: PRODUCTION_BOARD_ID,
          from_column_id: 'review',
          to_column_id: 'done',
          created_at: '2026-07-10T13:00:00.000000Z',
          due_at_snapshot: '2026-07-10T10:00:00.000000Z',
          task_created_at_snapshot: '2026-07-01T08:00:00.000000Z',
          assignees_snapshot: ['snapshot.user'],
        },
        {
          id: 'history-other-board',
          task_id: 'other-task',
          board_id: 'bd_other',
          from_column_id: 'work',
          to_column_id: 'review',
          created_at: '2026-07-10T09:00:00.000000Z',
          task_created_at_snapshot: '2026-07-01T08:00:00.000000Z',
          assignees_snapshot: ['other.user'],
        },
      ],
      pyra_task_review_decisions: [
        {
          history_id: 'history-rejected',
          task_id: 'reviewed-verified',
          board_id: PRODUCTION_BOARD_ID,
          action: 'reject',
          rejection_kind: 'outright',
          decided_at: '2026-07-10T11:00:00.000000Z',
        },
        {
          history_id: 'history-approved',
          task_id: 'reviewed-verified',
          board_id: PRODUCTION_BOARD_ID,
          action: 'approve',
          rejection_kind: null,
          decided_at: '2026-07-10T13:00:00.000000Z',
        },
        {
          history_id: 'history-rejected',
          task_id: 'reviewed-verified',
          board_id: 'bd_other',
          action: 'reject',
          rejection_kind: 'OUTRIGHT',
          decided_at: '2026-07-10T11:00:00.000000Z',
        },
      ],
      pyra_tasks: [
        {
          id: 'reviewed-verified',
          title: 'Verified reviewed task',
          board_id: 'bd_other',
          due_date: '2026-07-10',
          due_at: '2026-07-10T10:00:00.000000Z',
          created_at: '2026-07-02T08:00:00.000000Z',
          is_archived: false,
          production_deadline_exempt: false,
          pyra_task_assignees: [{ username: 'current.user' }],
        },
        {
          id: 'reviewed-legacy',
          title: 'Legacy reviewed task',
          board_id: 'bd_other',
          due_date: '2026-07-10',
          due_at: '2026-07-10T10:00:00.000000Z',
          created_at: '2026-07-01T08:00:00.000000Z',
          is_archived: false,
          production_deadline_exempt: false,
          pyra_task_assignees: [{ username: 'current.user' }],
        },
        {
          id: 'open-current',
          title: 'Open production task',
          board_id: PRODUCTION_BOARD_ID,
          due_date: '2099-07-10',
          due_at: '2099-07-10T10:00:00.000000Z',
          created_at: '2026-07-01T08:00:00.000000Z',
          is_archived: false,
          production_deadline_exempt: false,
          pyra_task_assignees: [
            { username: 'current.user' },
            { username: 'missing.current' },
          ],
        },
        {
          id: 'other-task',
          title: 'Unrelated pipeline task',
          board_id: 'bd_other',
          due_date: '2026-07-10',
          due_at: '2026-07-10T10:00:00.000000Z',
          created_at: '2026-07-01T08:00:00.000000Z',
          is_archived: false,
          production_deadline_exempt: false,
          pyra_task_assignees: [{ username: 'other.user' }],
        },
      ],
      pyra_users: [
        { username: 'snapshot.user', display_name: 'Snapshot User', work_schedule_id: null, hire_date: null },
        { username: 'current.user', display_name: 'Current User', work_schedule_id: null, hire_date: null },
        { username: 'taskless.user', display_name: 'Taskless User', work_schedule_id: null, hire_date: null },
      ],
      pyra_attendance: [],
    });

    const report = await computeProductivity(client, '2026-07');
    const snapshotEmployee = report.employees.find((employee) => employee.username === 'snapshot.user');
    const currentEmployee = report.employees.find((employee) => employee.username === 'current.user');

    expect(report.employees.map((employee) => employee.username).sort())
      .toEqual(['current.user', 'snapshot.user']);
    expect(snapshotEmployee?.tasks.map((task) => task.task_id)).toEqual(['reviewed-verified']);
    expect(snapshotEmployee?.tasks[0]).toMatchObject({
      attribution_status: PRODUCTION_ATTRIBUTION_STATUS.SNAPSHOT_VERIFIED,
      created_at: '2026-07-01T08:00:00.000000Z',
      production_deadline_exempt: false,
      on_time: false,
    });
    expect(snapshotEmployee?.metrics).toMatchObject({
      on_time_count: 0,
      on_time_eligible_count: 1,
      review_rounds_total: 2,
      avg_rounds: 2,
      reviewed_task_count: 1,
      outright_rejection_count: 1,
      outright_rejection_rate: 100,
    });
    expect(currentEmployee?.tasks.map((task) => task.task_id).sort()).toEqual([
      'open-current',
      'reviewed-legacy',
    ]);
    expect(currentEmployee?.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        task_id: 'reviewed-legacy',
        assignee: 'current.user',
        attribution_status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_UNVERIFIED,
        delivery_eligible: false,
        delivery_exclusion: 'legacy_unverified_attribution',
      }),
    ]));
    expect(currentEmployee?.metrics.outright_rejection_rate).toBeNull();
    expect(report.unattributed_tasks.map((task) => task.task_id).sort()).toEqual([
      'open-current',
      'reviewed-legacy',
      'reviewed-verified',
    ]);
    expect(report.unattributed_tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        task_id: 'reviewed-legacy',
        assignee: null,
        attribution_status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_UNVERIFIED,
      }),
      expect.objectContaining({
        task_id: 'reviewed-verified',
        assignee: null,
        attribution_status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_UNVERIFIED,
      }),
      expect.objectContaining({
        task_id: 'open-current',
        assignee: null,
        attribution_status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_UNVERIFIED,
      }),
    ]));
    expect(report.employees.flatMap((employee) => employee.tasks))
      .not.toContainEqual(expect.objectContaining({ task_id: 'other-task' }));

    const ownReport = await computeProductivity(client, '2026-07', ['snapshot.user']);
    expect(ownReport.employees.map((employee) => employee.username)).toEqual(['snapshot.user']);
    expect(ownReport.employees[0].tasks.map((task) => task.task_id)).toEqual(['reviewed-verified']);
    expect(ownReport.unattributed_tasks).toEqual([]);

    const currentOwnReport = await computeProductivity(client, '2026-07', ['current.user']);
    expect(currentOwnReport.employees[0].tasks.map((task) => task.task_id).sort()).toEqual([
      'open-current',
      'reviewed-legacy',
    ]);
    expect(currentOwnReport.employees[0].metrics).toMatchObject({
      deliveries: 0,
      on_time_count: 0,
      on_time_eligible_count: 0,
      late_count: 0,
      reviewed_task_count: 0,
      outright_rejection_count: 0,
    });
    expect(currentOwnReport.unattributed_tasks).toEqual([]);

    const scopedAdminReport = await computeProductivity(
      client,
      '2026-07',
      ['taskless.user'],
      true,
    );
    expect(scopedAdminReport.employees).toEqual([
      expect.objectContaining({
        username: 'taskless.user',
        tasks: [],
        metrics: expect.objectContaining({
          deliveries: 0,
          on_time_pct: null,
          late_count: 0,
        }),
      }),
    ]);
    expect(scopedAdminReport.unattributed_tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        task_id: 'reviewed-legacy',
        attribution_status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_UNVERIFIED,
      }),
    ]));

    const missingOwnReport = await computeProductivity(client, '2026-07', ['missing.one']);
    expect(missingOwnReport.employees).toEqual([]);
    expect(missingOwnReport.unattributed_tasks).toEqual([]);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    try {
      const trends = await computeProductivityTrends(client, 1);
      expect(trends.months[0]).toMatchObject({
        month: '2026-07',
        late_count: 1,
        outright_rejection_count: 1,
        outright_rejection_rate: 100,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('loads native review decisions with a paginated production-board query', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'lib/production/report.ts'),
      'utf8',
    );

    expect(source).toContain(".from('pyra_task_review_decisions')");
    expect(source).toContain(".eq('board_id', PRODUCTION_BOARD_ID)");
    expect(source).not.toContain(".eq('action', TASK_REVIEW_ACTIONS.REJECT)");
    expect(source).toContain("'production review decisions'");
    expect(source).not.toContain(".from('pyra_task_activity')");
    expect(source).toContain('production_deadline_exempt');
  });
});
