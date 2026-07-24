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
  ACTIVITY_ACTIONS: { REJECT: 'reject' },
  ENTITY_TYPES: { DEDUCTION: 'deduction' },
}));
vi.mock('@/lib/observability/log-error', () => ({ logError: mocks.logError }));

import { POST } from '@/app/api/hr/deductions/cancel/route';

const auth = {
  pyraUser: {
    username: 'admin',
    display_name: 'Admin',
    role: 'admin',
    rolePermissions: ['*'],
  },
};

function serviceClient(status = 'ok', changed = true) {
  return {
    rpc: vi.fn().mockResolvedValue({
      data: [{
        status,
        changed,
        payment_data: status === 'ok' ? {
          id: 'ep_deduction',
          username: 'wael.hany',
          status: 'rejected',
          effective_month: '2026-07-01',
        } : null,
        run_data: null,
      }],
      error: null,
    }),
  };
}

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/hr/deductions/cancel', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireApiPermission.mockResolvedValue(auth);
  mocks.getTranslations.mockResolvedValue((key: string) => key);
  mocks.createServiceRoleClient.mockReturnValue(serviceClient());
});

describe('POST /api/hr/deductions/cancel', () => {
  it('checks hr.manage before creating a service-role client', async () => {
    mocks.requireApiPermission.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await POST(request({ payment_id: 'ep_deduction', reason: 'Owner decision' }));
    expect(response.status).toBe(403);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it('requires a documented cancellation reason', async () => {
    const response = await POST(request({ payment_id: 'ep_deduction', reason: '  ' }));
    expect(response.status).toBe(422);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it('calls the atomic RPC and logs the explicit admin cancellation', async () => {
    const service = serviceClient();
    mocks.createServiceRoleClient.mockReturnValue(service);
    const response = await POST(request({ payment_id: 'ep_deduction', reason: 'Excuse accepted' }));

    expect(response.status).toBe(200);
    expect(service.rpc).toHaveBeenCalledWith('pyra_cancel_employee_deduction', {
      p_payment_id: 'ep_deduction',
      p_cancelled_by: 'admin',
      p_reason: 'Excuse accepted',
    });
    expect(mocks.logActivity).toHaveBeenCalledWith(
      'admin',
      'Admin',
      'deduction_reject',
      '/dashboard/hr/deductions',
      expect.objectContaining({
        payment_id: 'ep_deduction',
        source: 'employee_deduction_cancelled',
      }),
      'unknown',
    );
  });

  it.each(['already_paid', 'closed_period', 'payment_linked_to_closed_run'])(
    'blocks cancellation for %s',
    async (status) => {
      mocks.createServiceRoleClient.mockReturnValue(serviceClient(status, false));
      const response = await POST(request({ payment_id: 'ep_deduction', reason: 'Owner decision' }));
      expect(response.status).toBe(409);
      expect(mocks.logActivity).not.toHaveBeenCalled();
    },
  );
});
