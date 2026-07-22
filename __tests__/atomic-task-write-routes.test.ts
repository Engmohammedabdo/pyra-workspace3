import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryCall = {
  table: string;
  kind: 'select' | 'insert' | 'update' | 'delete' | null;
  filters: Array<{ column: string; value: unknown }>;
};

const mocks = vi.hoisted(() => ({
  userClient: null as unknown,
  serviceClient: null as unknown,
  createUserClient: vi.fn(),
  createServiceClient: vi.fn(),
  checkBoardScope: vi.fn(async () => true),
  checkTaskScope: vi.fn(async () => true),
  invalidateScopeCache: vi.fn(),
  notifyMany: vi.fn(async () => undefined),
  sendWhatsAppToUser: vi.fn(async () => false),
  logActivity: vi.fn(),
  logError: vi.fn(),
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
  createServerSupabaseClient: mocks.createUserClient,
  createServiceRoleClient: mocks.createServiceClient,
}));
vi.mock('@/lib/auth/task-scope', () => ({
  checkBoardScope: mocks.checkBoardScope,
  checkTaskScope: mocks.checkTaskScope,
}));
vi.mock('@/lib/auth/scope', () => ({
  resolveUserScope: vi.fn(),
  invalidateScopeCache: mocks.invalidateScopeCache,
}));
vi.mock('@/lib/api/activity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api/activity')>();
  return { ...actual, logActivity: mocks.logActivity };
});
vi.mock('@/lib/observability/log-error', () => ({ logError: mocks.logError }));
vi.mock('@/lib/notifications/notify', () => ({ notifyMany: mocks.notifyMany }));
vi.mock('@/lib/notifications/whatsapp', () => ({
  APP_URL: 'https://workspace.test',
  sendWhatsAppToUser: mocks.sendWhatsAppToUser,
}));

let generatedId = 0;
vi.mock('@/lib/utils/id', () => ({
  generateId: (prefix: string) => `${prefix}_test_${++generatedId}`,
}));

import { POST as createTask } from '../app/api/boards/[id]/tasks/route';
import { POST as duplicateTask } from '../app/api/tasks/[id]/duplicate/route';

