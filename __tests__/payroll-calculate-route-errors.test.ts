import { beforeEach, describe, expect, it, vi } from 'vitest';

type DbError = { message: string };
type Scenario = {
  paymentsError?: DbError;
  timesheetsError?: DbError;
  leaveRequestsError?: DbError;
  leaveTypesError?: DbError;
  linkError?: DbError;
  generatedDeduction?: boolean;
};

type Filter = { method: string; args: unknown[] };

const mocks = vi.hoisted(() => ({
  serviceClient: null as unknown,
  createServiceClient: vi.fn(),
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
  createServiceRoleClient: mocks.createServiceClient,
}));

vi.mock('@/lib/api/activity', () => ({
  ENTITY_TYPES: { PAYROLL: 'payroll' },
  ACTIVITY_ACTIONS: { UPDATE: 'update' },
  logActivity: mocks.logActivity,
}));

vi.mock('@/lib/observability/log-error', () => ({ logError: mocks.logError }));
vi.mock('@/lib/utils/id', () => ({ generateId: () => 'pi-1' }));

import { POST as calculatePayroll } from '../app/api/dashboard/payroll/[id]/calculate/route';

function hasFilter(filters: Filter[], method: string, column: string, value?: unknown) {
  return filters.some(filter =>
    filter.method === method &&
    filter.args[0] === column &&
    (arguments.length < 4 || filter.args[1] === value),
  );
}

function createPayrollClient(scenario: Scenario) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const from = vi.fn((table: string) => {
    let operation = 'select';
    let payload: unknown;
    const filters: Filter[] = [];
    const builder: Record<string, unknown> = {};

    builder.select = vi.fn(() => builder);
    builder.insert = vi.fn((value: unknown) => {
      operation = 'insert';
      payload = value;
      return builder;
    });
    builder.update = vi.fn((value: unknown) => {
      operation = 'update';
      payload = value;
      return builder;
    });
    builder.delete = vi.fn(() => {
      operation = 'delete';
      return builder;
    });
    for (const method of ['eq', 'is', 'gte', 'gt', 'lte', 'lt', 'neq', 'in', 'or', 'order', 'limit']) {
      builder[method] = vi.fn((...args: unknown[]) => {
        filters.push({ method, args });
        return builder;
      });
    }
    builder.single = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => builder);
    builder.then = (
      resolvePromise: (value: unknown) => unknown,
      rejectPromise: (reason: unknown) => unknown,
    ) => {
      return Promise.resolve(resolveQuery(table, operation, payload, filters, scenario))
        .then(resolvePromise, rejectPromise);
    };
    return builder;
  });

  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    if (scenario.linkError) return { data: null, error: scenario.linkError };
    return {
      data: [{
        status: 'ok',
        changed: true,
        run_data: {
          id: 'run-1', month: 6, year: 2026, currency: 'AED', status: 'calculated',
          total_amount: 2800, employee_count: 1,
        },
        items_data: args.p_items,
      }],
      error: null,
    };
  });

  return { from, rpc, rpcCalls };
}

