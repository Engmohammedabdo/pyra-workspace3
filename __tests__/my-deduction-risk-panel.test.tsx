import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELIVERY_MIN_LEAD_TIME_HOURS } from '@/lib/constants/deductions';
import hrMessages from '@/messages/en/hr.json';

const BASE_RESPONSE = {
  month: '2026-07',
  as_of_date: '2026-07-22',
  generated_at: '2026-07-22T08:00:00.000Z',
  employee: {
    username: 'alice',
    display_name: 'Alice',
    salary: 3000,
    currency: 'AED',
    attendance_inputs: [
      { date: '2026-07-03', late_minutes: 30 },
      { date: '2026-07-07', late_minutes: null },
    ],
    delivery_tasks: [
      {
        task_id: 'on-time',
        title: 'On-time video',
        created_at: '2026-07-01T08:00:00.000Z',
        due_date: '2026-07-03',
        due_at: '2026-07-03T14:00:00.000Z',
        deadline_unverified: false,
        first_submitted_at: '2026-07-03T13:00:00.000Z',
        delivered_at: null,
        on_time: true,
        delay_days: 0,
        review_rounds: 1,
        outcome: 'on_time',
        exclusion_reason: null,
        attribution_status: 'snapshot_verified',
      },
      {
        task_id: 'late',
        title: 'Late campaign',
        created_at: '2026-07-02T08:00:00.000Z',
        due_date: '2026-07-04',
        due_at: '2026-07-04T14:00:00.000Z',
        deadline_unverified: false,
        first_submitted_at: '2026-07-05T14:00:00.000Z',
        delivered_at: null,
        on_time: false,
        delay_days: 1,
        review_rounds: 2,
        outcome: 'late',
        exclusion_reason: null,
        attribution_status: 'snapshot_verified',
      },
      {
        task_id: 'pending',
        title: 'Pending design',
        created_at: '2026-07-05T08:00:00.000Z',
        due_date: '2026-07-25',
        due_at: '2026-07-25T14:00:00.000Z',
        deadline_unverified: false,
        first_submitted_at: null,
        delivered_at: null,
        on_time: null,
        delay_days: null,
        review_rounds: 0,
        outcome: 'pending',
        exclusion_reason: null,
        attribution_status: 'snapshot_verified',
      },
      {
        task_id: 'short-lead',
        title: 'Short lead task',
        created_at: '2026-07-06T08:00:00.000Z',
        due_date: '2026-07-07',
        due_at: '2026-07-07T06:00:00.000Z',
        deadline_unverified: false,
        first_submitted_at: '2026-07-07T05:00:00.000Z',
        delivered_at: null,
        on_time: true,
        delay_days: 0,
        review_rounds: 1,
        outcome: 'excluded',
        exclusion_reason: 'lead_time_under_24h',
        attribution_status: 'snapshot_verified',
      },
      {
        task_id: 'legacy',
        title: 'Legacy deadline task',
        created_at: '2026-07-06T08:00:00.000Z',
        due_date: '2026-07-09',
        due_at: null,
        deadline_unverified: true,
        first_submitted_at: null,
        delivered_at: null,
        on_time: null,
        delay_days: null,
        review_rounds: 0,
        outcome: 'excluded',
        exclusion_reason: 'legacy_unverified_attribution',
        attribution_status: 'legacy_unverified',
      },
    ],
    quality_months: [
      {
        month: '2026-06',
        avg_rounds: 3,
        review_rounds_total: 6,
        reviewed_task_count: 2,
        outright_rejection_count: 0,
        outright_rejection_rate: 0,
      },
      {
        month: '2026-07',
        avg_rounds: 2.5,
        review_rounds_total: 5,
        reviewed_task_count: 2,
        outright_rejection_count: 1,
        outright_rejection_rate: 50,
      },
    ],
    deduction_payments: [],
    existing_case: null,
    manual_deductions: [],
    integrity_blockers: [],
    candidate: {
      salary: 3000,
      currency: 'AED',
      attendance: {
        daily_rate: 100,
        total_units: 1.25,
        amount: 125,
        incidents: [
          { date: '2026-07-03', late_minutes: 30, kind: 'late', excused: false, units: 0.25 },
          { date: '2026-07-07', late_minutes: null, kind: 'no_show', excused: false, units: 1 },
        ],
      },
      delivery: { on_time_pct: 80, band: 'minor', percentage: 3, amount: 90 },
      quality: { current_below_band: true, consecutive_months: 2, eligible: true, amount: 0 },
      requested_amount: 215,
      cap: {
        cap_amount: 750,
        already_used_amount: 0,
        remaining_cap_amount: 750,
        approved_amount: 215,
        capped: false,
      },
    },
  },
};

