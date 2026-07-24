import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userClient: null as unknown,
  serviceClient: null as unknown,
  createUserClient: vi.fn(),
  createServiceClient: vi.fn(),
  checkTaskScope: vi.fn(async () => true),
  checkBoardScope: vi.fn(async () => true),
  notifyMany: vi.fn(async (..._args: unknown[]) => undefined),
  sendWhatsAppToUser: vi.fn(async () => false),
  logActivity: vi.fn(),
  logError: vi.fn(),
  invalidateScopeCache: vi.fn(),
  taskRow: {
    id: 'task-1', title: 'Task', board_id: 'bd_production',
    due_date: '2026-07-21', due_at: '2026-07-21T14:00:00.000Z',
    production_deadline_exempt: false,
    updated_at: '2026-07-21T08:00:00.000Z',
  },
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
vi.mock('@/lib/auth/scope', () => ({ invalidateScopeCache: mocks.invalidateScopeCache }));
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

import { DELETE, POST } from '../app/api/tasks/[id]/assignees/route';

function createUserClient() {
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.single = vi.fn(() => builder);
    builder.then = (
      resolvePromise: (value: { data: unknown; error: null }) => unknown,
      rejectPromise: (reason: unknown) => unknown,
    ) => {
      const data = table === 'pyra_tasks'
        ? mocks.taskRow
        : [];
      return Promise.resolve({ data, error: null }).then(resolvePromise, rejectPromise);
    };
    return builder;
  });
  return { from };
}

function request(body: Record<string, unknown>) {
  return { json: vi.fn(async () => body) } as never;
}

beforeEach(() => {
  generatedId = 0;
  mocks.taskRow = {
    id: 'task-1', title: 'Task', board_id: 'bd_production',
    due_date: '2026-07-21', due_at: '2026-07-21T14:00:00.000Z',
    production_deadline_exempt: false,
    updated_at: '2026-07-21T08:00:00.000Z',
  };
  const user = createUserClient();
  const service = {
    rpc: vi.fn(async (functionName: string) => ({
      data: [{
        status: 'ok',
        task: { id: 'task-1', board_id: 'bd_production' },
        mutation: functionName === 'pyra_add_task_assignees_atomic'
          ? { added: ['employee'] }
          : { removed: 'employee' },
      }],
      error: null,
    })),
  };
  mocks.userClient = user;
  mocks.serviceClient = service;
  mocks.createUserClient.mockReset().mockResolvedValue(user);
  mocks.createServiceClient.mockReset().mockReturnValue(service);
  mocks.checkTaskScope.mockReset().mockResolvedValue(true);
  mocks.checkBoardScope.mockReset().mockResolvedValue(true);
  mocks.notifyMany.mockClear();
  mocks.sendWhatsAppToUser.mockClear();
  mocks.logActivity.mockClear();
  mocks.logError.mockClear();
  mocks.invalidateScopeCache.mockClear();
});

describe('task assignee protected writers', () => {
  it('reads and orders by the verified live assigned_at column', () => {
    const source = readFileSync(resolve(
      process.cwd(), 'app/api/tasks/[id]/assignees/route.ts',
    ), 'utf8');
    expect(source).toContain(".select('id, username, assigned_by, assigned_at')");
    expect(source).toContain(".order('assigned_at')");
    expect(source).not.toContain(".order('created_at')");
  });

  it('never creates the service client when the task scope gate fails', async () => {
    mocks.checkTaskScope.mockResolvedValue(false);

    const response = await POST(request({ usernames: ['employee'] }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('rejects duplicate usernames before the service boundary', async () => {
    const response = await POST(request({ usernames: ['employee', 'employee'] }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(422);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('adds assignees with a locked expected board and task version', async () => {
    const response = await POST(request({ usernames: ['employee'] }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(201);
    expect(mocks.checkBoardScope).toHaveBeenCalledWith('bd_production', expect.anything());
    expect((mocks.serviceClient as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      'pyra_add_task_assignees_atomic',
      expect.objectContaining({
        p_task_id: 'task-1',
        p_expected_board_id: 'bd_production',
        p_expected_updated_at: '2026-07-21T08:00:00.000Z',
        p_assigned_by: 'admin',
        p_assignees: [{ id: expect.stringMatching(/^ta_test_/), username: 'employee' }],
      }),
    );
    expect(mocks.notifyMany).toHaveBeenCalledTimes(1);
    expect(mocks.logActivity).toHaveBeenCalledTimes(1);
  });

  it('maps an assignee version conflict to HTTP 409 without postcommit effects', async () => {
    (mocks.serviceClient as { rpc: ReturnType<typeof vi.fn> }).rpc.mockResolvedValue({
      data: [{ status: 'task_write_conflict', task: null, mutation: null }],
      error: null,
    });

    const response = await POST(request({ usernames: ['employee'] }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(409);
    expect(mocks.notifyMany).not.toHaveBeenCalled();
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });

  it.each([
    ['the provenance flag', true],
    ['the literal migration sentinel', false],
  ])('never announces a synthetic deadline time via %s', async (_label, exempt) => {
    mocks.taskRow = {
      ...mocks.taskRow,
      due_at: '2026-07-21T19:59:59.999Z',
      production_deadline_exempt: exempt,
    };

    const response = await POST(request({ usernames: ['employee'] }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(201);
    const notification = mocks.notifyMany.mock.calls[0]?.[2] as { message: string };
    expect(notification.message).toContain('2026-07-21');
    expect(notification.message).not.toContain('الساعة');
    expect(notification.message).not.toContain('23:59');
  });

  it('removes an assignee through the atomic RPC with the same CAS snapshot', async () => {
    const response = await DELETE({
      nextUrl: new URL('https://workspace.test/api/tasks/task-1/assignees?username=employee'),
    } as never, { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(200);
    expect((mocks.serviceClient as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      'pyra_remove_task_assignee_atomic',
      expect.objectContaining({
        p_task_id: 'task-1',
        p_expected_board_id: 'bd_production',
        p_expected_updated_at: '2026-07-21T08:00:00.000Z',
        p_username: 'employee',
      }),
    );
  });

  it('has no direct assignee DML in the route', () => {
    const source = readFileSync(resolve(
      process.cwd(), 'app/api/tasks/[id]/assignees/route.ts',
    ), 'utf8');
    expect(source).not.toMatch(
      /\.from\(['"]pyra_task_assignees['"]\)[\s\S]{0,180}\.(?:insert|delete|update|upsert)\(/,
    );
  });
});
