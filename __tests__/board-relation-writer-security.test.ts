import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryKind = 'select' | 'insert' | 'update' | 'delete' | null;

type QueryCall = {
  table: string;
  kind: QueryKind;
  filters: Array<{ column: string; value: unknown }>;
  input?: unknown;
  terminal?: 'single' | 'maybeSingle';
};

type QueryResult = { data: unknown; error: null | { message: string; code?: string }; count?: number | null };

const mocks = vi.hoisted(() => ({
  createUserClient: vi.fn(),
  createServiceClient: vi.fn(),
  checkBoardScope: vi.fn(async () => true),
  logActivity: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock('@/lib/api/auth', () => ({
  requireApiPermission: vi.fn(async () => ({
    pyraUser: { username: 'admin', display_name: 'Admin', role: 'admin' },
  })),
  isApiError: vi.fn(() => false),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createUserClient,
  createServiceRoleClient: mocks.createServiceClient,
}));
vi.mock('@/lib/auth/task-scope', () => ({ checkBoardScope: mocks.checkBoardScope }));
vi.mock('@/lib/api/activity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api/activity')>();
  return { ...actual, logActivity: mocks.logActivity };
});
vi.mock('@/lib/observability/log-error', () => ({ logError: mocks.logError }));
vi.mock('@/lib/utils/id', () => ({ generateId: (prefix: string) => `${prefix}_test` }));

import {
  DELETE as deleteLabel,
  PATCH as patchLabel,
  POST as postLabel,
} from '../app/api/boards/[id]/labels/route';
import {
  DELETE as deleteColumn,
  PATCH as patchColumn,
  POST as postColumn,
} from '../app/api/boards/[id]/columns/route';

function makeClient(
  resolver: (call: QueryCall) => QueryResult = defaultResolver,
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
    builder.insert = vi.fn((input: unknown) => {
      call.kind = 'insert';
      call.input = input;
      return builder;
    });
    builder.update = vi.fn((input: unknown) => {
      call.kind = 'update';
      call.input = input;
      return builder;
    });
    builder.delete = vi.fn(() => {
      call.kind = 'delete';
      return builder;
    });
    builder.eq = vi.fn((column: string, value: unknown) => {
      call.filters.push({ column, value });
      return builder;
    });
    builder.in = vi.fn((column: string, value: unknown) => {
      call.filters.push({ column, value });
      return builder;
    });
    builder.order = vi.fn(() => builder);
    builder.single = vi.fn(() => {
      call.terminal = 'single';
      return builder;
    });
    builder.maybeSingle = vi.fn(() => {
      call.terminal = 'maybeSingle';
      return builder;
    });
    builder.then = (
      onFulfilled: (value: QueryResult) => unknown,
      onRejected: (reason: unknown) => unknown,
    ) => Promise.resolve(resolver(call)).then(onFulfilled, onRejected);
    return builder;
  });
  return { client: { from }, calls };
}

function defaultResolver(call: QueryCall): QueryResult {
  if (call.kind === 'select' && call.table === 'pyra_board_labels') {
    return { data: { id: 'label-1' }, error: null };
  }
  if (call.kind === 'select' && call.table === 'pyra_board_columns') {
    return { data: call.terminal ? { id: 'column-1' } : [{ id: 'column-1' }], error: null };
  }
  if (call.kind === 'select' && call.table === 'pyra_tasks') {
    return { data: null, error: null, count: 0 };
  }
  return { data: { id: 'result-1' }, error: null };
}

function jsonRequest(body: Record<string, unknown>) {
  return { json: vi.fn(async () => body) } as never;
}

function deleteRequest(param: string, value: string) {
  return {
    nextUrl: new URL(`https://workspace.test/api/boards/board-1?${param}=${value}`),
  } as never;
}

function params() {
  return { params: Promise.resolve({ id: 'board-1' }) };
}

function makeRpcClient(result: QueryResult) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc }, rpc };
}

beforeEach(() => {
  const user = makeClient();
  const service = makeClient();
  mocks.createUserClient.mockReset().mockResolvedValue(user.client);
  mocks.createServiceClient.mockReset().mockReturnValue(service.client);
  mocks.checkBoardScope.mockReset().mockResolvedValue(true);
  mocks.logActivity.mockClear();
  mocks.logError.mockClear();
});

describe('board relation writer scope gates', () => {
  it.each([
    ['label POST', () => postLabel(jsonRequest({ name: 'Urgent' }), params())],
    ['label PATCH', () => patchLabel(jsonRequest({ id: 'label-1', name: 'Urgent' }), params())],
    ['label DELETE', () => deleteLabel(deleteRequest('labelId', 'label-1'), params())],
    ['column POST', () => postColumn(jsonRequest({ name: 'Doing' }), params())],
    ['column PATCH', () => patchColumn(jsonRequest({ columns: [{ id: 'column-1', position: 1 }] }), params())],
    ['column DELETE', () => deleteColumn(deleteRequest('columnId', 'column-1'), params())],
  ])('blocks %s before creating any data client', async (_name, invoke) => {
    mocks.checkBoardScope.mockResolvedValue(false);

    const response = await invoke();

    expect(response.status).toBe(403);
    expect(mocks.checkBoardScope).toHaveBeenCalledWith('board-1', expect.anything());
    expect(mocks.createUserClient).not.toHaveBeenCalled();
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });
});