function createUserClient() {
  const calls: QueryCall[] = [];
  const from = vi.fn((table: string) => {
    const call: QueryCall = { table, kind: null, filters: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => {
      call.kind = 'select';
      return builder;
    });
    builder.insert = vi.fn(() => {
      call.kind = 'insert';
      return builder;
    });
    builder.update = vi.fn(() => {
      call.kind = 'update';
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
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.single = vi.fn(() => builder);
    builder.then = (
      resolvePromise: (value: { data: unknown; error: null }) => unknown,
      rejectPromise: (reason: unknown) => unknown,
    ) => Promise.resolve(userResult(call)).then(resolvePromise, rejectPromise);
    return builder;
  });
  return { client: { from }, calls };
}

function userResult(call: QueryCall) {
  if (call.table === 'pyra_board_columns') {
    return {
      data: { id: 'column-source', column_type: 'work', requires_approval: false },
      error: null,
    };
  }
  if (call.table === 'pyra_tasks') {
    return {
      data: {
        id: 'task-1',
        board_id: 'bd_source',
        column_id: 'column-source',
        title: 'Original',
        description: 'Description',
        priority: 'high',
        due_date: '2026-07-22',
        due_at: null,
        start_date: '2026-07-21',
        estimated_hours: 4,
        updated_at: '2026-07-21T08:00:00.000Z',
        pyra_task_assignees: [{ username: 'employee' }],
        pyra_task_labels: [{ label_id: 'label-1' }],
        pyra_task_checklist: [{ title: 'Check', position: 0 }],
      },
      error: null,
    };
  }
  return { data: null, error: null };
}

function rpcSuccess(functionName: string) {
  if (functionName === 'pyra_create_task_atomic') {
    return { status: 'ok', task: { id: 'tk_test_1', board_id: 'bd_source' }, mutation: { assignees: ['employee'] } };
  }
  return { status: 'ok', task: { id: 'tk_test_1', board_id: 'bd_source' }, mutation: { source_task_id: 'task-1' } };
}

function request(body: Record<string, unknown>) {
  return { json: vi.fn(async () => body) } as never;
}

beforeEach(() => {
  generatedId = 0;
  const user = createUserClient();
  const service = {
    rpc: vi.fn(async (functionName: string) => ({ data: [rpcSuccess(functionName)], error: null })),
  };
  mocks.userClient = user;
  mocks.serviceClient = service;
  mocks.createUserClient.mockReset().mockResolvedValue(user.client);
  mocks.createServiceClient.mockReset().mockReturnValue(service);
  mocks.checkBoardScope.mockReset().mockResolvedValue(true);
  mocks.checkTaskScope.mockReset().mockResolvedValue(true);
  mocks.invalidateScopeCache.mockClear();
  mocks.notifyMany.mockClear();
  mocks.sendWhatsAppToUser.mockClear();
  mocks.logActivity.mockClear();
  mocks.logError.mockClear();
});

describe('atomic task create route', () => {
  it('does not create a service client before the board scope gate', async () => {
    mocks.checkBoardScope.mockResolvedValue(false);

    const response = await createTask(request({ title: 'Task', column_id: 'column-source' }), {
      params: Promise.resolve({ id: 'bd_source' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('rejects duplicate assignees before the service boundary', async () => {
    const response = await createTask(request({
      title: 'Task',
      column_id: 'column-source',
      assignees: ['employee', 'employee'],
    }), { params: Promise.resolve({ id: 'bd_source' }) });

    expect(response.status).toBe(422);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('creates the task and its assignees only through one RPC', async () => {
    const response = await createTask(request({
      title: 'Task',
      column_id: 'column-source',
      assignees: ['employee'],
    }), { params: Promise.resolve({ id: 'bd_source' }) });

    expect(response.status).toBe(201);
    expect((mocks.serviceClient as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      'pyra_create_task_atomic',
      expect.objectContaining({
        p_board_id: 'bd_source',
        p_column_id: 'column-source',
        p_created_by: 'admin',
        p_assignees: [{ id: expect.stringMatching(/^ta_test_/), username: 'employee' }],
      }),
    );
    expect(mocks.notifyMany).toHaveBeenCalledTimes(1);
    expect(mocks.logActivity).toHaveBeenCalledTimes(1);
  });

  it('does not send notifications or activity when the transaction fails', async () => {
    (mocks.serviceClient as { rpc: ReturnType<typeof vi.fn> }).rpc
      .mockResolvedValue({ data: null, error: { message: 'relation insert failed' } });

    const response = await createTask(request({
      title: 'Task', column_id: 'column-source', assignees: ['employee'],
    }), { params: Promise.resolve({ id: 'bd_source' }) });

    expect(response.status).toBe(500);
    expect(mocks.notifyMany).not.toHaveBeenCalled();
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });
});

describe('atomic task duplicate route', () => {
  it('does not create a service client when source scope fails', async () => {
    mocks.checkTaskScope.mockResolvedValue(false);

    const response = await duplicateTask(request({}), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('duplicates the locked source and all relation id pools through one RPC', async () => {
    const response = await duplicateTask(request({}), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(201);
    expect((mocks.serviceClient as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      'pyra_duplicate_task_atomic',
      expect.objectContaining({
        p_source_task_id: 'task-1',
        p_expected_source_board_id: 'bd_source',
        p_expected_source_updated_at: '2026-07-21T08:00:00.000Z',
        p_target_board_id: 'bd_source',
        p_target_column_id: 'column-source',
        p_assignee_ids: [expect.stringMatching(/^ta_test_/)],
        p_checklist_ids: [expect.stringMatching(/^cl_test_/)],
        p_activity_id: expect.stringMatching(/^tl_test_/),
      }),
    );
    expect(mocks.logActivity).toHaveBeenCalledTimes(1);
  });

  it('does not record postcommit activity when relation copying aborts', async () => {
    (mocks.serviceClient as { rpc: ReturnType<typeof vi.fn> }).rpc
      .mockResolvedValue({ data: null, error: { message: 'checklist insert failed' } });

    const response = await duplicateTask(request({}), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(500);
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });
});

describe('task create/duplicate source boundaries', () => {
  it('contains no direct task or relation DML after moving writes into RPCs', () => {
    const sources = [
      readFileSync(resolve(process.cwd(), 'app/api/boards/[id]/tasks/route.ts'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'app/api/tasks/[id]/duplicate/route.ts'), 'utf8'),
    ];
    for (const source of sources) {
      for (const table of [
        'pyra_tasks', 'pyra_task_assignees', 'pyra_task_labels',
        'pyra_task_checklist', 'pyra_task_activity',
      ]) {
        expect(source).not.toMatch(new RegExp(
          `\\.from\\(['"]${table}['"]\\)[\\s\\S]{0,180}\\.(?:insert|update|delete|upsert)\\(`,
        ));
      }
    }
  });

  it('passes every RPC parameter with the exact migration name and order', () => {
    const migration = readFileSync(resolve(
      process.cwd(), 'supabase/migrations/042_atomic_task_transitions.sql',
    ), 'utf8');
    const routeSources = {
      pyra_create_task_atomic: readFileSync(resolve(
        process.cwd(), 'app/api/boards/[id]/tasks/route.ts',
      ), 'utf8'),
      pyra_duplicate_task_atomic: readFileSync(resolve(
        process.cwd(), 'app/api/tasks/[id]/duplicate/route.ts',
      ), 'utf8'),
      pyra_add_task_assignees_atomic: readFileSync(resolve(
        process.cwd(), 'app/api/tasks/[id]/assignees/route.ts',
      ), 'utf8'),
      pyra_remove_task_assignee_atomic: readFileSync(resolve(
        process.cwd(), 'app/api/tasks/[id]/assignees/route.ts',
      ), 'utf8'),
    };

    for (const [functionName, routeSource] of Object.entries(routeSources)) {
      const signature = migration.match(new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${functionName}\\(([\\s\\S]*?)\\n\\)\\nRETURNS`,
      ))?.[1];
      expect(signature, `${functionName} migration signature`).toBeTruthy();
      const migrationNames = [...(signature || '').matchAll(/^\s*(p_[a-z0-9_]+)\s+/gim)]
        .map((match) => match[1]);

      const rpcStart = routeSource.indexOf(`'${functionName}'`);
      expect(rpcStart, `${functionName} route call`).toBeGreaterThanOrEqual(0);
      const rpcEnd = routeSource.indexOf('\n      },\n    );', rpcStart);
      expect(rpcEnd, `${functionName} route object end`).toBeGreaterThan(rpcStart);
      const routeNames = [...routeSource.slice(rpcStart, rpcEnd).matchAll(/^\s*(p_[a-z0-9_]+):/gim)]
        .map((match) => match[1]);
      expect(routeNames, functionName).toEqual(migrationNames);
    }
  });
});
