import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = {
  data?: unknown;
  error?: { message: string } | null;
};

const mocks = vi.hoisted(() => ({
  userClient: null as unknown,
  serviceClient: null as unknown,
  createUserClient: vi.fn(),
  createServiceClient: vi.fn(),
  checkBoardScope: vi.fn(async () => true),
  logError: vi.fn(),
  logActivity: vi.fn(),
  notifyMany: vi.fn(async () => undefined),
  sendWhatsAppToUser: vi.fn(async () => false),
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
  generateId: (prefix: string) => `${prefix}_review_${++generatedId}`,
}));

import { POST as reviewTask } from '../app/api/boards/[id]/tasks/[taskId]/approve/route';

const columns = [
  {
    id: 'work', name: 'Work', position: 0, column_type: 'work',
    is_done_column: false, requires_approval: false, default_assignee: null,
  },
  {
    id: 'review', name: 'Review', position: 1, column_type: 'review',
    is_done_column: false, requires_approval: false, default_assignee: null,
  },
  {
    id: 'approved', name: 'Approved', position: 2, column_type: 'approved',
    is_done_column: false, requires_approval: true, default_assignee: null,
  },
];

function queryResult(table: string, kind: string | null): QueryResult {
  if (table === 'pyra_boards' && kind === 'select') {
    return {
      data: { id: 'bd_production', is_pipeline: true, pyra_board_columns: columns },
      error: null,
    };
  }
  if (table === 'pyra_board_columns' && kind === 'select') {
    return { data: columns, error: null };
  }
  if (table === 'pyra_tasks' && kind === 'select') {
    return {
      data: {
        id: 'task-1', title: 'Task', board_id: 'bd_production', column_id: 'review',
        stage_entered_at: '2026-07-21T08:00:00.000Z', completion_percentage: 50,
        updated_at: '2026-07-21T09:00:00.000Z',
      },
      error: null,
    };
  }
  if (table === 'pyra_task_assignees' && kind === 'select') {
    return { data: [{ username: 'employee.one' }], error: null };
  }
  return { data: null, error: null };
}

function createUserClient() {
  const from = vi.fn((table: string) => {
    let kind: string | null = null;
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => { kind = 'select'; return builder; });
    builder.insert = vi.fn(() => { kind = 'insert'; return builder; });
    builder.update = vi.fn(() => { kind = 'update'; return builder; });
    for (const method of ['eq', 'order', 'limit']) {
      builder[method] = vi.fn(() => builder);
    }
    builder.single = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => builder);
    builder.then = (
      resolvePromise: (value: QueryResult) => unknown,
      rejectPromise: (reason: unknown) => unknown,
    ) => Promise.resolve(queryResult(table, kind)).then(resolvePromise, rejectPromise);
    return builder;
  });
  return { from };
}

function serviceClientWith(result: QueryResult) {
  return { rpc: vi.fn(async () => result) };
}

function request(body: Record<string, unknown>) {
  return { json: vi.fn(async () => body) } as never;
}

function rejectionDecision(status = 'ok') {
  return {
    data: [{
      status,
      task: status === 'ok'
        ? { id: 'task-1', title: 'Task', board_id: 'bd_production', column_id: 'work' }
        : null,
      decision: status === 'ok'
        ? {
          action: 'reject', from_column_id: 'review', to_column_id: 'work',
          to_column_name: 'Work', to_column_type: 'work', to_is_done_column: false,
          to_default_assignee: null, completion_percentage: 33,
          rejection_kind: 'outright',
        }
        : null,
    }],
    error: null,
  };
}

beforeEach(() => {
  generatedId = 0;
  mocks.userClient = createUserClient();
  mocks.createUserClient.mockReset().mockResolvedValue(mocks.userClient);
  mocks.createServiceClient.mockReset().mockImplementation(() => mocks.serviceClient);
  mocks.checkBoardScope.mockReset().mockResolvedValue(true);
  mocks.logError.mockClear();
  mocks.logActivity.mockClear();
  mocks.notifyMany.mockClear();
  mocks.sendWhatsAppToUser.mockClear();
});

