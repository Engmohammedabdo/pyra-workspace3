import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getTranslations: vi.fn(),
  requireApiPermission: vi.fn(),
  createServiceRoleClient: vi.fn(),
  loadMonthlyDeductionsReport: vi.fn(),
  resolveAdminDeductionsMonth: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}));

vi.mock('@/lib/api/auth', () => ({
  requireApiPermission: mocks.requireApiPermission,
  isApiError: vi.fn((value: unknown) => value instanceof Response),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

vi.mock('@/lib/hr/deductions-report', () => ({
  loadMonthlyDeductionsReport: mocks.loadMonthlyDeductionsReport,
  resolveAdminDeductionsMonth: mocks.resolveAdminDeductionsMonth,
}));

vi.mock('@/lib/utils/format', () => ({
  dubaiDayKey: vi.fn(() => '2026-07-22'),
}));

vi.mock('@/lib/observability/log-error', () => ({
  logError: mocks.logError,
}));

import { GET as getAdminDeductions } from '@/app/api/hr/deductions/route';
import { GET as getMyDeductions } from '@/app/api/hr/deductions/me/route';

function auth(role: string, username = 'alice') {
  return {
    userId: 'auth-1',
    email: `${username}@example.test`,
    pyraUser: {
      username,
      display_name: username,
      role,
      rolePermissions: role === 'admin' ? ['*'] : ['payroll.view'],
    },
  };
}

const report = {
  month: '2026-07',
  as_of_date: '2026-07-22',
  generated_at: '2026-07-22T08:00:00.000Z',
  employees: [{ username: 'alice' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTranslations.mockResolvedValue((key: string) => key);
  mocks.createServiceRoleClient.mockReturnValue({ client: 'service' });
  mocks.resolveAdminDeductionsMonth.mockImplementation(
    (requested: string | null, current: string) => requested ?? current,
  );
  mocks.loadMonthlyDeductionsReport.mockResolvedValue(report);
});

describe('GET /api/hr/deductions', () => {
  it('logs and contains translation-loading failures', async () => {
    mocks.getTranslations.mockRejectedValueOnce(new Error('catalog unavailable'));

    const response = await getAdminDeductions(
      new NextRequest('http://localhost/api/hr/deductions'),
    );

    expect(response.status).toBe(500);
    expect(mocks.logError).toHaveBeenCalledOnce();
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it('stops at hr.manage before creating a service-role client', async () => {
    mocks.requireApiPermission.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await getAdminDeductions(
      new NextRequest('http://localhost/api/hr/deductions?month=2026-06'),
    );

    expect(response.status).toBe(403);
    expect(mocks.requireApiPermission).toHaveBeenCalledWith('hr.manage');
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
    expect(mocks.loadMonthlyDeductionsReport).not.toHaveBeenCalled();
  });

  it('loads an explicitly validated current or past month for all candidate employees', async () => {
    mocks.requireApiPermission.mockResolvedValue(auth('admin', 'admin'));

    const response = await getAdminDeductions(
      new NextRequest('http://localhost/api/hr/deductions?month=2026-06'),
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveAdminDeductionsMonth).toHaveBeenCalledWith('2026-06', '2026-07');
    expect(mocks.loadMonthlyDeductionsReport).toHaveBeenCalledWith(
      { client: 'service' },
      expect.objectContaining({
        month: '2026-06',
        today_key: '2026-07-22',
        include_unattributed: true,
      }),
    );
    expect(mocks.loadMonthlyDeductionsReport.mock.calls[0][1]).not.toHaveProperty('usernames');
  });

  it('rejects an invalid or future month before creating a service-role client', async () => {
    mocks.requireApiPermission.mockResolvedValue(auth('admin', 'admin'));
    mocks.resolveAdminDeductionsMonth.mockReturnValue(null);

    const response = await getAdminDeductions(
      new NextRequest('http://localhost/api/hr/deductions?month=2026-08'),
    );

    expect(response.status).toBe(400);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });
});

describe('GET /api/hr/deductions/me', () => {
  it('stops at payroll.view before creating a service-role client', async () => {
    mocks.requireApiPermission.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await getMyDeductions(
      new NextRequest('http://localhost/api/hr/deductions/me'),
    );

    expect(response.status).toBe(403);
    expect(mocks.requireApiPermission).toHaveBeenCalledWith('payroll.view');
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it('rejects admin and sales legacy roles before creating a service-role client', async () => {
    for (const role of ['admin', 'sales_agent']) {
      vi.clearAllMocks();
      mocks.requireApiPermission.mockResolvedValue(auth(role));

      const response = await getMyDeductions(
        new NextRequest('http://localhost/api/hr/deductions/me'),
      );

      expect(response.status).toBe(403);
      expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
    }
  });

  it('hard-binds the active employee to their own username and current Dubai month', async () => {
    mocks.requireApiPermission.mockResolvedValue(auth('employee', 'alice'));

    const response = await getMyDeductions(
      new NextRequest('http://localhost/api/hr/deductions/me?month=2025-01&username=bob'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.loadMonthlyDeductionsReport).toHaveBeenCalledWith(
      { client: 'service' },
      expect.objectContaining({
        month: '2026-07',
        today_key: '2026-07-22',
        usernames: ['alice'],
      }),
    );
    expect(mocks.loadMonthlyDeductionsReport.mock.calls[0][1])
      .not.toHaveProperty('include_unattributed');
    expect(body.data).toMatchObject({ month: '2026-07', employee: { username: 'alice' } });
  });
});
