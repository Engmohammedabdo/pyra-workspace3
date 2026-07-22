import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryCall = {
  table: string;
  kind: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | null;
  payload?: unknown;
  filters: Array<{ method: string; column: string; value: unknown }>;
};

type QueryResult = {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
};

const mocks = vi.hoisted(() => ({
  userClient: null as unknown,
  serviceClient: null as unknown,
  createUserClient: vi.fn(),
  createServiceClient: vi.fn(),
  checkTaskScope: vi.fn(async () => true),
  checkBoardScope: vi.fn(async () => true),
  logError: vi.fn(),
  logActivity: vi.fn(),
  notifyMany: vi.fn(async () => undefined),
  sendWhatsAppToUser: vi.fn(async () => false),
  taskRow: {
    id: 'task-1', title: 'Task', board_id: 'bd_production', column_id: 'work',
    position: 0, due_date: '2026-07-21', due_at: '2026-07-21T14:30:00.000Z',
    production_deadline_exempt: false,
    production_deadline_locked_at: null,
    stage_entered_at: '2026-07-21T08:00:00.000Z', completion_percentage: 50,
    updated_at: '2026-07-21T08:00:00.000Z',
  } as Record<string, unknown>,
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

vi.mock('@/lib/api/activity', () => ({
  ACTIVITY_ACTIONS: { UPDATE: 'update' },
  ENTITY_TYPES: { TASK: 'task' },
  logActivity: mocks.logActivity,
}));
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

import { POST as advanceTask } from '../app/api/boards/[id]/tasks/[taskId]/advance/route';
import { POST as moveTask } from '../app/api/tasks/[id]/move/route';

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
    builder.upsert = vi.fn((payload: unknown) => {
      call.kind = 'upsert';
      call.payload = payload;
      return builder;
    });
    for (const method of ['eq', 'neq', 'is', 'in']) {
      builder[method] = vi.fn((column: string, value: unknown) => {
        call.filters.push({ method, column, value });
        return builder;
      });
    }
    for (const method of ['order', 'limit']) builder[method] = vi.fn(() => builder);
    builder.single = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => builder);
    builder.then = (
      resolvePromise: (value: QueryResult) => unknown,
      rejectPromise: (reason: unknown) => unknown,
    ) => Promise.resolve(userQueryResult(call)).then(resolvePromise, rejectPromise);
    return builder;
  });

  return { client: { from }, calls };
}

function hasFilter(call: QueryCall, column: string, value: unknown) {
  return call.filters.some((filter) => filter.column === column && filter.value === value);
}

function userQueryResult(call: QueryCall): QueryResult {
  if (call.table === 'pyra_boards') {
    if (call.filters.some((filter) => filter.column === 'id' && filter.value === 'bd_pipeline')) {
      return { data: { is_pipeline: true }, error: null };
    }
    return {
      data: {
        id: 'bd_production',
        is_pipeline: true,
        auto_advance: false,
        pyra_board_columns: [
          {
            id: 'work', name: 'Work', position: 0, is_done_column: false,
            requires_approval: false, default_assignee: null, column_type: 'work',
          },
          {
            id: 'review', name: 'Review', position: 1, is_done_column: false,
            requires_approval: false, default_assignee: null, column_type: 'review',
          },
        ],
      },
      error: null,
    };
  }

  if (call.table === 'pyra_tasks' && call.kind === 'select') {
    return {
      data: { ...mocks.taskRow },
      error: null,
    };
  }

  if (call.table === 'pyra_board_columns') {
    if (hasFilter(call, 'id', 'target')) {
      return {
        data: { id: 'target', name: 'Target', column_type: 'work', requires_approval: false },
        error: null,
      };
    }
    return { data: { id: 'work', column_type: 'work', requires_approval: false }, error: null };
  }

  if (call.table === 'pyra_task_stage_history' && call.kind === 'select') {
    return { data: [], count: 0, error: null };
  }
  if (call.table === 'pyra_users' || call.table === 'pyra_task_assignees') {
    return { data: [], error: null };
  }
  return { data: null, error: null };
}

function serviceClientWith(result: QueryResult) {
  return { rpc: vi.fn(async () => result) };
}

function request(body: Record<string, unknown>) {
  return { json: vi.fn(async () => body) } as never;
}

