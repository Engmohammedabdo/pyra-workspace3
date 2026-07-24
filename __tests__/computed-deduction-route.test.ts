import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { MonthlyEmployeeDeductionReport } from '@/lib/hr/deductions-report';

const mocks = vi.hoisted(() => ({
  requireApiPermission: vi.fn(),
  createServiceRoleClient: vi.fn(),
  getTranslations: vi.fn(),
  loadMonthlyDeductionsReport: vi.fn(),
  logActivity: vi.fn(),
  logError: vi.fn(),
  generateId: vi.fn((prefix: string) => `${prefix}_1234567890123456`),
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
  ACTIVITY_ACTIONS: { APPROVE: 'approve' },
  ENTITY_TYPES: { DEDUCTION: 'deduction' },
}));
vi.mock('@/lib/observability/log-error', () => ({ logError: mocks.logError }));
vi.mock('@/lib/hr/deductions-report', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hr/deductions-report')>()),
  loadMonthlyDeductionsReport: mocks.loadMonthlyDeductionsReport,
}));
vi.mock('@/lib/utils/format', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/utils/format')>()),
  dubaiDayKey: vi.fn(() => '2026-07-22'),
}));
vi.mock('@/lib/utils/id', () => ({ generateId: mocks.generateId }));

import { POST } from '@/app/api/hr/deductions/approve/route';

const auth = {
  userId: 'auth-admin',
  email: 'admin@example.test',
  pyraUser: {
    username: 'admin',
    display_name: 'Admin',
    role: 'admin',
    rolePermissions: ['*'],
  },
};

function employee(): MonthlyEmployeeDeductionReport {
  return {
    username: 'wael.hany',
    display_name: 'Wael Hany',
    hire_date: '2026-01-01',
    attendance_tracking_started_on: '2026-07-01',
    attendance_tracking_start_source: 'admin',
    salary: 25_000,
    currency: 'EGP',
    attendance_inputs: [{ date: '2026-07-06', late_minutes: null }],
    delivery_tasks: [],
    quality_months: [{
      month: '2026-07',
      avg_rounds: 1,
      outright_rejection_rate: 0,
      review_rounds_total: 1,
      deliveries: 1,
      outright_rejection_count: 0,
      reviewed_task_count: 1,
    }],
    deduction_payments: [],
    existing_case: null,
    manual_deductions: [],
    integrity_blockers: [],
    cap_ledger: { cap_amount: 6250, used_amount: 0, remaining_amount: 6250 },
    candidate: {
      salary: 25_000,
      currency: 'EGP',
      attendance: {
        daily_rate: 833.33,
        total_units: 1,
        amount: 833.33,
        incidents: [{ date: '2026-07-06', late_minutes: null, kind: 'no_show', excused: false, units: 1 }],
      },
      delivery: { on_time_pct: 50, band: 'moderate', percentage: 7, amount: 1750 },
      quality: { current_below_band: false, consecutive_months: 0, eligible: false, amount: 0 },
      requested_amount: 2583.33,
      cap: {
        cap_amount: 6250,
        already_used_amount: 0,
        remaining_cap_amount: 6250,
        cap_subject_requested_amount: 1750,
        cap_subject_approved_amount: 1750,
        cap_exempt_amount: 833.33,
        approved_amount: 2583.33,
        capped: false,
      },
    },
  } as MonthlyEmployeeDeductionReport;
}

function report() {
  return {
    month: '2026-07',
    as_of_date: '2026-07-22',
    generated_at: '2026-07-22T12:00:00.000Z',
    unattributed_tasks: [],
    employees: [employee()],
  };
}

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/hr/deductions/approve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function serviceClient(errorMessage?: string) {
  const rpc = vi.fn(async (_name: string, params: Record<string, unknown>) => ({
    data: errorMessage ? null : { id: params.p_case_id, payment_id: params.p_payment_id },
    error: errorMessage ? { message: errorMessage } : null,
  }));
  return { rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireApiPermission.mockResolvedValue(auth);
  mocks.getTranslations.mockResolvedValue((key: string) => key);
  mocks.loadMonthlyDeductionsReport.mockResolvedValue(report());
  mocks.createServiceRoleClient.mockReturnValue(serviceClient());
});