function resolveQuery(
  table: string,
  operation: string,
  payload: unknown,
  filters: Filter[],
  scenario: Scenario,
) {
  if (table === 'pyra_payroll_runs' && operation === 'select') {
    return {
      data: {
        id: 'run-1', month: 6, year: 2026, currency: 'AED', status: 'draft',
        total_amount: 0, employee_count: 0, calculated_at: null,
      },
      error: null,
    };
  }
  if (table === 'pyra_payroll_runs' && operation === 'update') {
    return { data: { id: 'run-1', ...(payload as object) }, error: null };
  }
  if (table === 'pyra_users' && hasFilter(filters, 'eq', 'status', 'active')) {
    return {
      data: [{
        username: 'employee.one', display_name: 'Employee One', salary: 3000,
        hourly_rate: 0, department: 'Production', payment_type: 'monthly_salary',
        employment_type: 'full_time', status: 'active', hire_date: '2026-01-01',
        salary_currency: 'AED',
      }],
      error: null,
    };
  }
  if (table === 'pyra_users') return { data: [], error: null };

  if (table === 'pyra_employee_payments' && operation === 'select') {
    const isPayrollInput = hasFilter(filters, 'eq', 'status', 'approved');
    if (!isPayrollInput) return { data: [], error: null };
    if (scenario.paymentsError) return { data: null, error: scenario.paymentsError };

    if (scenario.linkError || scenario.generatedDeduction) {
      const isEffectiveQuery = hasFilter(filters, 'eq', 'effective_month', '2026-06-01');
      const isLegacyCurrentRoute = scenario.linkError && hasFilter(filters, 'gte', 'created_at');
      if (isEffectiveQuery || isLegacyCurrentRoute) {
        return {
          data: [{
            id: 'deduction-1', username: 'employee.one', source_type: 'deduction',
            amount: 200, currency: 'AED', status: 'approved', payroll_id: null,
            effective_month: '2026-06-01', created_at: '2026-07-05T08:00:00.000Z',
          }],
          error: null,
        };
      }
    }
    return { data: [], error: null };
  }

  if (table === 'pyra_employee_payments' && operation === 'update') {
    const isLink = (payload as { payroll_id?: string | null } | undefined)?.payroll_id === 'run-1' &&
      hasFilter(filters, 'in', 'id');
    return { data: null, error: isLink ? scenario.linkError || null : null };
  }

  if (table === 'pyra_timesheets') {
    return { data: [], error: scenario.timesheetsError || null };
  }
  if (table === 'pyra_leave_requests') {
    return {
      data: scenario.leaveTypesError
        ? [{ username: 'employee.one', type: 'Unpaid', start_date: '2026-06-10', end_date: '2026-06-10' }]
        : [],
      error: scenario.leaveRequestsError || null,
    };
  }
  if (table === 'pyra_leave_types') {
    return { data: null, error: scenario.leaveTypesError || null };
  }
  if (table === 'pyra_payroll_items') return { data: [], error: null };
  return { data: null, error: null };
}

function request() {
  return { headers: new Headers() } as never;
}

beforeEach(() => {
  mocks.createServiceClient.mockReset().mockImplementation(() => mocks.serviceClient);
  mocks.logActivity.mockClear();
  mocks.logError.mockClear();
});

async function expectCalculationFailure(scenario: Scenario, message: string) {
  mocks.serviceClient = createPayrollClient(scenario);
  const response = await calculatePayroll(request(), {
    params: Promise.resolve({ id: 'run-1' }),
  });
  expect(response.status).toBe(500);
  await expect(response.json()).resolves.toMatchObject({ error: message });
  expect(mocks.logActivity).not.toHaveBeenCalled();
}

describe('payroll calculation financial error boundaries', () => {
  it('consumes a June deduction approved in July through effective_month', async () => {
    const client = createPayrollClient({ generatedDeduction: true });
    mocks.serviceClient = client;

    const response = await calculatePayroll(request(), {
      params: Promise.resolve({ id: 'run-1' }),
    });

    expect(response.status).toBe(200);
    expect(client.rpcCalls).toHaveLength(1);
    expect(client.rpcCalls[0]).toMatchObject({
      name: 'pyra_commit_payroll_calculation',
      args: { p_payment_ids: ['deduction-1'] },
    });
    expect(client.rpcCalls[0].args.p_items).toEqual([
      expect.objectContaining({
        payroll_id: 'run-1',
        username: 'employee.one',
        deductions: 200,
        net_pay: 2800,
      }),
    ]);
  });

  it('fails when employee-payment inputs cannot be read', async () => {
    await expectCalculationFailure({ paymentsError: { message: 'payments failed' } }, 'payments failed');
  });

  it('fails when overtime inputs cannot be read', async () => {
    await expectCalculationFailure({ timesheetsError: { message: 'timesheets failed' } }, 'timesheets failed');
  });

  it('fails when unpaid-leave inputs cannot be read', async () => {
    await expectCalculationFailure({ leaveRequestsError: { message: 'leave failed' } }, 'leave failed');
  });

  it('fails when leave-type classification cannot be read', async () => {
    await expectCalculationFailure({ leaveTypesError: { message: 'leave types failed' } }, 'leave types failed');
  });

  it('fails when consumed payments cannot be linked to the run', async () => {
    await expectCalculationFailure({ linkError: { message: 'link failed' } }, 'link failed');
  });
});
