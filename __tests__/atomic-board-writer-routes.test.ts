import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type RpcResult = {
  data: unknown;
  error: null | { message: string; code?: string };
};

type QueryResult = {
  data: unknown;
  error: null | { message: string; code?: string };
};

const mocks = vi.hoisted(() => ({
  requireApiPermission: vi.fn(),
  createUserClient: vi.fn(),
  createServiceClient: vi.fn(),
  checkBoardScope: vi.fn(async () => true),
  invalidateScopeCache: vi.fn(),
  logActivity: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock('@/lib/api/auth', () => ({
  requireApiPermission: mocks.requireApiPermission,
  isApiError: vi.fn((value: unknown) => value instanceof Response),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createUserClient,
  createServiceRoleClient: mocks.createServiceClient,
}));
vi.mock('@/lib/auth/task-scope', () => ({ checkBoardScope: mocks.checkBoardScope }));
vi.mock('@/lib/auth/scope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/auth/scope')>();
  return {
    ...actual,
    invalidateScopeCache: mocks.invalidateScopeCache,
  };
});
vi.mock('@/lib/api/activity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api/activity')>();
  return { ...actual, logActivity: mocks.logActivity };
});
vi.mock('@/lib/observability/log-error', () => ({ logError: mocks.logError }));

let generatedId = 0;
vi.mock('@/lib/utils/id', () => ({
  generateId: (prefix: string) => `${prefix}_test_${++generatedId}`,
}));

import { getBoardTemplate } from '../lib/config/board-templates';
import { POST as createBoard } from '../app/api/boards/route';
import {
  DELETE as deleteColumn,
  PATCH as updateColumns,
  POST as createColumn,
} from '../app/api/boards/[id]/columns/route';

function makeDataClient(
  rpcResult: RpcResult,
  queryResolver: (table: string) => QueryResult = (table) => {
    if (table === 'pyra_projects') {
      return { data: { team_id: 'team-1' }, error: null };
    }
    if (table === 'pyra_team_members') {
      return { data: [{ username: 'employee-1' }], error: null };
    }
    if (table === 'pyra_boards') {
      return { data: { id: 'legacy-direct-board' }, error: null };
    }
    return { data: [], error: null };
  },
) {
  const directWrites: Array<{ table: string; method: string }> = [];
  const rpc = vi.fn(async () => rpcResult);
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
      builder[method] = vi.fn(() => builder);
    }
    for (const method of ['insert', 'update', 'delete']) {
      builder[method] = vi.fn(() => {
        directWrites.push({ table, method });
        return builder;
      });
    }
    builder.single = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => builder);
    builder.then = (
      onFulfilled: (result: QueryResult) => unknown,
      onRejected: (reason: unknown) => unknown,
    ) => Promise.resolve(queryResolver(table)).then(onFulfilled, onRejected);
    return builder;
  });
  return { client: { rpc, from }, rpc, from, directWrites };
}

function boardRequest(body: Record<string, unknown>) {
  return {
    json: vi.fn(async () => body),
    method: 'POST',
    url: 'https://workspace.test/api/boards',
    headers: new Headers(),
  } as never;
}

function columnRequest(body: Record<string, unknown>) {
  return {
    json: vi.fn(async () => body),
    method: 'POST',
    url: 'https://workspace.test/api/boards/board-1/columns',
    headers: new Headers(),
  } as never;
}

function deleteColumnRequest(columnId = 'column-1') {
  return {
    nextUrl: new URL(`https://workspace.test/api/boards/board-1/columns?columnId=${columnId}`),
    method: 'DELETE',
    url: `https://workspace.test/api/boards/board-1/columns?columnId=${columnId}`,
    headers: new Headers(),
  } as never;
}

function boardParams() {
  return { params: Promise.resolve({ id: 'board-1' }) };
}

function okBoardResult() {
  return {
    data: [{
      status: 'ok',
      board: {
        id: 'bd_test_1',
        name: 'Operations',
        pyra_board_columns: [],
      },
      mutation: { column_count: 4, label_count: 4 },
    }],
    error: null,
  } satisfies RpcResult;
}

