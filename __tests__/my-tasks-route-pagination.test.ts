import { beforeEach, describe, expect, it, vi } from 'vitest';

type Filter = { method: string; column: string; value: unknown };
type QueryState = {
  table: string;
  filters: Filter[];
  limit: number | null;
  range: [number, number] | null;
};

const mocks = vi.hoisted(() => ({
  client: null as unknown,
}));

vi.mock('@/lib/api/auth', () => ({
  getApiAuth: vi.fn(async () => ({
    pyraUser: { username: 'employee', role: 'employee', rolePermissions: [] },
  })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => mocks.client),
}));

vi.mock('@/lib/observability/log-error', () => ({
  logError: vi.fn(),
}));

import { GET } from '@/app/api/my-tasks/route';

const boardTaskIds = Array.from(
  { length: 1_105 },
  (_, index) => `board-task-${String(index).padStart(4, '0')}`,
);
const leadTaskIds = Array.from(
  { length: 1_025 },
  (_, index) => `lead-task-${String(index).padStart(4, '0')}`,
);

function filterValue(state: QueryState, method: string, column: string): unknown {
  return state.filters.find((filter) => filter.method === method && filter.column === column)?.value;
}

function createFakeSupabase(options?: {
  failAssignmentPageAfter?: string;
  boardTaskDueDate?: (id: string) => string;
  boardTaskDueAt?: (id: string) => string;
  boardTaskDeadlineExempt?: (id: string) => boolean;
  boardTaskCreatedAt?: (id: string) => string;
}) {
  const states: QueryState[] = [];
  const from = vi.fn((table: string) => {
    const state: QueryState = { table, filters: [], limit: null, range: null };
    states.push(state);
    const builder: Record<string, unknown> = {};

    builder.select = vi.fn(() => builder);
    for (const method of ['eq', 'neq', 'gt', 'in']) {
      builder[method] = vi.fn((column: string, value: unknown) => {
        state.filters.push({ method, column, value });
        return builder;
      });
    }
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn((limit: number) => {
      state.limit = limit;
      return builder;
    });
    builder.range = vi.fn((fromIndex: number, toIndex: number) => {
      state.range = [fromIndex, toIndex];
      return builder;
    });
    builder.then = (
      resolvePromise: (value: { data: unknown[] | null; error: Error | null }) => unknown,
      rejectPromise: (reason: unknown) => unknown,
    ) => Promise.resolve().then(() => {
      const defaultPostgrestCap = 1_000;
      const afterId = filterValue(state, 'gt', table === 'pyra_task_assignees' ? 'task_id' : 'id');
      const limit = state.limit ?? defaultPostgrestCap;

      if (table === 'pyra_task_assignees') {
        if (
          options?.failAssignmentPageAfter !== undefined
          && options.failAssignmentPageAfter === afterId
        ) {
          return { data: null, error: new Error('assignment page failed') };
        }
        const start = typeof afterId === 'string' ? boardTaskIds.indexOf(afterId) + 1 : 0;
        return {
          data: boardTaskIds.slice(start, start + limit).map((task_id) => ({ task_id })),
          error: null,
        };
      }

      if (table === 'pyra_tasks') {
        const selectedIds = filterValue(state, 'in', 'id');
        const rows = Array.isArray(selectedIds)
          ? selectedIds.map((id) => ({
              id,
              board_id: 'board-1',
              title: String(id),
              description: null,
              due_date: options?.boardTaskDueDate?.(String(id)) ?? '2026-07-31',
              due_at: options?.boardTaskDueAt?.(String(id)) ?? '2026-07-31T12:00:00.000Z',
              production_deadline_exempt:
                options?.boardTaskDeadlineExempt?.(String(id)) ?? false,
              priority: 'medium',
              created_at: options?.boardTaskCreatedAt?.(String(id))
                ?? '2026-07-01T00:00:00.000Z',
              pyra_boards: {
                id: 'board-1',
                name: 'Production',
                project_id: null,
                view_mode: 'kanban',
                is_pipeline: false,
                pyra_projects: null,
              },
              pyra_board_columns: {
                id: 'column-1',
                name: 'Working',
                color: 'orange',
                position: 0,
                is_done_column: false,
                requires_approval: false,
              },
              pyra_task_labels: [],
              pyra_task_checklist: [],
              pyra_task_assignees: [],
            }))
          : [];
        const rangeStart = state.range?.[0] ?? 0;
        const rangeSize = state.range
          ? state.range[1] - state.range[0] + 1
          : defaultPostgrestCap;
        return { data: rows.slice(rangeStart, rangeStart + rangeSize), error: null };
      }

      if (table === 'pyra_lead_tasks') {
        const start = typeof afterId === 'string' ? leadTaskIds.indexOf(afterId) + 1 : 0;
        return {
          data: leadTaskIds.slice(start, start + limit).map((id) => ({
            id,
            lead_id: 'lead-1',
            title: id,
            description: null,
            due_date: '2026-07-31',
            priority: 'medium',
            status: 'pending',
            assigned_to: 'employee',
            created_by: 'admin',
            created_at: '2026-07-01T00:00:00.000Z',
            completed_at: null,
            metadata: null,
          })),
          error: null,
        };
      }

      return { data: [], error: null };
    }).then(resolvePromise, rejectPromise);

    return builder;
  });

  return { client: { from }, states };
}

