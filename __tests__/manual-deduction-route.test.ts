import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireApiPermission: vi.fn(),
  createServiceRoleClient: vi.fn(),
  getTranslations: vi.fn(),
  loadMonthlyDeductionsReport: vi.fn(),
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

import { POST } from '@/app/api/hr/deductions/manual/route';

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

const validPayload = {
  idempotency_key: 'md_12345678',
  username: 'wael.hany',
  period_month: '2026-07-01',
  amount: 750,
  reason: 'Owner-attested legacy delivery delay',
  basis: 'owner_attested_legacy_delivery',
  evidence_task_ids: ['task-late-1'],
  owner_attestation: true,
};

const trustedEvidence = {
  schema_version: 1,
  source: 'employee_deductions_admin_approval',
  basis: 'owner_attested_legacy_delivery',
  employee_username: 'wael.hany',
  report_month: '2026-07',
  legacy_delivery: {
    evaluation: 'submitted_after_due_calendar_day_dubai',
    owner_attested: true,
    tasks: [{
      task_id: 'task-late-1',
      title: 'Legacy late delivery',
      due_date: '2026-07-13',
      due_at: null,
      first_submitted_at: '2026-07-14T13:04:00.000Z',
      outcome: 'excluded',
      exclusion_reason: 'unverified_legacy_deadline',
      attribution_status: 'snapshot_verified',
    }],
  },
};

function report() {
  return {
    month: '2026-07',
    as_of_date: '2026-07-22',
    generated_at: '2026-07-22T08:00:00.000Z',
    unattributed_tasks: [],
    employees: [{
      username: 'wael.hany',
      display_name: 'Wael Hany',
      salary: 25000,
      currency: 'EGP',
      attendance_inputs: [],
      delivery_tasks: [{
        task_id: 'task-late-1',
        title: 'Legacy late delivery',
        created_at: '2026-07-01T08:00:00.000Z',
        due_date: '2026-07-13',
        due_at: null,
        deadline_unverified: true,
        first_submitted_at: '2026-07-14T13:04:00.000Z',
        delivered_at: null,
        on_time: null,
        delay_days: null,
        review_rounds: 1,
        outcome: 'excluded',
        exclusion_reason: 'unverified_legacy_deadline',
        attribution_status: 'snapshot_verified',
      }],
      quality_months: [],
      deduction_payments: [],
      existing_case: null,
      manual_deductions: [],
      integrity_blockers: [{ code: 'missing_productivity_evidence', month: '2026-06' }],
      cap_ledger: { cap_amount: 6250, used_amount: 0, remaining_amount: 6250 },
      candidate: null,
    }],
  };
}

function serviceClient({
  existingManual = null,
  existingPayment = null,
  rpcStatus = 'ok',
}: {
  existingManual?: Record<string, unknown> | null;
  existingPayment?: Record<string, unknown> | null;
  rpcStatus?: string;
} = {}) {
  const rpc = vi.fn().mockResolvedValue({
    data: [{
      status: rpcStatus,
      changed: rpcStatus === 'ok',
      manual_data: rpcStatus === 'ok' ? { id: validPayload.idempotency_key } : null,
      payment_data: rpcStatus === 'ok' ? { id: validPayload.idempotency_key } : null,
    }],
    error: null,
  });
  const from = vi.fn((table: string) => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn().mockResolvedValue(
        table === 'pyra_manual_deductions'
          ? { data: existingManual, error: null }
          : { data: existingPayment, error: null },
      ),
    };
    return builder;
  });
  return { from, rpc };
}

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/hr/deductions/manual', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireApiPermission.mockResolvedValue(auth);
  mocks.getTranslations.mockResolvedValue((key: string) => key);
  mocks.loadMonthlyDeductionsReport.mockResolvedValue(report());
  mocks.createServiceRoleClient.mockReturnValue(serviceClient());
});

