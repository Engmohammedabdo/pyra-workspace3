import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryCall = {
  table: string;
  kind: 'select' | 'insert' | 'update' | 'delete' | null;
  payload?: unknown;
  filters: Array<{ method: string; column: string; value: unknown }>;
};

const mocks = vi.hoisted(() => ({
  userClient: null as unknown,
  serviceClient: null as unknown,
  createUserClient: vi.fn(),
  createServiceClient: vi.fn(),
  checkTaskScope: vi.fn(async () => true),
  checkBoardScope: vi.fn(async () => true),
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
  checkTaskScope: mocks.checkTaskScope,
  checkBoardScope: mocks.checkBoardScope,
}));
vi.mock('@/lib/api/activity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api/activity')>();
  return { ...actual, logActivity: mocks.logActivity };
});
vi.mock('@/lib/observability/log-error', () => ({ logError: mocks.logError }));

let generatedId = 0;
vi.mock('@/lib/utils/id', () => ({
  generateId: (prefix: string) => `${prefix}_relation_${++generatedId}`,
}));

import { PATCH as patchTask } from '../app/api/tasks/[id]/route';
import {
  DELETE as deleteChecklist,
  PATCH as patchChecklist,
  POST as addChecklist,
} from '../app/api/tasks/[id]/checklist/route';

function createUserClient() {
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
    for (const method of ['order', 'limit']) builder[method] = vi.fn(() => builder);
    builder.single = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => builder);
    builder.then = (
      resolvePromise: (value: { data: unknown; error: null }) => unknown,
      rejectPromise: (reason: unknown) => unknown,
    ) => Promise.resolve({
      data: table === 'pyra_tasks'
        ? {
          id: 'task-1',
          board_id: 'board-1',
          updated_at: '2026-07-21T10:00:00.000Z',
          production_deadline_locked_at: null,
        }
        : table === 'pyra_task_checklist'
          ? { id: 'item-1', task_id: 'task-1', title: 'Item', is_checked: false, position: 0 }
          : null,
      error: null,
    }).then(resolvePromise, rejectPromise);
    return builder;
  });
  return { client: { from }, calls };
}

function request(body: Record<string, unknown>, query = '') {
  return {
    json: vi.fn(async () => body),
    nextUrl: new URL(`https://workspace.test/api/tasks/task-1/checklist${query}`),
  } as never;
}

function serviceWith(status = 'ok') {
  return {
    rpc: vi.fn(async (name: string) => ({
      data: [{
        status,
        task: status === 'ok' ? { id: 'task-1', board_id: 'board-1' } : null,
        mutation: status === 'ok'
          ? {
            item: name === 'pyra_mutate_task_checklist_atomic'
              ? { id: 'item-1', task_id: 'task-1', title: 'Item', is_checked: false, position: 0 }
              : null,
          }
          : null,
      }],
      error: null,
    })),
  };
}

beforeEach(() => {
  generatedId = 0;
  const user = createUserClient();
  mocks.userClient = user.client;
  mocks.createUserClient.mockReset().mockResolvedValue(user.client);
  mocks.serviceClient = serviceWith();
  mocks.createServiceClient.mockReset().mockImplementation(() => mocks.serviceClient);
  mocks.checkTaskScope.mockReset().mockResolvedValue(true);
  mocks.checkBoardScope.mockReset().mockResolvedValue(true);
  mocks.logActivity.mockClear();
  mocks.logError.mockClear();
});

describe('atomic task-label writer', () => {
  it('mutates a label through one service RPC using the fresh board/version snapshot', async () => {
    const response = await patchTask(request({ _add_label: 'label-1' }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(200);
    expect((mocks.serviceClient as ReturnType<typeof serviceWith>).rpc).toHaveBeenCalledWith(
      'pyra_mutate_task_label_atomic',
      expect.objectContaining({
        p_task_id: 'task-1',
        p_expected_board_id: 'board-1',
        p_expected_updated_at: '2026-07-21T10:00:00.000Z',
        p_action: 'add',
        p_label_id: 'label-1',
      }),
    );
  });

  it('maps a stale label mutation to 409 without postcommit activity', async () => {
    mocks.serviceClient = serviceWith('task_write_conflict');
    const response = await patchTask(request({ _remove_label: 'label-1' }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(409);
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });
});

describe('atomic task-checklist writer', () => {
  it('adds an item through one RPC and lets PostgreSQL assign the position', async () => {
    const response = await addChecklist(request({ title: ' Item ' }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(201);
    expect((mocks.serviceClient as ReturnType<typeof serviceWith>).rpc).toHaveBeenCalledWith(
      'pyra_mutate_task_checklist_atomic',
      expect.objectContaining({
        p_task_id: 'task-1',
        p_expected_board_id: 'board-1',
        p_expected_updated_at: '2026-07-21T10:00:00.000Z',
        p_action: 'add',
        p_updates: { title: 'Item', is_checked: false },
      }),
    );
  });

  it('passes PATCH and DELETE through the same CAS RPC contract', async () => {
    const patchResponse = await patchChecklist(request(
      { is_checked: true },
      '?itemId=item-1',
    ), { params: Promise.resolve({ id: 'task-1' }) });
    const deleteResponse = await deleteChecklist(request(
      {},
      '?itemId=item-1',
    ), { params: Promise.resolve({ id: 'task-1' }) });

    expect(patchResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(200);
    const rpc = (mocks.serviceClient as ReturnType<typeof serviceWith>).rpc;
    expect(rpc).toHaveBeenCalledWith('pyra_mutate_task_checklist_atomic', expect.objectContaining({
      p_action: 'update', p_item_id: 'item-1', p_updates: { is_checked: true },
    }));
    expect(rpc).toHaveBeenCalledWith('pyra_mutate_task_checklist_atomic', expect.objectContaining({
      p_action: 'delete', p_item_id: 'item-1', p_updates: {},
    }));
  });
});

describe('task relation writer source boundary', () => {
  it('contains no direct label/checklist/activity DML in either route', () => {
    const taskSource = readFileSync(resolve(process.cwd(), 'app/api/tasks/[id]/route.ts'), 'utf8');
    const checklistSource = readFileSync(
      resolve(process.cwd(), 'app/api/tasks/[id]/checklist/route.ts'),
      'utf8',
    );
    expect(taskSource).not.toMatch(/\.from\(['"]pyra_task_labels['"]\)[\s\S]{0,160}\.(?:insert|delete)\(/);
    expect(checklistSource).not.toMatch(/\.from\(['"]pyra_task_checklist['"]\)[\s\S]{0,180}\.(?:insert|update|delete)\(/);
    expect(checklistSource).not.toMatch(/\.from\(['"]pyra_task_activity['"]\)[\s\S]{0,160}\.insert\(/);
  });
});