describe('GET /api/my-tasks pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns every board and lead task beyond the PostgREST 1000-row cap', async () => {
    const fake = createFakeSupabase();
    mocks.client = fake.client;

    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);

    expect(body.data).toHaveLength(boardTaskIds.length + leadTaskIds.length);
    expect(body.data.filter((task: { _source: string }) => task._source === 'board_task'))
      .toHaveLength(boardTaskIds.length);
    expect(body.data.filter((task: { _source: string }) => task._source === 'lead_task'))
      .toHaveLength(leadTaskIds.length);

    const assignmentQueries = fake.states.filter((state) => state.table === 'pyra_task_assignees');
    const boardTaskQueries = fake.states.filter((state) => state.table === 'pyra_tasks');
    const leadTaskQueries = fake.states.filter((state) => state.table === 'pyra_lead_tasks');
    expect(assignmentQueries.length).toBeGreaterThan(1);
    expect(boardTaskQueries.length).toBeGreaterThan(1);
    expect(boardTaskQueries.every((state) => state.range !== null)).toBe(true);
    expect(leadTaskQueries.length).toBeGreaterThan(1);
  });

  it('fails closed when any assignment page fails', async () => {
    const firstCursor = boardTaskIds[249];
    const fake = createFakeSupabase({ failAssignmentPageAfter: firstCursor });
    mocks.client = fake.client;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const response = await GET();
      expect(response.status).toBe(500);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('sorts board deadlines by the full PostgreSQL microsecond instant', async () => {
    const fake = createFakeSupabase({
      boardTaskDueAt: (id) => {
        if (id === 'board-task-0000') return '2026-07-20T12:00:00.000002Z';
        if (id === 'board-task-0001') return '2026-07-20T12:00:00.000001Z';
        return '2026-08-31T12:00:00.000000Z';
      },
    });
    mocks.client = fake.client;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.slice(0, 2).map((task: { id: string }) => task.id))
      .toEqual(['board-task-0001', 'board-task-0000']);
  });

  it('uses created_at descending when exact deadlines are equal', async () => {
    const fake = createFakeSupabase({
      boardTaskDueAt: (id) => id.startsWith('board-task-000')
        ? '2026-07-20T12:00:00.000001Z'
        : '2026-08-31T12:00:00.000000Z',
      boardTaskCreatedAt: (id) => id === 'board-task-0001'
        ? '2026-07-02T00:00:00.000000Z'
        : '2026-07-01T00:00:00.000000Z',
    });
    mocks.client = fake.client;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.slice(0, 2).map((task: { id: string }) => task.id))
      .toEqual(['board-task-0001', 'board-task-0000']);
  });

  it.each([
    ['the provenance flag', true],
    ['the literal migration sentinel', false],
  ])('does not sort an unverified production time as an exact deadline via %s', async (
    _label,
    exempt,
  ) => {
    const fake = createFakeSupabase({
      boardTaskDueDate: (id) => id === 'board-task-0000'
        ? '2026-07-19'
        : id === 'board-task-0001'
          ? '2026-07-20'
          : '2026-08-31',
      boardTaskDueAt: (id) => id === 'board-task-0000'
        ? '2026-07-19T19:59:59.999Z'
        : id === 'board-task-0001'
          ? '2026-07-20T12:00:00.000Z'
          : '2026-08-31T12:00:00.000Z',
      boardTaskDeadlineExempt: (id) => id === 'board-task-0000' && exempt,
    });
    mocks.client = fake.client;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0].id).toBe('board-task-0001');
  });
});
