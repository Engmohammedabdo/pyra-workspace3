import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchAPI: vi.fn(),
  mutateAPI: vi.fn(),
}));

vi.mock('@/hooks/api-helpers', () => ({
  fetchAPI: mocks.fetchAPI,
  mutateAPI: mocks.mutateAPI,
}));

import {
  useAdminDeductions,
  useApproveComputedDeduction,
  useApproveManualDeduction,
  useMyDeductionRisk,
  useSetAttendanceTrackingStart,
} from '@/hooks/useDeductions';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe('useMyDeductionRisk', () => {
  beforeEach(() => {
    mocks.fetchAPI.mockReset();
    mocks.mutateAPI.mockReset();
  });

  it('uses the own-scope endpoint and stable query key when the employee gate is enabled', async () => {
    const response = { month: '2026-07', employee: { username: 'alice' } };
    mocks.fetchAPI.mockResolvedValue(response);
    const { queryClient, Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useMyDeductionRisk({ enabled: true }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.fetchAPI).toHaveBeenCalledOnce();
    expect(mocks.fetchAPI).toHaveBeenCalledWith('/api/hr/deductions/me');
    expect(queryClient.getQueryData(['deductions', 'me'])).toEqual(response);
  });

  it('does not request employee deduction evidence when the audience gate is disabled', async () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useMyDeductionRisk({ enabled: false }),
      { wrapper: Wrapper },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mocks.fetchAPI).not.toHaveBeenCalled();
  });
});

describe('admin deduction hooks', () => {
  beforeEach(() => {
    mocks.fetchAPI.mockReset();
    mocks.mutateAPI.mockReset();
  });

  it('loads one validated admin month with a stable month-scoped key', async () => {
    const response = { month: '2026-07', employees: [], unattributed_tasks: [] };
    mocks.fetchAPI.mockResolvedValue(response);
    const { queryClient, Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useAdminDeductions('2026-07'),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.fetchAPI).toHaveBeenCalledWith('/api/hr/deductions?month=2026-07');
    expect(queryClient.getQueryData(['deductions', 'admin', '2026-07'])).toEqual(response);
  });

  it('uses the dedicated manual approval endpoint and invalidates money/report views', async () => {
    mocks.mutateAPI.mockResolvedValue({ manual_deduction: { id: 'md_12345678' } });
    const { queryClient, Wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const input = {
      idempotency_key: 'md_12345678',
      username: 'wael.hany',
      period_month: '2026-07-01',
      amount: 750,
      reason: 'Owner-attested legacy delivery delay',
      basis: 'owner_attested_legacy_delivery' as const,
      evidence_task_ids: ['task-late-1'],
      owner_attestation: true,
    };

    const { result } = renderHook(() => useApproveManualDeduction(), { wrapper: Wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.mutateAPI).toHaveBeenCalledWith(
      '/api/hr/deductions/manual',
      'POST',
      input,
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['deductions', 'admin', '2026-07'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['hr-overview'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['employee-payments'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['payroll'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['my-payslips'] });
  });

  it('uses the computed approval endpoint and refreshes admin, employee, and payroll truth', async () => {
    mocks.mutateAPI.mockResolvedValue({ deduction_case: { id: 'dc_123' } });
    const { queryClient, Wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const input = { username: 'wael.hany', period_month: '2026-07-01' };

    const { result } = renderHook(() => useApproveComputedDeduction(), { wrapper: Wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.mutateAPI).toHaveBeenCalledWith(
      '/api/hr/deductions/approve',
      'POST',
      input,
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['deductions', 'admin', '2026-07'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['deductions', 'me'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['employee-payments'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['payroll'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['my-payslips'] });
  });

  it('documents attendance tracking through the admin endpoint and refreshes both views', async () => {
    mocks.mutateAPI.mockResolvedValue({
      username: 'wael.hany',
      attendance_tracking_started_on: '2026-07-01',
      attendance_tracking_start_source: 'admin',
    });
    const { queryClient, Wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const input = { username: 'wael.hany', started_on: '2026-07-01' };

    const { result } = renderHook(
      () => useSetAttendanceTrackingStart('2026-07'),
      { wrapper: Wrapper },
    );
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.mutateAPI).toHaveBeenCalledWith(
      '/api/hr/deductions/attendance-tracking',
      'PATCH',
      input,
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['deductions', 'admin', '2026-07'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['deductions', 'me'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['hr-overview'] });
  });
});
