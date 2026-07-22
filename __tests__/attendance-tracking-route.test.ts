import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireApiPermission: vi.fn(),
  createServiceRoleClient: vi.fn(),
  getTranslations: vi.fn(),
  logActivity: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('next-intl/server', () => ({ getTranslations: mocks.getTranslations }));
vi.mock('@/lib/api/auth', () => ({
  requireApiPermission: mocks.requireApiPermission,
  isApiError: vi.fn((value: unknown) => value instanceof Response),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));
vi.mock('@/lib/api/activity', () => ({
  logActivity: mocks.logActivity,
  ACTIVITY_ACTIONS: { UPDATE: 'update' },
  ENTITY_TYPES: { USER: 'user' },
}));
vi.mock('@/lib/observability/log-error', () => ({ logError: mocks.logError }));
vi.mock('@/lib/utils/format', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/utils/format')>()),
  dubaiDayKey: vi.fn(() => '2026-07-22'),
}));

import { PATCH } from '@/app/api/hr/deductions/attendance-tracking/route';

const auth = {
  pyraUser: {
    username: 'admin',
    display_name: 'Admin',
    role: 'admin',
    rolePermissions: ['*'],
  },
};

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/hr/deductions/attendance-tracking', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function serviceClient({
  employee = {
    username: 'wael.hany',
    role: 'employee',
    status: 'active',
    hire_date: '2026-06-22',
  },
}: {
  employee?: Record<string, unknown> | null;
} = {}) {
  let operation: 'select' | 'update' = 'select';
  const update = vi.fn((payload: Record<string, unknown>) => {
    operation = 'update';
    return builder;
  });
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.update = update;
  builder.eq = vi.fn(() => builder);
  builder.is = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => ({
    data: operation === 'update'
      ? {
          ...employee,
          attendance_tracking_started_on: '2026-07-01',
          attendance_tracking_start_source: 'admin',
        }
      : employee,
    error: null,
  }));
  builder.single = vi.fn(async () => ({
    data: operation === 'update'
      ? {
          ...employee,
          attendance_tracking_started_on: '2026-07-01',
          attendance_tracking_start_source: 'admin',
        }
      : employee,
    error: null,
  }));
  return { from: vi.fn(() => builder), update };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireApiPermission.mockResolvedValue(auth);
  mocks.getTranslations.mockResolvedValue((key: string) => key);
  mocks.createServiceRoleClient.mockReturnValue(serviceClient());
});

describe('PATCH /api/hr/deductions/attendance-tracking', () => {
  it('checks hr.manage before creating a service-role client', async () => {
    mocks.requireApiPermission.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await PATCH(request({
      username: 'wael.hany',
      started_on: '2026-07-01',
    }));

    expect(response.status).toBe(403);
    expect(mocks.requireApiPermission).toHaveBeenCalledWith('hr.manage');
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it('rejects future or pre-hire dates without writing', async () => {
    const client = serviceClient();
    mocks.createServiceRoleClient.mockReturnValue(client);

    const future = await PATCH(request({
      username: 'wael.hany',
      started_on: '2026-07-23',
    }));
    const beforeHire = await PATCH(request({
      username: 'wael.hany',
      started_on: '2026-06-21',
    }));

    expect(future.status).toBe(422);
    expect(beforeHire.status).toBe(422);
    expect(client.update).not.toHaveBeenCalled();
  });

  it('records an explicit admin tracking start and logs its source', async () => {
    const client = serviceClient();
    mocks.createServiceRoleClient.mockReturnValue(client);

    const response = await PATCH(request({
      username: 'wael.hany',
      started_on: '2026-07-01',
    }));

    expect(response.status).toBe(200);
    expect(client.update).toHaveBeenCalledWith({
      attendance_tracking_started_on: '2026-07-01',
      attendance_tracking_start_source: 'admin',
    });
    expect(mocks.logActivity).toHaveBeenCalledWith(
      'admin',
      'Admin',
      'user_update',
      '/dashboard/hr/deductions',
      expect.objectContaining({
        source: 'attendance_tracking_start_admin',
        username: 'wael.hany',
        started_on: '2026-07-01',
      }),
      undefined,
    );
  });

  it('does not overwrite a tracking start that is already documented', async () => {
    const client = serviceClient({
      employee: {
        username: 'wael.hany',
        role: 'employee',
        status: 'active',
        hire_date: '2026-06-22',
        attendance_tracking_started_on: '2026-06-24',
        attendance_tracking_start_source: 'observed',
      },
    });
    mocks.createServiceRoleClient.mockReturnValue(client);

    const response = await PATCH(request({
      username: 'wael.hany',
      started_on: '2026-07-01',
    }));

    expect(response.status).toBe(409);
    expect(client.update).not.toHaveBeenCalled();
  });
});