describe('POST /api/hr/deductions/approve', () => {
  it('checks hr.manage before creating a service-role client', async () => {
    mocks.requireApiPermission.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request({ username: 'wael.hany', period_month: '2026-07-01' }));

    expect(response.status).toBe(403);
    expect(mocks.requireApiPermission).toHaveBeenCalledWith('hr.manage');
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it('rejects any month except the current Dubai payroll month', async () => {
    const response = await POST(request({ username: 'wael.hany', period_month: '2026-06-01' }));

    expect(response.status).toBe(409);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it('rebuilds the report server-side and sends only trusted snapshots to the atomic RPC', async () => {
    const service = serviceClient();
    mocks.createServiceRoleClient.mockReturnValue(service);

    const response = await POST(request({
      username: 'wael.hany',
      period_month: '2026-07-01',
      amount: 1,
      evidence: { forged: true },
    }));

    expect(response.status).toBe(201);
    expect(mocks.loadMonthlyDeductionsReport).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ month: '2026-07', usernames: ['wael.hany'] }),
    );
    expect(service.rpc).toHaveBeenCalledWith(
      'pyra_approve_employee_deduction',
      expect.objectContaining({
        p_employee_username: 'wael.hany',
        p_period_month: '2026-07-01',
        p_salary_snapshot: 25_000,
        p_salary_currency: 'EGP',
        p_attendance_amount: 833.33,
        p_delivery_amount: 1750,
        p_quality_amount: 0,
        p_monthly_cap_percentage: 25,
        p_evidence: expect.objectContaining({
          source: 'employee_deductions_computed_approval',
        }),
      }),
    );
    expect(service.rpc.mock.calls[0][1].p_attendance_amount).not.toBe(1);
    expect(mocks.logActivity).toHaveBeenCalledWith(
      'admin',
      'Admin',
      'deduction_approve',
      '/dashboard/hr/deductions',
      expect.objectContaining({
        employee_username: 'wael.hany',
        source: 'computed_employee_deduction_approved',
      }),
      'unknown',
    );
  });

  it('returns an existing valid approval without creating another payroll row', async () => {
    const existing = employee();
    existing.existing_case = {
      case: { id: 'dc_existing', payment_id: 'pay_existing', approved_amount: 500, salary_currency: 'EGP' },
      payment: { id: 'pay_existing' },
    } as never;
    mocks.loadMonthlyDeductionsReport.mockResolvedValue({ ...report(), employees: [existing] });
    const service = serviceClient();
    mocks.createServiceRoleClient.mockReturnValue(service);

    const response = await POST(request({ username: 'wael.hany', period_month: '2026-07-01' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.meta.idempotent).toBe(true);
    expect(service.rpc).not.toHaveBeenCalled();
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });

  it('fails closed when the trusted report has no approvable candidate', async () => {
    const blocked = employee();
    blocked.candidate = null;
    blocked.integrity_blockers = [{ code: 'attendance_tracking_unverified' }];
    mocks.loadMonthlyDeductionsReport.mockResolvedValue({ ...report(), employees: [blocked] });

    const response = await POST(request({ username: 'wael.hany', period_month: '2026-07-01' }));

    expect(response.status).toBe(409);
  });

  it('maps a closed payroll period conflict without logging a false approval', async () => {
    const service = serviceClient('deduction_closed_period');
    mocks.createServiceRoleClient.mockReturnValue(service);

    const response = await POST(request({ username: 'wael.hany', period_month: '2026-07-01' }));

    expect(response.status).toBe(409);
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });
});