beforeEach(() => {
  generatedId = 0;
  mocks.requireApiPermission.mockReset().mockResolvedValue({
    pyraUser: {
      username: 'admin',
      display_name: 'Admin',
      role: 'admin',
      rolePermissions: ['*'],
    },
  });
  mocks.checkBoardScope.mockReset().mockResolvedValue(true);
  mocks.invalidateScopeCache.mockClear();
  mocks.logActivity.mockClear();
  mocks.logError.mockClear();

  const dataClient = makeDataClient(okBoardResult());
  mocks.createUserClient.mockReset().mockResolvedValue(dataClient.client);
  mocks.createServiceClient.mockReset().mockReturnValue(dataClient.client);
});

describe('atomic board creation route', () => {
  it('stops at the permission gate before creating any data client', async () => {
    mocks.requireApiPermission.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await createBoard(boardRequest({ name: 'Operations' }));

    expect(response.status).toBe(403);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
    expect(mocks.createUserClient).not.toHaveBeenCalled();
  });

  it('validates the board name before creating the service client', async () => {
    const response = await createBoard(boardRequest({ name: '   ' }));

    expect(response.status).toBe(422);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('expands a known template, generates every id, and creates the board through one RPC', async () => {
    const dataClient = makeDataClient(okBoardResult());
    mocks.createUserClient.mockResolvedValue(dataClient.client);
    mocks.createServiceClient.mockReturnValue(dataClient.client);
    const template = getBoardTemplate('general');
    expect(template).toBeDefined();

    const response = await createBoard(boardRequest({
      name: 'Operations',
      description: 'Daily work',
      project_id: 'project-1',
      template: 'general',
      view_mode: 'list',
      is_pipeline: true,
      auto_advance: true,
    }));

    expect(response.status).toBe(201);
    expect(mocks.createServiceClient).toHaveBeenCalledTimes(1);
    expect(dataClient.rpc).toHaveBeenCalledWith('pyra_create_board_atomic', {
      p_board_id: 'bd_test_1',
      p_name: 'Operations',
      p_description: 'Daily work',
      p_project_id: 'project-1',
      p_template: 'general',
      p_view_mode: 'list',
      p_is_pipeline: true,
      p_auto_advance: true,
      p_created_by: 'admin',
      p_columns: template!.columns.map((column, index) => ({
        id: `bc_test_${index + 2}`,
        name: column.name,
        color: column.color,
        position: index,
        is_done_column: column.isDoneColumn ?? false,
      })),
      p_labels: template!.labels.map((label, index) => ({
        id: `bl_test_${template!.columns.length + index + 2}`,
        name: label.name,
        color: label.color,
      })),
    });
    expect(dataClient.directWrites).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      data: { id: 'bd_test_1', name: 'Operations' },
    });
    expect(mocks.logActivity).toHaveBeenCalledWith(
      'admin',
      'Admin',
      'board_create',
      '/dashboard/boards/bd_test_1',
      expect.objectContaining({ source: 'board_atomic_create' }),
    );
    expect(mocks.invalidateScopeCache).toHaveBeenCalledWith('employee-1');
  });

  it('preserves an unknown template key while using the three default columns and no labels', async () => {
    const dataClient = makeDataClient(okBoardResult());
    mocks.createUserClient.mockResolvedValue(dataClient.client);
    mocks.createServiceClient.mockReturnValue(dataClient.client);

    const response = await createBoard(boardRequest({
      name: 'Operations',
      template: 'future-template',
    }));

    expect(response.status).toBe(201);
    expect(dataClient.rpc).toHaveBeenCalledWith(
      'pyra_create_board_atomic',
      expect.objectContaining({
        p_template: 'future-template',
        p_columns: [
          expect.objectContaining({ id: 'bc_test_2', color: 'gray', position: 0 }),
          expect.objectContaining({ id: 'bc_test_3', color: 'blue', position: 1 }),
          expect.objectContaining({
            id: 'bc_test_4', color: 'green', position: 2, is_done_column: true,
          }),
        ],
        p_labels: [],
      }),
    );
  });

  it.each([
    ['invalid_board_input', 422, 'boards.invalidBoardInput'],
    ['invalid_columns_payload', 422, 'boards.invalidColumnsPayload'],
    ['invalid_labels_payload', 422, 'boards.invalidLabelsPayload'],
    ['project_not_found', 422, 'projects.notFound'],
    ['board_not_found', 404, 'common.boardNotFound'],
    ['write_conflict', 409, 'boards.writeConflict'],
  ])('maps %s to HTTP %i without logging activity', async (status, httpStatus, message) => {
    const dataClient = makeDataClient({
      data: [{ status, board: null, mutation: null }],
      error: null,
    });
    mocks.createServiceClient.mockReturnValue(dataClient.client);

    const response = await createBoard(boardRequest({ name: 'Operations' }));

    expect(response.status).toBe(httpStatus);
    await expect(response.json()).resolves.toMatchObject({ error: message });
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });

  it.each([
    ['RPC error', { data: null, error: { message: 'rpc failed' } }],
    ['no result', { data: [], error: null }],
    ['unknown status', { data: [{ status: 'future_status', board: null, mutation: null }], error: null }],
    ['malformed success', { data: [{ status: 'ok', board: null, mutation: {} }], error: null }],
  ])('fails closed and logs %s', async (_case, rpcResult) => {
    const dataClient = makeDataClient(rpcResult);
    mocks.createServiceClient.mockReturnValue(dataClient.client);

    const response = await createBoard(boardRequest({ name: 'Operations' }));

    expect(response.status).toBe(500);
    expect(mocks.logError).toHaveBeenCalled();
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });

  it('keeps a committed 201 response when team-scope cache lookup fails after the RPC', async () => {
    const dataClient = makeDataClient(okBoardResult(), (table) => {
      if (table === 'pyra_projects') {
        return { data: null, error: { message: 'cache lookup failed' } };
      }
      return { data: [], error: null };
    });
    mocks.createServiceClient.mockReturnValue(dataClient.client);

    const response = await createBoard(boardRequest({
      name: 'Operations',
      project_id: 'project-1',
    }));

    expect(response.status).toBe(201);
    expect(mocks.logError).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ action: 'board_create_scope_invalidation' }),
    }));
    expect(mocks.logActivity).toHaveBeenCalledTimes(1);
  });
});