describe('POST /api/hr/deductions/manual', () => {
  it('checks hr.manage before creating a service-role client', async () => {
    mocks.requireApiPermission.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request(validPayload));

    expect(response.status).toBe(403);
    expect(mocks.requireApiPermission).toHaveBeenCalledWith('hr.manage');
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it('rejects client-authored evidence and invalid bases before any service query', async () => {
    for (const payload of [
      { ...validPayload, evidence: trustedEvidence },
      { ...validPayload, basis: 'general_manual_reason' },
    ]) {
      vi.clearAllMocks();
      mocks.requireApiPermission.mockResolvedValue(auth);
      mocks.getTranslations.mockResolvedValue((key: string) => key);

      const response = await POST(request(payload));

      expect(response.status).toBe(422);
      expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
    }
  });

  it('rejects new past and future approvals before report or RPC work', async () => {
    const service = serviceClient();
    mocks.createServiceRoleClient.mockReturnValue(service);

    const past = await POST(request({ ...validPayload, period_month: '2026-06-01' }));
    const future = await POST(request({ ...validPayload, period_month: '2026-08-01' }));

    expect(past.status).toBe(409);
    expect(future.status).toBe(409);
    expect(mocks.loadMonthlyDeductionsReport).not.toHaveBeenCalled();
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it('keeps quality money paused until the owner locks the month timing', async () => {
    const service = serviceClient();
    mocks.createServiceRoleClient.mockReturnValue(service);

    const response = await POST(request({
      ...validPayload,
      basis: 'quality_repeated_pattern',
      evidence_task_ids: [],
      owner_attestation: false,
    }));

    expect(response.status).toBe(409);
    expect(mocks.loadMonthlyDeductionsReport).not.toHaveBeenCalled();
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it('loads its own report and passes only the exact server-built evidence to the RPC', async () => {
    const service = serviceClient();
    mocks.createServiceRoleClient.mockReturnValue(service);

    const response = await POST(request(validPayload));

    expect(response.status).toBe(201);
    expect(mocks.loadMonthlyDeductionsReport).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        month: '2026-07',
        usernames: ['wael.hany'],
        include_unattributed: false,
      }),
    );
    expect(service.rpc).toHaveBeenCalledWith(
      'pyra_approve_manual_deduction',
      expect.objectContaining({
        p_basis: 'owner_attested_legacy_delivery',
        p_salary_snapshot: 25000,
        p_salary_currency: 'EGP',
        p_requested_amount: 750,
        p_evidence: trustedEvidence,
      }),
    );
    expect(mocks.logActivity).toHaveBeenCalledWith(
      'admin',
      'Admin',
      'deduction_approve',
      '/dashboard/hr/deductions',
      expect.objectContaining({
        basis: 'owner_attested_legacy_delivery',
        source: 'manual_employee_deduction_approved',
      }),
      'unknown',
    );
  });

  it('rejects task evidence that is not in the employee server report', async () => {
    const service = serviceClient();
    mocks.createServiceRoleClient.mockReturnValue(service);

    const response = await POST(request({
      ...validPayload,
      evidence_task_ids: ['foreign-task'],
    }));

    expect(response.status).toBe(422);
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it('returns a stable prior result without rebuilding live salary or metrics', async () => {
    const existingManual = {
      id: validPayload.idempotency_key,
      payment_id: validPayload.idempotency_key,
      employee_username: 'wael.hany',
      period_month: '2026-07-01',
      basis: 'owner_attested_legacy_delivery',
      salary_snapshot: 25000,
      salary_currency: 'EGP',
      monthly_cap_percentage: 25,
      requested_amount: 750,
      cap_amount: 6250,
      prior_approved_amount: 0,
      approved_amount: 750,
      reason: validPayload.reason,
      evidence: trustedEvidence,
      approved_by: 'admin',
      approved_at: '2026-07-22T08:00:00.000Z',
      created_at: '2026-07-22T08:00:00.000Z',
    };
    const existingPayment = {
      id: validPayload.idempotency_key,
      username: 'wael.hany',
      source_type: 'deduction',
      source_id: validPayload.idempotency_key,
      description: validPayload.reason,
      amount: 750,
      deduction_cap_exempt_amount: 0,
      currency: 'EGP',
      status: 'approved',
      payroll_id: null,
      effective_month: '2026-07-01',
      approved_at: '2026-07-22T08:00:00.000Z',
      paid_at: null,
      created_at: '2026-07-22T08:00:00.000Z',
    };
    const service = serviceClient({ existingManual, existingPayment });
    mocks.createServiceRoleClient.mockReturnValue(service);

    const response = await POST(request(validPayload));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.meta.idempotent).toBe(true);
    expect(mocks.loadMonthlyDeductionsReport).not.toHaveBeenCalled();
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it('maps a repeated cause to a conflict with no success activity', async () => {
    const service = serviceClient({ rpcStatus: 'duplicate_cause' });
    mocks.createServiceRoleClient.mockReturnValue(service);

    const response = await POST(request(validPayload));

    expect(response.status).toBe(409);
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });
});
