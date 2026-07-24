import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  client: null as unknown,
  notifyMany: vi.fn(async () => undefined),
  sendWhatsAppToUser: vi.fn(async () => false),
  logError: vi.fn(),
}));

vi.mock('@/lib/api/external-auth', () => ({
  getExternalAuth: vi.fn(async () => ({
    apiKey: { permissions: ['cron.task-deadline-reminders'] },
  })),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(() => mocks.client),
}));
vi.mock('@/lib/notifications/notify', () => ({ notifyMany: mocks.notifyMany }));
vi.mock('@/lib/notifications/whatsapp', () => ({
  APP_URL: 'https://workspace.test',
  sendWhatsAppToUser: mocks.sendWhatsAppToUser,
}));
vi.mock('@/lib/observability/log-error', () => ({ logError: mocks.logError }));

import { POST as runDeadlineReminders } from '@/app/api/cron/task-deadline-reminders/route';
import { countVerifiedExactDeadlineRows } from '@/lib/production/my-work';

function createReminderClient() {
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'or', 'order', 'limit', 'gt', 'gte']) {
      builder[method] = vi.fn(() => builder);
    }
    builder.then = (
      resolvePromise: (value: { data?: unknown; count?: number; error: null }) => unknown,
      rejectPromise: (reason: unknown) => unknown,
    ) => {
      const result = table === 'pyra_boards'
        ? {
            data: [{
              id: 'bd_production',
              pyra_board_columns: [{ id: 'col-working', is_done_column: false }],
            }],
            error: null,
          }
        : table === 'pyra_tasks'
          ? {
              data: [{
                id: 'task-sentinel',
                title: 'Legacy synthetic deadline',
                board_id: 'bd_production',
                column_id: 'col-working',
                due_date: '2026-07-21',
                due_at: '2026-07-21T19:59:59.999Z',
                production_deadline_exempt: false,
                is_archived: false,
                pyra_task_assignees: [{ username: 'employee' }],
              }],
              error: null,
            }
          : table === 'pyra_notifications'
            ? { data: null, count: 0, error: null }
            : { data: [], error: null };
      return Promise.resolve(result).then(resolvePromise, rejectPromise);
    };
    return builder;
  });
  return { from };
}

describe('unverified deadline consumers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-22T05:00:00.000Z');
    mocks.client = createReminderClient();
    mocks.notifyMany.mockClear();
    mocks.sendWhatsAppToUser.mockClear();
    mocks.logError.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not send a deadline reminder for the literal migration sentinel', async () => {
    const response = await runDeadlineReminders(
      new NextRequest('http://localhost/api/cron/task-deadline-reminders', { method: 'POST' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { processed: 0 } });
    expect(mocks.notifyMany).not.toHaveBeenCalled();
    expect(mocks.sendWhatsAppToUser).not.toHaveBeenCalled();
  });

  it('uses the shared board deadline guard in both employee task surfaces', () => {
    const myTasks = readFileSync(resolve(
      process.cwd(), 'app/dashboard/my-tasks/my-tasks-client.tsx',
    ), 'utf8');
    const projectEmbed = readFileSync(resolve(
      process.cwd(), 'app/dashboard/projects/[id]/project-board-embed.tsx',
    ), 'utf8');

    expect(myTasks).toContain('getBoardTaskDeadline');
    expect(myTasks).toContain('isBoardTaskDeadlineOverdue');
    expect(projectEmbed).toContain('getBoardTaskDeadline');
    expect(projectEmbed).toContain('isBoardTaskDeadlineOverdue');
  });

  it('excludes provenance-marked tasks from both employee dashboard overdue counts', () => {
    const dashboard = readFileSync(resolve(process.cwd(), 'app/api/dashboard/route.ts'), 'utf8');
    const filters = dashboard.match(
      /\.eq\('pyra_tasks\.production_deadline_exempt', false\)/g,
    ) ?? [];

    expect(filters).toHaveLength(2);
  });

  it('filters the literal migration sentinel from SQL dashboard candidates before 044', () => {
    const rows = [
      {
        task_id: 'sentinel',
        pyra_tasks: {
          due_date: '2026-07-21',
          due_at: '2026-07-21T19:59:59.999Z',
          production_deadline_exempt: false,
        },
      },
      {
        task_id: 'real',
        pyra_tasks: {
          due_date: '2026-07-21',
          due_at: '2026-07-21T18:30:00.000Z',
          production_deadline_exempt: false,
        },
      },
    ];

    expect(countVerifiedExactDeadlineRows(rows)).toBe(1);
    const dashboard = readFileSync(resolve(process.cwd(), 'app/api/dashboard/route.ts'), 'utf8');
    expect(dashboard).toContain('countVerifiedExactDeadlineRows');
  });
});