describe('board label child ownership', () => {
  it('constrains a label update to the URL board', async () => {
    const user = makeClient();
    mocks.createUserClient.mockResolvedValue(user.client);

    const response = await patchLabel(jsonRequest({ id: 'label-1', name: 'Urgent' }), params());

    expect(response.status).toBe(200);
    const update = user.calls.find((call) => call.table === 'pyra_board_labels' && call.kind === 'update');
    expect(update?.filters).toEqual(expect.arrayContaining([
      { column: 'id', value: 'label-1' },
      { column: 'board_id', value: 'board-1' },
    ]));
  });

  it('does not delete task-label junctions when the label is outside the URL board', async () => {
    const user = makeClient((call) => {
      if (call.table === 'pyra_board_labels' && call.kind === 'delete') {
        return { data: null, error: null };
      }
      return defaultResolver(call);
    });
    mocks.createUserClient.mockResolvedValue(user.client);

    const response = await deleteLabel(deleteRequest('labelId', 'foreign-label'), params());

    expect(response.status).toBe(422);
    expect(user.calls.some((call) => call.table === 'pyra_task_labels' && call.kind === 'delete')).toBe(false);
    expect(user.calls.some((call) => call.table === 'pyra_board_labels' && call.kind === 'delete')).toBe(true);
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });

  it('deletes only the constrained parent label and relies on its FK cascade', async () => {
    const user = makeClient();
    mocks.createUserClient.mockResolvedValue(user.client);

    const response = await deleteLabel(deleteRequest('labelId', 'label-1'), params());

    expect(response.status).toBe(200);
    const labelDeletes = user.calls.filter(
      (call) => call.table === 'pyra_board_labels' && call.kind === 'delete',
    );
    expect(labelDeletes).toHaveLength(1);
    expect(labelDeletes[0].filters).toEqual(expect.arrayContaining([
      { column: 'id', value: 'label-1' },
      { column: 'board_id', value: 'board-1' },
    ]));
    expect(user.calls.some((call) => call.table === 'pyra_task_labels')).toBe(false);
    expect(mocks.logActivity).toHaveBeenCalledTimes(1);
  });

  it('does not delete junctions or log activity when the constrained parent delete fails', async () => {
    const user = makeClient((call) => {
      if (call.table === 'pyra_board_labels' && call.kind === 'delete') {
        return { data: null, error: { message: 'parent delete failed', code: 'XX001' } };
      }
      return defaultResolver(call);
    });
    mocks.createUserClient.mockResolvedValue(user.client);

    const response = await deleteLabel(deleteRequest('labelId', 'label-1'), params());

    expect(response.status).toBe(500);
    expect(user.calls.some((call) => call.table === 'pyra_task_labels')).toBe(false);
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });
});

describe('protected board column writers', () => {
  it('uses service role only after the board scope gate for column creation', async () => {
    const service = makeRpcClient({
      data: [{
        status: 'ok',
        board_column: { id: 'bc_test', board_id: 'board-1', name: 'Doing' },
        mutation: { created: true },
      }],
      error: null,
    });
    mocks.createServiceClient.mockReturnValue(service.client);

    const response = await postColumn(jsonRequest({ name: 'Doing' }), params());

    expect(response.status).toBe(201);
    expect(mocks.checkBoardScope).toHaveBeenCalledBefore(mocks.createServiceClient);
    expect(mocks.createServiceClient).toHaveBeenCalledTimes(1);
    expect(mocks.createUserClient).not.toHaveBeenCalled();
    expect(service.rpc).toHaveBeenCalledWith(
      'pyra_create_board_column_atomic',
      expect.objectContaining({ p_board_id: 'board-1' }),
    );
  });

  it('binds every column update batch to the URL board in one RPC', async () => {
    const service = makeRpcClient({
      data: [{ status: 'ok', mutation: { updated_count: 1 } }],
      error: null,
    });
    mocks.createServiceClient.mockReturnValue(service.client);
    const columns = [{ id: 'column-1', position: 2, name: 'Review' }];

    const response = await patchColumn(
      jsonRequest({ columns }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(service.rpc).toHaveBeenCalledWith('pyra_update_board_columns_atomic', {
      p_board_id: 'board-1',
      p_columns: columns,
    });
  });

  it('maps atomic ownership rejection without any direct task or column query', async () => {
    const service = makeRpcClient({
      data: [{ status: 'column_not_in_board', mutation: null }],
      error: null,
    });
    mocks.createServiceClient.mockReturnValue(service.client);

    const response = await deleteColumn(deleteRequest('columnId', 'foreign-column'), params());

    expect(response.status).toBe(422);
    expect(service.rpc).toHaveBeenCalledWith('pyra_delete_board_column_atomic', {
      p_board_id: 'board-1',
      p_column_id: 'foreign-column',
    });
  });

  it('fails closed when the atomic evidence check errors', async () => {
    const service = makeRpcClient({
      data: null,
      error: { message: 'evidence check failed', code: 'XX001' },
    });
    mocks.createServiceClient.mockReturnValue(service.client);

    const response = await deleteColumn(deleteRequest('columnId', 'column-1'), params());

    expect(response.status).toBe(500);
    expect(mocks.logError).toHaveBeenCalled();
  });
});

describe('user hard-delete evidence retention', () => {
  it('never treats task activity as deletable user ephemera', () => {
    const source = readFileSync(resolve(
      process.cwd(), 'app/api/users/[username]/route.ts',
    ), 'utf8');
    const cleanup = source.match(
      /const CLEANUP_TABLES:[\s\S]*?= \[([\s\S]*?)\n\];/,
    )?.[1];

    expect(cleanup).toBeTruthy();
    expect(cleanup).not.toContain("table: 'pyra_task_activity'");
  });
});