describe('atomic task review route', () => {
  it('does not create a service client when board scope fails', async () => {
    mocks.checkBoardScope.mockResolvedValue(false);

    const response = await reviewTask(request({ action: 'approve' }), {
      params: Promise.resolve({ id: 'bd_production', taskId: 'task-1' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('rejects an unknown rejection marker before any service-role write', async () => {
    const response = await reviewTask(request({
      action: 'reject',
      note: 'Must be rebuilt',
      rejection_kind: 'OUTRIGHT',
    }), {
      params: Promise.resolve({ id: 'bd_production', taskId: 'task-1' }),
    });

    expect(response.status).toBe(422);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('commits an outright rejection through the service-only RPC', async () => {
    const service = serviceClientWith(rejectionDecision());
    mocks.serviceClient = service;

    const response = await reviewTask(request({
      action: 'reject',
      note: 'Must be rebuilt',
      rejection_kind: 'outright',
    }), {
      params: Promise.resolve({ id: 'bd_production', taskId: 'task-1' }),
    });

    expect(response.status).toBe(200);
    expect(service.rpc).toHaveBeenCalledWith('pyra_review_task_atomic', {
      p_task_id: 'task-1',
      p_board_id: 'bd_production',
      p_expected_column_id: 'review',
      p_expected_updated_at: '2026-07-21T09:00:00.000Z',
      p_actor_username: 'admin',
      p_actor_display_name: 'Admin',
      p_action: 'reject',
      p_note: 'Must be rebuilt',
      p_rejection_kind: 'outright',
      p_history_id: expect.stringMatching(/^sh_review_/),
      p_default_assignee_id: expect.stringMatching(/^ta_review_/),
      p_comment_id: expect.stringMatching(/^tc_review_/),
      p_activity_id: expect.stringMatching(/^act_review_/),
    });
    expect(mocks.logActivity).toHaveBeenCalledWith(
      'admin',
      'Admin',
      'task_update',
      '/dashboard/boards/bd_production',
      expect.objectContaining({
        source: 'task_review_reject',
        task_id: 'task-1',
        rejection_kind: 'outright',
      }),
    );
  });

  it('passes no rejection marker for approval', async () => {
    const service = serviceClientWith({
      data: [{
        status: 'ok',
        task: { id: 'task-1', title: 'Task', board_id: 'bd_production', column_id: 'approved' },
        decision: {
          action: 'approve', from_column_id: 'review', to_column_id: 'approved',
          to_column_name: 'Approved', to_column_type: 'approved',
          to_is_done_column: false, to_default_assignee: null,
          completion_percentage: 100, rejection_kind: null,
        },
      }],
      error: null,
    });
    mocks.serviceClient = service;

    const response = await reviewTask(request({ action: 'approve' }), {
      params: Promise.resolve({ id: 'bd_production', taskId: 'task-1' }),
    });

    expect(response.status).toBe(200);
    expect(service.rpc).toHaveBeenCalledWith(
      'pyra_review_task_atomic',
      expect.objectContaining({ p_action: 'approve', p_rejection_kind: null }),
    );
  });

  it('maps a concurrent review decision to HTTP 409', async () => {
    mocks.serviceClient = serviceClientWith(rejectionDecision('transition_conflict'));

    const response = await reviewTask(request({
      action: 'reject', note: 'Must be rebuilt', rejection_kind: 'outright',
    }), {
      params: Promise.resolve({ id: 'bd_production', taskId: 'task-1' }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: 'tasks.taskTransitionConflict',
    });
  });
});

describe('review route source boundary', () => {
  it('contains no direct review-state DML after the RPC boundary', () => {
    const source = readFileSync(resolve(
      process.cwd(), 'app/api/boards/[id]/tasks/[taskId]/approve/route.ts',
    ), 'utf8');

    for (const table of [
      'pyra_tasks',
      'pyra_task_stage_history',
      'pyra_task_assignees',
      'pyra_task_comments',
      'pyra_task_activity',
    ]) {
      expect(source).not.toMatch(new RegExp(
        `\\.from\\(['"]${table}['"]\\)[\\s\\S]{0,180}\\.(?:insert|update|delete|upsert)\\(`,
      ));
    }
    expect(source).toContain('createServiceRoleClient');
    expect(source).toContain('checkBoardScope');
    expect(source).toContain("'pyra_review_task_atomic'");
    expect(source).toContain('isTaskRejectionKind');
  });
});
