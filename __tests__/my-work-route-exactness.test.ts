import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Filter = { method: string; column: string; value: unknown };
type QueryState = {
  table: string;
  filters: Filter[];
  limit: number | null;
  range: [number, number] | null;
  head: boolean;
};

const mocks = vi.hoisted(() => ({
  client: null as unknown,
}));

vi.mock('@/lib/api/auth', () => ({
  getApiAuth: vi.fn(async () => ({
    pyraUser: {
      username: 'employee',
      role: 'employee',
      rolePermissions: [],
    },
  })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => mocks.client),
  createServiceRoleClient: vi.fn(() => mocks.client),
}));

vi.mock('@/lib/auth/team-scope', () => ({
  getDirectReports: vi.fn(async () => []),
}));

vi.mock('@/lib/auth/rbac', () => ({
  hasPermission: vi.fn(() => false),
}));

import { GET } from '@/app/api/my-work/route';

const taskIds = Array.from({ length: 1_105 }, (_, index) => `task-${String(index).padStart(4, '0')}`);
const taskRows = new Map(taskIds.map((id, index) => [
  id,
  {
    id,
    title: id,
    due_date: '2026-07-21',
    due_at: '2026-07-21T11:00:00.000Z',
    production_deadline_exempt: index === taskIds.length - 1,
    board_id: 'board-1',
    pyra_boards: { name: 'Production' },
    pyra_board_columns: { name: 'Working', is_done_column: false },
  },
]));

function filterValue(state: QueryState, method: string, column: string): unknown {
  return state.filters.find((filter) => filter.method === method && filter.column === column)?.value;
}

function createFakeSupabase() {
  const states: QueryState[] = [];
  const from = vi.fn((table: string) => {
    const state: QueryState = { table, filters: [], limit: null, range: null, head: false };
    states.push(state);
    const builder: Record<string, unknown> = {};

    builder.select = vi.fn((_columns?: string, options?: { head?: boolean }) => {
      state.head = options?.head === true;
      return builder;
    });
    for (const method of ['eq', 'gt', 'gte', 'lte', 'not', 'in']) {
      builder[method] = vi.fn((column: string, value: unknown, third?: unknown) => {
        state.filters.push({ method, column, value: third === undefined ? value : third });
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
      resolvePromise: (value: { data: unknown[]; count?: number; error: null }) => unknown,
      rejectPromise: (reason: unknown) => unknown,
    ) => Promise.resolve().then(() => {
      if (state.head) return { data: [], count: 0, error: null };

      if (table === 'pyra_task_assignees') {
        const after = filterValue(state, 'gt', 'task_id');
        const start = typeof after === 'string' ? taskIds.indexOf(after) + 1 : 0;
        const defaultPostgrestCap = 1_000;
        const limit = state.limit ?? defaultPostgrestCap;
        const page = taskIds.slice(start, start + limit).map((task_id) => ({ task_id }));
        return { data: page, error: null };
      }

      if (table === 'pyra_tasks') {
        const ids = filterValue(state, 'in', 'id');
        const selected = Array.isArray(ids)
          ? ids.map((id) => taskRows.get(String(id))).filter(Boolean).reverse()
          : [];
        const start = state.range?.[0] ?? 0;
        const maximum = state.range
          ? state.range[1] - state.range[0] + 1
          : state.limit ?? 1_000;
        return { data: selected.slice(start, start + maximum), error: null };
      }

      return { data: [], error: null };
    }).then(resolvePromise, rejectPromise);

    return builder;
  });

  return { client: { from }, states };
}

describe('GET /api/my-work task completeness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-21T10:00:00.000Z');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns and counts every assigned active due task beyond PostgREST and old 100-row caps', async () => {
    const fake = createFakeSupabase();
    mocks.client = fake.client;

    const response = await GET(new NextRequest('http://localhost/api/my-work'));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.counts.tasks_total).toBe(taskIds.length);
    expect(body.data.tasks.today).toHaveLength(taskIds.length - 1);
    expect(body.data.tasks.unverified).toHaveLength(1);
    expect(body.data.tasks.unverified[0].id).toBe(taskIds[taskIds.length - 1]);
    expect(body.data.tasks.today.map((task: { id: string }) => task.id)).toEqual(taskIds.slice(0, -1));
    expect(body.data.tasks.unverified.find((task: { id: string }) => task.id === taskIds.at(-1)))
      .toMatchObject({
      id: taskIds.at(-1),
      production_deadline_exempt: true,
    });

    const assignmentQueries = fake.states.filter((state) => state.table === 'pyra_task_assignees');
    expect(assignmentQueries.length).toBeGreaterThan(1);
    expect(assignmentQueries.some((state) =>
      state.filters.some((filter) => filter.method === 'gt' && filter.column === 'task_id')
    )).toBe(true);
  });
});
