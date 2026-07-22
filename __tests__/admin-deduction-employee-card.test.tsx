import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import hrMessages from '@/messages/en/hr.json';
import { AdminDeductionEmployeeCard } from '@/components/hr/deductions/AdminDeductionEmployeeCard';
import type { MonthlyEmployeeDeductionReport } from '@/lib/hr/deductions-report';

vi.mock('@/components/hr/deductions/DeductionRiskEvidence', () => ({
  DeductionRiskEvidence: () => <div>evidence</div>,
}));

function employee(): MonthlyEmployeeDeductionReport {
  return {
    username: 'alice',
    display_name: 'Alice',
    hire_date: '2026-01-01',
    attendance_tracking_started_on: '2026-01-01',
    attendance_tracking_start_source: 'admin',
    salary: 3000,
    currency: 'AED',
    attendance_inputs: [],
    delivery_tasks: [],
    quality_months: [],
    deduction_payments: [],
    existing_case: null,
    manual_deductions: [],
    integrity_blockers: [],
    cap_ledger: null,
    candidate: null,
  };
}

function renderCard(
  value: MonthlyEmployeeDeductionReport,
  month = '2026-07',
  currentMonth = '2026-07',
) {
  return render(
    <NextIntlClientProvider locale="en" messages={hrMessages}>
      <AdminDeductionEmployeeCard
        employee={value}
        month={month}
        currentMonth={currentMonth}
        onApproveComputed={vi.fn()}
        onManualDeduction={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

describe('admin deduction employee card payment truth', () => {
  afterEach(() => cleanup());

  it('does not label or show money for a computed case with broken payment linkage', () => {
    const value = employee();
    value.existing_case = {
      case: {
        payment_id: 'pay-case',
        approved_amount: 180,
        salary_currency: 'AED',
      },
      payment: null,
    } as never;
    value.integrity_blockers = [{
      code: 'deduction_case_payment_missing',
      payment_id: 'pay-case',
    }];

    renderCard(value);

    expect(screen.queryByText('Finalized deductions')).not.toBeInTheDocument();
    expect(screen.queryByText(/180\.00/)).not.toBeInTheDocument();
    expect(screen.getByText('The finalized deduction is missing its linked payment.'))
      .toBeInTheDocument();
  });

  it('preserves an unlinked manual reason without presenting its amount as finalized', () => {
    const value = employee();
    value.manual_deductions = [{
      manual: {
        id: 'manual-1',
        payment_id: 'pay-manual-1',
        reason: 'Owner-attested legacy delay',
        approved_amount: 90,
        salary_currency: 'AED',
      },
      payment: null,
    }] as never;
    value.integrity_blockers = [{
      code: 'manual_deduction_payment_missing',
      payment_id: 'pay-manual-1',
    }];

    renderCard(value);

    expect(screen.getByText('Owner-attested legacy delay')).toBeInTheDocument();
    expect(screen.queryByText(/90\.00/)).not.toBeInTheDocument();
    expect(screen.getByText(/not linked to payroll/)).toBeInTheDocument();
  });

  it('allows a current-month legacy decision with a valid cap even when quality history is missing', () => {
    const value = employee();
    value.cap_ledger = { cap_amount: 750, used_amount: 0, remaining_amount: 750 };
    value.integrity_blockers = [{
      code: 'missing_productivity_evidence',
      month: '2026-06',
    }];
    value.delivery_tasks = [{
      task_id: 'legacy-late',
      title: 'Legacy late task',
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
    }];

    const { rerender } = renderCard(value);
    expect(screen.getByRole('button', { name: 'Document manual deduction' })).toBeEnabled();

    rerender(
      <NextIntlClientProvider locale="en" messages={hrMessages}>
        <AdminDeductionEmployeeCard
          employee={value}
          month="2026-06"
          currentMonth="2026-07"
          onApproveComputed={vi.fn()}
          onManualDeduction={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('button', { name: 'Document manual deduction' })).toBeDisabled();
  });

  it('offers one explicit computed approval and disables it outside the current month', () => {
    const value = employee();
    value.cap_ledger = { cap_amount: 750, used_amount: 0, remaining_amount: 750 };
    value.candidate = {
      salary: 3000,
      currency: 'AED',
      attendance: { daily_rate: 100, total_units: 1, amount: 100, incidents: [] },
      delivery: { on_time_pct: 80, band: 'minor', percentage: 3, amount: 90 },
      quality: { current_below_band: false, consecutive_months: 0, eligible: false, amount: 0 },
      requested_amount: 190,
      cap: {
        cap_amount: 750,
        already_used_amount: 0,
        remaining_cap_amount: 750,
        cap_subject_requested_amount: 90,
        cap_subject_approved_amount: 90,
        cap_exempt_amount: 100,
        approved_amount: 190,
        capped: false,
      },
    };
    const onApproveComputed = vi.fn();

    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={hrMessages}>
        <AdminDeductionEmployeeCard
          employee={value}
          month="2026-07"
          currentMonth="2026-07"
          onApproveComputed={onApproveComputed}
          onManualDeduction={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve computed deduction' }));
    expect(onApproveComputed).toHaveBeenCalledOnce();

    rerender(
      <NextIntlClientProvider locale="en" messages={hrMessages}>
        <AdminDeductionEmployeeCard
          employee={value}
          month="2026-06"
          currentMonth="2026-07"
          onApproveComputed={onApproveComputed}
          onManualDeduction={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('button', { name: 'Approve computed deduction' })).toBeDisabled();
  });

  it('does not offer the same trusted legacy task for a second deduction', () => {
    const value = employee();
    value.cap_ledger = { cap_amount: 750, used_amount: 90, remaining_amount: 660 };
    value.delivery_tasks = [{
      task_id: 'legacy-late',
      title: 'Legacy late task',
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
    }];
    value.manual_deductions = [{
      manual: {
        id: 'manual-existing',
        payment_id: 'payment-existing',
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
        reason: 'Already documented',
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
              task_id: 'legacy-late',
              title: 'Legacy late task',
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
        approved_at: '2026-07-22T08:00:00.000Z',
        created_at: '2026-07-22T08:00:00.000Z',
      },
      payment: { id: 'payment-existing' },
    }] as never;

    renderCard(value);

    expect(screen.getByRole('button', { name: 'Document manual deduction' })).toBeDisabled();
  });

  it('offers an explicit tracking-start action instead of treating zero history as zero absence', () => {
    const value = employee();
    value.attendance_tracking_started_on = null;
    value.attendance_tracking_start_source = null;
    value.integrity_blockers = [{ code: 'attendance_tracking_unverified' }];
    const onAttendanceTracking = vi.fn();

    render(
      <NextIntlClientProvider locale="en" messages={hrMessages}>
        <AdminDeductionEmployeeCard
          employee={value}
          month="2026-07"
          currentMonth="2026-07"
          onApproveComputed={vi.fn()}
          onManualDeduction={vi.fn()}
          onAttendanceTracking={onAttendanceTracking}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', {
      name: 'Document attendance tracking start',
    }));
    expect(onAttendanceTracking).toHaveBeenCalledOnce();
  });
});