describe('atomic board-column routes', () => {
  it('does not create a service client when board scope fails', async () => {
    mocks.checkBoardScope.mockResolvedValue(false);

    const response = await createColumn(columnRequest({ name: 'Doing' }), boardParams());

    expect(response.status).toBe(403);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('validates the batch payload after scope and before creating the service client', async () => {
    const response = await updateColumns(columnRequest({
      columns: [{ id: '', position: 'first' }],
    }), boardParams());

    expect(response.status).toBe(422);
    expect(mocks.checkBoardScope).toHaveBeenCalled();
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('creates a column through the exact atomic RPC contract', async () => {
    const dataClient = makeDataClient({
      data: [{
        status: 'ok',
        board_column: { id: 'bc_test_1', board_id: 'board-1', name: 'Doing' },
        mutation: { created: true },
      }],
      error: null,
    });
    mocks.createServiceClient.mockReturnValue(dataClient.client);

    const response = await createColumn(columnRequest({
      name: 'Doing', color: 'blue', position: 3,
    }), boardParams());

    expect(response.status).toBe(201);
    expect(dataClient.rpc).toHaveBeenCalledWith('pyra_create_board_column_atomic', {
      p_column_id: 'bc_test_1',
      p_board_id: 'board-1',
      p_name: 'Doing',
      p_color: 'blue',
      p_position: 3,
    });
    expect(dataClient.directWrites).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      data: { id: 'bc_test_1', board_id: 'board-1', name: 'Doing' },
    });
  });

  it('updates every column through one atomic batch RPC', async () => {
    const dataClient = makeDataClient({
      data: [{ status: 'ok', mutation: { updated_count: 2 } }],
      error: null,
    });
    mocks.createServiceClient.mockReturnValue(dataClient.client);
    const columns = [
      { id: 'column-1', position: 0, name: 'Queue' },
      { id: 'column-2', position: 1, color: 'green' },
    ];

    const response = await updateColumns(columnRequest({ columns }), boardParams());

    expect(response.status).toBe(200);
    expect(dataClient.rpc).toHaveBeenCalledWith('pyra_update_board_columns_atomic', {
      p_board_id: 'board-1',
      p_columns: columns,
    });
    expect(dataClient.directWrites).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({ data: { updated: true } });
  });

  it('deletes a column only through the atomic evidence-aware RPC', async () => {
    const dataClient = makeDataClient({
      data: [{ status: 'ok', mutation: { deleted: true } }],
      error: null,
    });
    mocks.createServiceClient.mockReturnValue(dataClient.client);

    const response = await deleteColumn(deleteColumnRequest(), boardParams());

    expect(response.status).toBe(200);
    expect(dataClient.rpc).toHaveBeenCalledWith('pyra_delete_board_column_atomic', {
      p_board_id: 'board-1',
      p_column_id: 'column-1',
    });
    expect(dataClient.directWrites).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({ data: { deleted: true } });
  });

  it.each([
    ['invalid_column_input', 422, 'boards.invalidColumnInput'],
    ['invalid_columns_payload', 422, 'boards.invalidColumnsPayload'],
    ['column_not_in_board', 422, 'boards.columnNotInBoard'],
    ['column_has_tasks', 422, 'boards.columnHasTasks'],
    ['column_has_history', 422, 'boards.columnHasHistory'],
    ['board_not_found', 404, 'common.boardNotFound'],
    ['write_conflict', 409, 'boards.writeConflict'],
  ])('maps column status %s to HTTP %i', async (status, httpStatus, message) => {
    const dataClient = makeDataClient({
      data: [{ status, board_column: null, mutation: { task_count: 2, history_count: 3 } }],
      error: null,
    });
    mocks.createServiceClient.mockReturnValue(dataClient.client);

    const response = await deleteColumn(deleteColumnRequest(), boardParams());

    expect(response.status).toBe(httpStatus);
    await expect(response.json()).resolves.toMatchObject({ error: message });
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });

  it.each([
    ['RPC error', { data: null, error: { message: 'rpc failed' } }],
    ['no result', { data: [], error: null }],
    ['unknown status', { data: [{ status: 'future_status', mutation: null }], error: null }],
    ['malformed create success', { data: [{ status: 'ok', board_column: null, mutation: {} }], error: null }],
  ])('fails closed and logs column %s', async (_case, rpcResult) => {
    const dataClient = makeDataClient(rpcResult);
    mocks.createServiceClient.mockReturnValue(dataClient.client);

    const response = await createColumn(columnRequest({ name: 'Doing' }), boardParams());

    expect(response.status).toBe(500);
    expect(mocks.logError).toHaveBeenCalled();
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });
});

describe('board writer source boundary', () => {
  it('contains no direct DML for boards, columns, or labels', () => {
    const boardSource = readFileSync(resolve(process.cwd(), 'app/api/boards/route.ts'), 'utf8');
    const columnSource = readFileSync(
      resolve(process.cwd(), 'app/api/boards/[id]/columns/route.ts'),
      'utf8',
    );

    expect(boardSource).not.toMatch(
      /\.from\(['"]pyra_(?:boards|board_columns|board_labels)['"]\)[\s\S]{0,160}\.(?:insert|update|delete)\(/,
    );
    expect(columnSource).not.toMatch(
      /\.from\(['"]pyra_board_columns['"]\)[\s\S]{0,160}\.(?:insert|update|delete)\(/,
    );
  });
});
