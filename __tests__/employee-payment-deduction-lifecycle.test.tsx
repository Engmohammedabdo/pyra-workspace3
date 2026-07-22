import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  serviceClient: null as unknown,
  createServiceClient: vi.fn(),
  approveMutate: vi.fn(),
  payMutate: vi.fn(),
  notify: vi.fn(async () => undefined),
  logActivity: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/i18n/status-labels', () => ({
  useStatusLabels: () => (value: string) => value,
}));

vi.mock('@/hooks/useEmployeePayments', () => ({
  useApproveEmployeePayment: () => ({ mutate: mocks.approveMutate }),
  usePayEmployeePayment: () => ({ mutate: mocks.payMutate }),
}));

vi.mock('@/lib/api/auth', () => ({
  requireApiPermission: vi.fn(async () => ({
    pyraUser: {
      username: 'admin',
      display_name: 'Admin',
      rolePermissions: ['*'],
    },
  })),
  isApiError: vi.fn(() => false),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: mocks.createServiceClient,
}));

vi.mock('@/lib/api/activity', () => ({
  ENTITY_TYPES: { EMPLOYEE_PAYMENT: 'employee_payment' },
  ACTIVITY_ACTIONS: { UPDATE: 'update' },
  logActivity: mocks.logActivity,
}));

vi.mock('@/lib/notifications/notify', () => ({ notify: mocks.notify }));
vi.mock('@/lib/observability/log-error', () => ({ logError: vi.fn() }));

import { PATCH as updateEmployeePayment } from '../app/api/dashboard/employee-payments/[id]/route';
import { EmployeePaymentsTab } from '@/components/payroll/EmployeePaymentsTab';

function approvedPayment(sourceType: string, status = 'approved') {
  return {
    id: `payment-${sourceType}`,
    username: 'employee.one',
    display_name: 'Employee One',
    source_type: sourceType,
    source_id: 'source-1',
    amount: 250,
    currency: 'AED',
    status,
    payroll_id: null,
    description: 'Payment',
    created_at: '2026-07-20T08:00:00.000Z',
  };
}

function paymentClient(payment: ReturnType<typeof approvedPayment>) {
  const update = vi.fn();
  const from = vi.fn(() => {
    let operation: 'select' | 'update' = 'select';
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.update = update.mockImplementation(() => {
      operation = 'update';
      return builder;
    });
    builder.eq = vi.fn(() => builder);
    builder.single = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => builder);
    builder.then = (
      resolvePromise: (value: unknown) => unknown,
      rejectPromise: (reason: unknown) => unknown,
    ) => Promise.resolve(operation === 'select'
      ? { data: payment, error: null }
      : { data: { ...payment, status: 'paid' }, error: null })
      .then(resolvePromise, rejectPromise);
    return builder;
  });
  const rpc = vi.fn(async (name: string) => {
    const isApproval = name === 'pyra_approve_employee_payment';
    return {
      data: [{
        status: payment.source_type === 'deduction' ? 'direct_pay_disallowed' : 'ok',
        changed: payment.source_type !== 'deduction',
        payment_data: isApproval ? { ...payment, status: 'approved' } : payment,
      }],
      error: null,
    };
  });

  return { from, rpc, update };
}

function request(action: string) {
  return {
    json: vi.fn(async () => ({ action })),
    headers: new Headers(),
  } as never;
}

beforeEach(() => {
  mocks.createServiceClient.mockReset().mockImplementation(() => mocks.serviceClient);
  mocks.approveMutate.mockReset();
  mocks.payMutate.mockReset();
  mocks.notify.mockClear();
  mocks.logActivity.mockClear();
});

describe('deduction payment lifecycle', () => {
  it('approves a generic non-deduction payment through the payroll-locking RPC', async () => {
    const client = paymentClient(approvedPayment('bonus', 'pending'));
    mocks.serviceClient = client;

    const response = await updateEmployeePayment(request('approve'), {
      params: Promise.resolve({ id: 'payment-bonus' }),
    });

    expect(response.status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith('pyra_approve_employee_payment', {
      p_payment_id: 'payment-bonus',
      p_approved_by: 'admin',
    });
    expect(client.update).not.toHaveBeenCalled();
  });

  it('rejects a direct API pay action for an approved deduction', async () => {
    const client = paymentClient(approvedPayment('deduction'));
    mocks.serviceClient = client;

    const response = await updateEmployeePayment(request('pay'), {
      params: Promise.resolve({ id: 'payment-deduction' }),
    });

    expect(response.status).toBe(409);
    expect(client.update).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('does not offer the direct-pay action for an approved deduction', () => {
    render(
      <EmployeePaymentsTab
        payments={[approvedPayment('deduction')]}
        loading={false}
        onAdd={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'actionsAria' })).not.toBeInTheDocument();
  });

  it('does not offer the generic approve action for a pending deduction', () => {
    render(
      <EmployeePaymentsTab
        payments={[approvedPayment('deduction', 'pending')]}
        loading={false}
        onAdd={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'actionsAria' })).not.toBeInTheDocument();
  });

  it('keeps the direct-pay action for an approved non-deduction payment', () => {
    render(
      <EmployeePaymentsTab
        payments={[approvedPayment('bonus')]}
        loading={false}
        onAdd={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'actionsAria' })).toBeInTheDocument();
  });
});