beforeEach(() => {
  generatedId = 0;
  const user = createUserClient();
  mocks.userClient = user.client;
  mocks.createUserClient.mockReset().mockResolvedValue(user.client);
  mocks.createServiceClient.mockReset().mockImplementation(() => mocks.serviceClient);
  mocks.checkTaskScope.mockReset().mockResolvedValue(true);
  mocks.checkBoardScope.mockReset().mockResolvedValue(true);
  mocks.logError.mockClear();
  mocks.logActivity.mockClear();
  mocks.notifyMany.mockClear();
  mocks.sendWhatsAppToUser.mockClear();
  Object.assign(mocks.taskRow, {
    id: 'task-1', title: 'Task', board_id: 'bd_production', column_id: 'work',
    position: 0, due_date: '2026-07-21', due_at: '2026-07-21T14:30:00.000Z',
    production_deadline_exempt: false,
    production_deadline_locked_at: null,
    stage_entered_at: '2026-07-21T08:00:00.000Z', completion_percentage: 50,
    updated_at: '2026-07-21T08:00:00.000Z',
  });
});

describe('atomic advance route', () => {
  it('does not create a service-role client when board scope fails', async () => {
    mocks.checkBoardScope.mockResolvedValue(false);

    const response = await advanceTask(request({ review_link: 'https://review.test/v1' }), {
      params: Promise.resolve({ id: 'bd_production', taskId: 'task-1' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('commits the transition through the service-only RPC and returns success', async () => {
    const service = serviceClientWith({
      data: [{
        status: 'ok',
        task: {
          id: 'task-1', title: 'Task', board_id: 'bd_production', column_id: 'review',
          completion_percentage: 100,
        },
        transition: {
          from_column_id: 'work', to_column_id: 'review', to_column_name: 'Review',
          to_column_type: 'review', to_default_assignee: null, completion_percentage: 100,
        },
      }],
      error: null,
    });
    mocks.serviceClient = service;

    const response = await advanceTask(request({ review_link: 'https://review.test/v1' }), {
      params: Promise.resolve({ id: 'bd_production', taskId: 'task-1' }),
    });

    expect(response.status).toBe(200);
    expect(service.rpc).toHaveBeenCalledWith('pyra_advance_task_atomic', expect.objectContaining({
      p_task_id: 'task-1',
      p_board_id: 'bd_production',
      p_expected_column_id: 'work',
      p_expected_target_column_id: 'review',
      p_expected_target_column_type: 'review',
      p_expected_updated_at: '2026-07-21T08:00:00.000Z',
      p_moved_by: 'admin',
      p_actor_display_name: 'Admin',
      p_activity_id: expect.stringMatching(/^act_test_/),
      p_default_assignee_id: expect.stringMatching(/^ta_test_/),
      p_attachment_file_url: 'https://review.test/v1',
    }));
  });

  it('blocks review for a migration-synthetic deadline before creating the service writer', async () => {
    Object.assign(mocks.taskRow, {
      due_at: '2026-07-21T19:59:59.999Z',
      production_deadline_exempt: false,
    });

    const response = await advanceTask(request({ review_link: 'https://review.test/v1' }), {
      params: Promise.resolve({ id: 'bd_production', taskId: 'task-1' }),
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: 'tasks.productionDeadlineRequired',
    });
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('maps an RPC version conflict to HTTP 409', async () => {
    mocks.serviceClient = serviceClientWith({
      data: [{ status: 'transition_conflict', task: null, transition: null }],
      error: null,
    });

    const response = await advanceTask(request({ review_link: 'https://review.test/v1' }), {
      params: Promise.resolve({ id: 'bd_production', taskId: 'task-1' }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: 'tasks.taskTransitionConflict' });
  });

  it('returns a logged server error when the atomic RPC fails', async () => {
    mocks.serviceClient = serviceClientWith({ data: null, error: { message: 'rpc failed' } });

    const response = await advanceTask(request({ review_link: 'https://review.test/v1' }), {
      params: Promise.resolve({ id: 'bd_production', taskId: 'task-1' }),
    });

    expect(response.status).toBe(500);
    expect(mocks.logError).toHaveBeenCalled();
  });

  it('logs and rejects an unknown advance RPC status as a server contract error', async () => {
    mocks.serviceClient = serviceClientWith({
      data: [{ status: 'future_status', task: null, transition: null }],
      error: null,
    });

    const response = await advanceTask(request({ review_link: 'https://review.test/v1' }), {
      params: Promise.resolve({ id: 'bd_production', taskId: 'task-1' }),
    });

    expect(response.status).toBe(500);
    expect(mocks.logError).toHaveBeenCalled();
  });
});

describe('atomic move route', () => {
  it('does not create a service-role client when task scope fails', async () => {
    mocks.checkTaskScope.mockResolvedValue(false);

    const response = await moveTask(request({ column_id: 'target', position: 0 }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('blocks moving an unverified legacy production task out before a real deadline is recorded', async () => {
    Object.assign(mocks.taskRow, {
      due_at: '2026-07-21T19:59:59.999Z',
      production_deadline_exempt: false,
    });

    const response = await moveTask(request({
      column_id: 'target',
      target_board_id: 'bd_other',
      position: 0,
    }), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: 'tasks.productionDeadlineRequired',
    });
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('rechecks the fresh source-board scope even when the requested move stays on that board', async () => {
    mocks.checkBoardScope.mockResolvedValue(false);

    const response = await moveTask(request({ column_id: 'target', position: 0 }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.checkBoardScope).toHaveBeenCalledWith('bd_production', expect.anything());
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('moves and reorders only through the service-only RPC', async () => {
    const service = serviceClientWith({
      data: [{
        status: 'ok',
        task: {
          id: 'task-1', title: 'Task', board_id: 'bd_production', column_id: 'target',
          completion_percentage: 100,
        },
        transition: {
          from_column_id: 'work', to_column_id: 'target', to_column_name: 'Target',
          to_column_type: 'work', is_cross_column: true, is_cross_board: false,
          is_pipeline_board: true, completion_percentage: 100,
        },
      }],
      error: null,
    });
    mocks.serviceClient = service;

    const response = await moveTask(request({ column_id: 'target', position: 0 }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(200);
    expect(service.rpc).toHaveBeenCalledWith('pyra_move_task_atomic', expect.objectContaining({
      p_task_id: 'task-1',
      p_expected_board_id: 'bd_production',
      p_expected_column_id: 'work',
      p_expected_updated_at: '2026-07-21T08:00:00.000Z',
      p_target_board_id: 'bd_production',
      p_target_column_id: 'target',
      p_target_position: 0,
      p_moved_by: 'admin',
      p_actor_display_name: 'Admin',
      p_activity_id: expect.stringMatching(/^act_test_/),
      p_due_date: null,
      p_due_at: null,
    }));
    expect(mocks.logActivity).toHaveBeenCalledWith(
      'admin',
      'Admin',
      'task_update',
      '/dashboard/boards/bd_production',
      expect.objectContaining({
        source: 'task_move',
        task_id: 'task-1',
        column_id: 'target',
        position: 0,
      }),
    );
  });

  it('maps a move RPC version conflict to HTTP 409', async () => {
    mocks.serviceClient = serviceClientWith({
      data: [{ status: 'transition_conflict', task: null, transition: null }],
      error: null,
    });

    const response = await moveTask(request({ column_id: 'target', position: 0 }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: 'tasks.taskTransitionConflict' });
  });

  it('returns a logged server error when the move RPC fails', async () => {
    mocks.serviceClient = serviceClientWith({ data: null, error: { message: 'rpc failed' } });

    const response = await moveTask(request({ column_id: 'target', position: 0 }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(500);
    expect(mocks.logError).toHaveBeenCalled();
  });

  it('logs and rejects an unknown move RPC status as a server contract error', async () => {
    mocks.serviceClient = serviceClientWith({
      data: [{ status: 'future_status', task: null, transition: null }],
      error: null,
    });

    const response = await moveTask(request({ column_id: 'target', position: 0 }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(500);
    expect(mocks.logError).toHaveBeenCalled();
  });
});

describe('transition route source boundaries', () => {
  it('contains no direct transition DML after the RPC boundary', () => {
    const advanceSource = readFileSync(resolve(
      process.cwd(), 'app/api/boards/[id]/tasks/[taskId]/advance/route.ts',
    ), 'utf8');
    const moveSource = readFileSync(resolve(
      process.cwd(), 'app/api/tasks/[id]/move/route.ts',
    ), 'utf8');

    for (const source of [advanceSource, moveSource]) {
      expect(source).not.toMatch(/\.from\(['"]pyra_tasks['"]\)[\s\S]{0,120}\.update\(/);
      expect(source).not.toMatch(/\.from\(['"]pyra_task_stage_history['"]\)[\s\S]{0,120}\.(?:insert|update|delete)\(/);
      expect(source).not.toMatch(/\.from\(['"]pyra_task_attachments['"]\)[\s\S]{0,120}\.(?:insert|update|delete)\(/);
      expect(source).not.toMatch(/\.from\(['"]pyra_task_labels['"]\)[\s\S]{0,120}\.(?:insert|upsert|update|delete)\(/);
    }
    expect(advanceSource).not.toMatch(/\.from\(['"]pyra_task_assignees['"]\)[\s\S]{0,160}\.insert\(/);
    expect(advanceSource).not.toMatch(/\.from\(['"]pyra_task_activity['"]\)[\s\S]{0,160}\.insert\(/);
    expect(moveSource).not.toMatch(/\.from\(['"]pyra_task_activity['"]\)[\s\S]{0,160}\.insert\(/);
    expect(advanceSource).toContain(
      "a.position - b.position || a.id.localeCompare(b.id)",
    );
  });
});
