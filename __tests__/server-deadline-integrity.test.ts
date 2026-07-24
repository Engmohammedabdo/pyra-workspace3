import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryCall = {
  table: string;
  kind: 'select' | 'insert' | 'update' | 'delete' | null;
  payload?: unknown;
  filters: Array<{ method: string; column: string; value: unknown }>;
};

type QueryResult = {
  data?: unknown;
  error?: { message: string } | null;
};

const mocks = vi.hoisted(() => ({
  client: null as unknown,
  serviceClient: null as unknown,
  createServiceClient: vi.fn(),
  checkTaskScope: vi.fn(async () => true),
  checkBoardScope: vi.fn(async () => true),
  logError: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('@/lib/api/auth', () => ({
  requireApiPermission: vi.fn(async () => ({
    pyraUser: { username: 'admin', display_name: 'Admin' },
  })),
  isApiError: vi.fn(() => false),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => mocks.client),
  createServiceRoleClient: mocks.createServiceClient,
}));

vi.mock('@/lib/auth/task-scope', () => ({
  checkTaskScope: mocks.checkTaskScope,
  checkBoardScope: mocks.checkBoardScope,
}));

vi.mock('@/lib/api/activity', () => ({
  ACTIVITY_ACTIONS: { UPDATE: 'update', DELETE: 'delete' },
  ENTITY_TYPES: { TASK: 'task' },
  logActivity: mocks.logActivity,
}));
vi.mock('@/lib/observability/log-error', () => ({ logError: mocks.logError }));

let generatedId = 0;
vi.mock('@/lib/utils/id', () => ({
  generateId: (prefix: string) => `${prefix}_test_${++generatedId}`,
}));

import { DELETE as deleteTask, PATCH as patchTask } from '../app/api/tasks/[id]/route';

function createFakeSupabase(
  handler: (call: QueryCall) => QueryResult | Promise<QueryResult>,
) {
  const calls: QueryCall[] = [];
  const from = vi.fn((table: string) => {
    const call: QueryCall = { table, kind: null, filters: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {};

    builder.select = vi.fn(() => {
      if (call.kind === null) call.kind = 'select';
      return builder;
    });
    builder.insert = vi.fn((payload: unknown) => {
      call.kind = 'insert';
      call.payload = payload;
      return builder;
    });
    builder.update = vi.fn((payload: unknown) => {
      call.kind = 'update';
      call.payload = payload;
      return builder;
    });
    builder.delete = vi.fn(() => {
      call.kind = 'delete';
      return builder;
    });
    for (const method of ['eq', 'is']) {
      builder[method] = vi.fn((column: string, value: unknown) => {
        call.filters.push({ method, column, value });
        return builder;
      });
    }
    builder.single = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => builder);
    builder.then = (
      resolvePromise: (value: QueryResult) => unknown,
      rejectPromise: (reason: unknown) => unknown,
    ) => Promise.resolve(handler(call)).then(resolvePromise, rejectPromise);
    return builder;
  });

  return { client: { from }, calls };
}

function request(body: Record<string, unknown>) {
  return { json: vi.fn(async () => body) } as never;
}

function hasFilter(call: QueryCall, column: string, value: unknown) {
  return call.filters.some((filter) => filter.column === column && filter.value === value);
}

beforeEach(() => {
  generatedId = 0;
  mocks.checkTaskScope.mockReset().mockResolvedValue(true);
  mocks.checkBoardScope.mockReset().mockResolvedValue(true);
  mocks.serviceClient = null;
  mocks.createServiceClient.mockReset().mockImplementation(() => mocks.serviceClient ?? mocks.client);
  mocks.logError.mockClear();
  mocks.logActivity.mockClear();
});

describe('task transition integrity', () => {
  it.each(['column_id', 'position'])('rejects %s through the generic task PATCH route', async (field) => {
    const fake = createFakeSupabase(() => ({ data: null, error: null }));
    mocks.client = fake.client;

    const response = await patchTask(request({ [field]: field === 'position' ? 1 : 'col-next' }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: 'tasks.transitionFieldsRequireMove',
    });
    expect(fake.calls).toHaveLength(0);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });
});

describe('task property writer boundary', () => {
  it('rechecks the fresh task-board scope before creating a service writer', async () => {
    const fake = createFakeSupabase((call) => {
      if (call.table === 'pyra_tasks' && call.kind === 'select') {
        return {
          data: {
            id: 'task-1',
            board_id: 'bd_fresh_unscoped',
            updated_at: '2026-07-21T10:00:00.000Z',
            production_deadline_locked_at: null,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    mocks.client = fake.client;
    mocks.checkBoardScope.mockResolvedValue(false);

    const response = await patchTask(request({ title: 'Forbidden after move' }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.checkBoardScope).toHaveBeenCalledWith('bd_fresh_unscoped', expect.anything());
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('CAS-filters every property update by the fresh board and task version', async () => {
    const fake = createFakeSupabase((call) => {
      if (call.table === 'pyra_tasks' && call.kind === 'select') {
        return {
          data: {
            id: 'task-1',
            board_id: 'bd_scoped',
            updated_at: '2026-07-21T10:00:00.000Z',
            production_deadline_locked_at: null,
          },
          error: null,
        };
      }
      if (call.table === 'pyra_tasks' && call.kind === 'update') {
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });
    mocks.client = fake.client;

    const response = await patchTask(request({ title: 'Lost race' }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(409);
    const update = fake.calls.find((call) => call.table === 'pyra_tasks' && call.kind === 'update');
    expect(update).toBeDefined();
    expect(hasFilter(update!, 'board_id', 'bd_scoped')).toBe(true);
    expect(hasFilter(update!, 'updated_at', '2026-07-21T10:00:00.000Z')).toBe(true);
  });

  it('creates the service-role writer only after permission/scope validation', async () => {
    const fake = createFakeSupabase((call) => {
      if (call.table === 'pyra_tasks' && call.kind === 'select') {
        return {
          data: {
            id: 'task-1',
            board_id: 'bd_scoped',
            updated_at: '2026-07-21T10:00:00.000Z',
            production_deadline_locked_at: null,
          },
          error: null,
        };
      }
      if (call.table === 'pyra_tasks' && call.kind === 'update') {
        return { data: { id: 'task-1', title: 'Updated' }, error: null };
      }
      return { data: null, error: null };
    });
    mocks.client = fake.client;

    const response = await patchTask(request({ title: 'Updated' }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.createServiceClient).toHaveBeenCalledOnce();
    expect(mocks.logActivity).toHaveBeenCalledWith(
      'admin',
      'Admin',
      'task_update',
      '/dashboard/boards/bd_scoped',
      {
        source: 'task_update',
        task_id: 'task-1',
        fields: ['title'],
      },
    );
  });

  it('clears the legacy unverified flag only when an exact production deadline is supplied', async () => {
    const fake = createFakeSupabase((call) => {
      if (call.table === 'pyra_tasks' && call.kind === 'select') {
        return {
          data: {
            id: 'task-legacy',
            board_id: 'bd_production',
            updated_at: '2026-07-21T10:00:00.000Z',
            production_deadline_locked_at: null,
            production_deadline_exempt: true,
          },
          error: null,
        };
      }
      if (call.table === 'pyra_tasks' && call.kind === 'update') {
        return { data: { id: 'task-legacy' }, error: null };
      }
      return { data: null, error: null };
    });
    mocks.client = fake.client;

    const response = await patchTask(request({
      due_date: '2026-07-22',
      due_time: '09:00',
    }), {
      params: Promise.resolve({ id: 'task-legacy' }),
    });

    expect(response.status).toBe(200);
    const update = fake.calls.find((call) => call.table === 'pyra_tasks' && call.kind === 'update');
    expect(update?.payload).toMatchObject({
      due_date: '2026-07-22',
      due_at: '2026-07-22T05:00:00.000Z',
      production_deadline_exempt: false,
    });
  });

  it('observes a post-commit task-activity error without claiming the task update rolled back', async () => {
    const fake = createFakeSupabase((call) => {
      if (call.table === 'pyra_tasks' && call.kind === 'select') {
        return {
          data: {
            id: 'task-1',
            board_id: 'bd_scoped',
            updated_at: '2026-07-21T10:00:00.000Z',
            production_deadline_locked_at: null,
          },
          error: null,
        };
      }
      if (call.table === 'pyra_tasks' && call.kind === 'update') {
        return { data: { id: 'task-1', title: 'Updated' }, error: null };
      }
      if (call.table === 'pyra_task_activity' && call.kind === 'insert') {
        return { data: null, error: { message: 'activity insert failed' } };
      }
      return { data: null, error: null };
    });
    mocks.client = fake.client;

    const response = await patchTask(request({ title: 'Updated' }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.logError).toHaveBeenCalledWith(expect.objectContaining({
      error: { message: 'activity insert failed' },
      metadata: { action: 'task_update_activity', task_id: 'task-1' },
    }));
  });

  it('never creates a service-role writer when task scope fails', async () => {
    mocks.checkTaskScope.mockResolvedValue(false);
    mocks.client = createFakeSupabase(() => ({ data: null, error: null })).client;

    const response = await patchTask(request({ title: 'Forbidden' }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });
});

describe('task delete writer boundary', () => {
  it('rechecks the fresh task-board scope before creating the delete writer', async () => {
    const fake = createFakeSupabase((call) => {
      if (call.table === 'pyra_tasks' && call.kind === 'select') {
        return {
          data: {
            id: 'task-1',
            board_id: 'bd_fresh_unscoped',
            updated_at: '2026-07-21T10:00:00.000Z',
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    mocks.client = fake.client;
    mocks.checkBoardScope.mockResolvedValue(false);

    const response = await deleteTask({} as never, {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.checkBoardScope).toHaveBeenCalledWith('bd_fresh_unscoped', expect.anything());
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('CAS-filters the service delete by the fresh board and version and maps a miss to 409', async () => {
    const fake = createFakeSupabase((call) => {
      if (call.table === 'pyra_tasks' && call.kind === 'select') {
        return {
          data: {
            id: 'task-1',
            board_id: 'bd_scoped',
            updated_at: '2026-07-21T10:00:00.000Z',
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    const service = createFakeSupabase((call) => {
      if (call.table === 'pyra_tasks' && call.kind === 'delete') {
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });
    mocks.client = fake.client;
    mocks.serviceClient = service.client;

    const response = await deleteTask({} as never, {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(409);
    const deletion = service.calls.find(
      (call) => call.table === 'pyra_tasks' && call.kind === 'delete',
    );
    expect(deletion).toBeDefined();
    expect(hasFilter(deletion!, 'id', 'task-1')).toBe(true);
    expect(hasFilter(deletion!, 'board_id', 'bd_scoped')).toBe(true);
    expect(hasFilter(deletion!, 'updated_at', '2026-07-21T10:00:00.000Z')).toBe(true);
  });
});

describe('persistent production deadline lock', () => {
  it('rejects a deadline edit from the stored lock even after the task leaves production', async () => {
    const fake = createFakeSupabase((call) => {
      if (call.table === 'pyra_tasks' && call.kind === 'select') {
        return {
          data: {
            id: 'task-1',
            board_id: 'bd_generic',
            updated_at: '2026-07-21T10:00:00.000Z',
            production_deadline_locked_at: '2026-07-21T09:00:00.000Z',
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    mocks.client = fake.client;

    const response = await patchTask(request({ due_date: '2026-07-22' }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: 'tasks.productionDeadlineLocked',
    });
    expect(fake.calls.some((call) => call.table === 'pyra_tasks' && call.kind === 'update')).toBe(false);
    expect(fake.calls.some((call) => call.table === 'pyra_task_stage_history')).toBe(false);
  });

  it('does not commit a deadline edit that loses the race with the first review lock', async () => {
    let taskReads = 0;
    const fake = createFakeSupabase((call) => {
      if (call.table === 'pyra_tasks' && call.kind === 'select') {
        taskReads += 1;
        return {
          data: {
            id: 'task-1',
            board_id: 'bd_production',
            updated_at: taskReads === 1
              ? '2026-07-21T10:00:00.000Z'
              : '2026-07-21T10:00:01.000Z',
            production_deadline_locked_at: taskReads === 1
              ? null
              : '2026-07-21T10:00:00.500Z',
          },
          error: null,
        };
      }
      if (call.table === 'pyra_tasks' && call.kind === 'update') {
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });
    mocks.client = fake.client;

    const response = await patchTask(request({
      due_date: '2026-07-22',
      due_time: '09:00',
    }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: 'tasks.productionDeadlineLocked',
    });
    const update = fake.calls.find((call) => call.table === 'pyra_tasks' && call.kind === 'update');
    expect(update).toBeDefined();
    expect(hasFilter(update!, 'updated_at', '2026-07-21T10:00:00.000Z')).toBe(true);
    expect(taskReads).toBe(2);
  });
});