const mocks = vi.hoisted(() => ({
  role: 'employee',
  userLoading: false,
  risk: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  useMyDeductionRisk: vi.fn(),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    data: mocks.userLoading ? undefined : { role: mocks.role },
    isLoading: mocks.userLoading,
  }),
}));

vi.mock('@/hooks/useDeductions', () => ({
  useMyDeductionRisk: mocks.useMyDeductionRisk,
}));

vi.mock('@/lib/i18n/status-labels', () => ({
  useStatusLabels: () => (value: string) => value,
}));

import { MyDeductionRiskPanel } from '@/components/hr/deductions/MyDeductionRiskPanel';

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="en" messages={hrMessages}>
      <MyDeductionRiskPanel />
    </NextIntlClientProvider>,
  );
}

describe('employee deduction risk panel', () => {
  beforeEach(() => {
    mocks.useMyDeductionRisk.mockReset();
    mocks.role = 'employee';
    mocks.userLoading = false;
    mocks.risk = {
      data: structuredClone(BASE_RESPONSE),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    mocks.useMyDeductionRisk.mockImplementation(() => mocks.risk);
  });

  afterEach(() => cleanup());

  it('shows capped current-month risk, separate money pillars, quality guard, and all delivery evidence outcomes', () => {
    renderPanel();

    expect(mocks.useMyDeductionRisk).toHaveBeenCalledWith({ enabled: true });
    expect(screen.getByTestId('deduction-risk-total')).toHaveTextContent('215.00');
    expect(screen.getByTestId('deduction-risk-total')).toHaveTextContent('AED');
    expect(screen.getByTestId('deduction-risk-attendance')).toHaveTextContent('125.00');
    expect(screen.getByTestId('deduction-risk-delivery')).toHaveTextContent('90.00');
    expect(screen.getByTestId('deduction-risk-quality')).toHaveTextContent('0.00');
    expect(screen.getByText('Quality is never deducted automatically.')).toBeInTheDocument();
    expect(screen.getByText('30 minutes late')).toBeInTheDocument();
    expect(screen.getByText('No show')).toBeInTheDocument();

    for (const title of [
      'On-time video',
      'Late campaign',
      'Pending design',
      'Short lead task',
      'Legacy deadline task',
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(hrMessages.hr.deductions.myRisk.delivery.reasons.leadTimeUnderMinimum)
      .toContain('{hours}');
    expect(hrMessages.hr.deductions.myRisk.delivery.reasons.leadTimeUnderMinimum)
      .not.toMatch(/\b24\b/);
    expect(screen.getByText(
      `Less than ${DELIVERY_MIN_LEAD_TIME_HOURS} hours from creation to deadline — excluded from the rate.`,
    )).toBeInTheDocument();
    expect(screen.getByText('Legacy or unverified evidence — excluded from the rate.')).toBeInTheDocument();
  });

  it.each(['admin', 'sales_agent'])('disables the employee query and renders nothing for %s', (role) => {
    mocks.role = role;
    const { container } = renderPanel();

    expect(mocks.useMyDeductionRisk).toHaveBeenCalledWith({ enabled: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a skeleton only after the employee audience is known and its query is loading', () => {
    mocks.risk.isLoading = true;
    mocks.risk.data = undefined;
    const { container } = renderPanel();

    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('shows integrity blockers as a non-money warning', () => {
    const response = structuredClone(BASE_RESPONSE);
    response.employee.candidate = null as never;
    response.employee.integrity_blockers = [{ code: 'invalid_salary' }] as never;
    mocks.risk.data = response;
    renderPanel();

    expect(screen.getByText('Money estimate unavailable')).toBeInTheDocument();
    expect(screen.getByText('Salary data is invalid.')).toBeInTheDocument();
    expect(screen.getByText('30 minutes late')).toBeInTheDocument();
    expect(screen.getByText('Late campaign')).toBeInTheDocument();
    expect(screen.queryByText(/AED/)).toBeNull();
  });

  it('keeps quality evidence visible when money calculation is blocked', () => {
    const response = structuredClone(BASE_RESPONSE);
    response.employee.candidate = null as never;
    response.employee.integrity_blockers = [{ code: 'invalid_salary' }] as never;
    mocks.risk.data = response;
    renderPanel();

    const quality = screen.getByTestId('deduction-risk-quality-evidence');
    expect(quality).toHaveTextContent('Average review rounds: 2.5');
    expect(quality).toHaveTextContent('Outright rejections: 1 / 2 (50%)');
    expect(quality).toHaveTextContent('A repeated pattern is documented across 2 consecutive month(s)');
    expect(quality).toHaveTextContent('Quality is never deducted automatically.');
  });

  it('shows N/A instead of inventing a zero on-time rate when no task is eligible', () => {
    const response = structuredClone(BASE_RESPONSE);
    response.employee.candidate.delivery.on_time_pct = null as never;
    mocks.risk.data = response;
    renderPanel();

    expect(screen.getByText('On-time rate: N/A (no eligible tasks)')).toBeInTheDocument();
    expect(screen.queryByText('On-time rate: 0%')).toBeNull();
  });

  it('shows the exact Dubai deadline, first review submission, and stable task id without guessing a task link', () => {
    renderPanel();

    expect(screen.getByTestId('delivery-task-on-time-deadline'))
      .toHaveTextContent('Deadline (Dubai): 3 Jul 2026, 6:00 PM');
    expect(screen.getByTestId('delivery-task-on-time-first-review'))
      .toHaveTextContent('First review submission (Dubai): 3 Jul 2026, 5:00 PM');
    expect(screen.getByTestId('delivery-task-on-time-id')).toHaveTextContent('Task ID: on-time');
    expect(screen.getByTestId('delivery-task-on-time-id').closest('a')).toBeNull();

    expect(screen.getByTestId('delivery-task-legacy-deadline')).toHaveTextContent(
      'Recorded due date: 2026-07-09 (exact hour unavailable)',
    );
    expect(screen.getByTestId('delivery-task-legacy-first-review'))
      .toHaveTextContent('First review submission (Dubai): N/A');
  });

  it('shows an existing finalized case separately from the live projection', () => {
    const response = structuredClone(BASE_RESPONSE);
    response.employee.existing_case = {
      case: {
        approved_amount: 180,
        salary_currency: 'AED',
        approved_at: '2026-07-15T08:00:00.000Z',
      },
      payment: { status: 'approved' },
    } as never;
    mocks.risk.data = response;
    renderPanel();

    const finalized = screen.getByTestId('deduction-risk-finalized');
    expect(finalized).toHaveTextContent('Finalized deduction for this month');
    expect(finalized).toHaveTextContent('180.00');
    expect(finalized).toHaveTextContent('approved');
  });

  it('shows a cancelled deduction as history and never as a finalized amount', () => {
    const response = structuredClone(BASE_RESPONSE);
    response.employee.existing_case = {
      case: {
        approved_amount: 180,
        salary_currency: 'AED',
        approved_at: '2026-07-15T08:00:00.000Z',
      },
      payment: {
        status: 'rejected',
        cancellation_reason: 'Excuse accepted',
        cancelled_at: '2026-07-22T12:00:00.000Z',
      },
    } as never;
    mocks.risk.data = response;
    renderPanel();

    expect(screen.queryByTestId('deduction-risk-finalized')).toBeNull();
    const cancelled = screen.getByTestId('deduction-risk-cancelled');
    expect(cancelled).toHaveTextContent('Deduction cancelled');
    expect(cancelled).toHaveTextContent('Excuse accepted');
    expect(cancelled).toHaveTextContent('180.00');
  });

  it('does not present a case as finalized when its linked payment is missing', () => {
    const response = structuredClone(BASE_RESPONSE);
    response.employee.existing_case = {
      case: {
        payment_id: 'missing-payment',
        approved_amount: 180,
        salary_currency: 'AED',
        approved_at: '2026-07-15T08:00:00.000Z',
      },
      payment: null,
    } as never;
    response.employee.integrity_blockers = [{
      code: 'deduction_case_payment_missing',
      payment_id: 'missing-payment',
    }] as never;
    response.employee.candidate = null as never;
    mocks.risk.data = response;
    renderPanel();

    expect(screen.queryByTestId('deduction-risk-finalized')).toBeNull();
    expect(screen.getByTestId('deduction-risk-case-evidence')).toHaveTextContent(
      'Deduction case evidence needs payment verification',
    );
    expect(screen.queryByText('180.00')).toBeNull();
    expect(screen.queryByText('approved')).toBeNull();
  });

  it('shows each documented manual deduction with its reason and linked money', () => {
    const response = structuredClone(BASE_RESPONSE);
    response.employee.manual_deductions = [{
      manual: {
        id: 'manual-1',
        payment_id: 'pay-manual-1',
        employee_username: 'alice',
        period_month: '2026-07-01',
        basis: 'owner_attested_legacy_delivery',
        salary_snapshot: 3000,
        salary_currency: 'AED',
        monthly_cap_percentage: 25,
        requested_amount: 90,
        cap_amount: 750,
        prior_approved_amount: 0,
        approved_amount: 90,
        reason: 'Owner-attested legacy delivery delay',
        evidence: {
          schema_version: 1,
          source: 'employee_deductions_admin_approval',
          basis: 'owner_attested_legacy_delivery',
          employee_username: 'alice',
          report_month: '2026-07',
          legacy_delivery: {
            evaluation: 'submitted_after_due_calendar_day_dubai',
            owner_attested: true,
            tasks: [{
              task_id: 'task-late-1',
              title: 'Late legacy task',
              due_date: '2026-07-13',
              due_at: null,
              first_submitted_at: '2026-07-14T13:04:00.000Z',
              outcome: 'excluded',
              exclusion_reason: 'unverified_legacy_deadline',
              attribution_status: 'snapshot_verified',
            }],
          },
        },
        approved_by: 'admin',
        approved_at: '2026-07-15T08:00:00.000Z',
        created_at: '2026-07-15T08:00:00.000Z',
      },
      payment: { status: 'approved' },
    }] as never;
    mocks.risk.data = response;
    renderPanel();

    const manual = screen.getByTestId('deduction-risk-manual-manual-1');
    expect(manual).toHaveTextContent('Documented manual deduction');
    expect(manual).toHaveTextContent('Owner-attested legacy delivery delay');
    expect(manual).toHaveTextContent('90.00');
    expect(manual).toHaveTextContent('approved');
    expect(manual).toHaveTextContent('Late legacy task');
    expect(manual).toHaveTextContent('2026-07-13');
  });

  it('shows manual evidence but no finalized amount or status when its linked payment mismatches', () => {
    const response = structuredClone(BASE_RESPONSE);
    response.employee.manual_deductions = [{
      manual: {
        id: 'manual-invalid',
        payment_id: 'pay-manual-invalid',
        employee_username: 'alice',
        period_month: '2026-07-01',
        salary_snapshot: 3000,
        salary_currency: 'AED',
        monthly_cap_percentage: 25,
        requested_amount: 90,
        cap_amount: 750,
        prior_approved_amount: 0,
        approved_amount: 90,
        reason: 'Evidence retained while payment is checked',
        evidence: { source: 'owner_attested_legacy_exception' },
        approved_by: 'admin',
        approved_at: '2026-07-15T08:00:00.000Z',
        created_at: '2026-07-15T08:00:00.000Z',
      },
      payment: { status: 'draft' },
    }] as never;
    response.employee.integrity_blockers = [{
      code: 'manual_deduction_payment_mismatch',
      payment_id: 'pay-manual-invalid',
    }] as never;
    response.employee.candidate = null as never;
    mocks.risk.data = response;
    renderPanel();

    expect(screen.queryByTestId('deduction-risk-manual-manual-invalid')).toBeNull();
    const evidence = screen.getByTestId('deduction-risk-manual-evidence-manual-invalid');
    expect(evidence).toHaveTextContent('Evidence retained while payment is checked');
    expect(evidence).toHaveTextContent('Payment link needs verification');
    expect(evidence).not.toHaveTextContent('90.00');
    expect(evidence).not.toHaveTextContent('draft');
  });

  it('announces asynchronous load failures to assistive technology', () => {
    mocks.risk.isError = true;
    mocks.risk.data = undefined;
    renderPanel();

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load deduction risk');
  });

  it('is mounted only in the dashboard my-payslips surface', () => {
    const payslips = readFileSync(resolve(
      process.cwd(),
      'app/dashboard/my-payslips/my-payslips-client.tsx',
    ), 'utf8');

    expect(payslips).toContain("@/components/hr/deductions/MyDeductionRiskPanel");
    expect(payslips).toContain('<MyDeductionRiskPanel />');
  });
});
