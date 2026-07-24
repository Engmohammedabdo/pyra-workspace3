import { describe, expect, it } from 'vitest';
import {
  buildComputedDeductionApprovalSnapshot,
} from '@/lib/hr/deduction-approval';
import type { MonthlyEmployeeDeductionReport } from '@/lib/hr/deductions-report';

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
    delivery_tasks: [{
      task_id: 'task-late',
      title: 'Late task',
      created_at: '2026-07-01T08:00:00.000Z',
      due_date: '2026-07-20',
      due_at: '2026-07-20T14:00:00.000Z',
      deadline_unverified: false,
      first_submitted_at: '2026-07-20T15:00:00.000Z',
      delivered_at: null,
      on_time: false,
      delay_days: 0,
      review_rounds: 1,
      outcome: 'late',
      exclusion_reason: null,
      attribution_status: 'legacy_actor_verified',
    }],
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
        incidents: [{
          date: '2026-07-06',
          late_minutes: null,
          kind: 'no_show',
          excused: false,
          units: 1,
        }],
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
  };
}

describe('computed deduction approval snapshot', () => {
  it('serializes only server-derived evidence and the tunable policy constants', () => {
    const result = buildComputedDeductionApprovalSnapshot(employee(), {
      month: '2026-07',
      as_of_date: '2026-07-22',
      generated_at: '2026-07-22T12:00:00.000Z',
    });

    expect(result).toMatchObject({
      employee_username: 'wael.hany',
      period_month: '2026-07-01',
      salary_snapshot: 25_000,
      salary_currency: 'EGP',
      attendance_units: 1,
      attendance_amount: 833.33,
      delivery_on_time_pct: 50,
      delivery_band: 'moderate',
      delivery_amount: 1750,
      delivery_percentage: 7,
      quality_amount: 0,
      monthly_cap_percentage: 25,
    });
    expect(result.evidence).toMatchObject({
      schema_version: 1,
      source: 'employee_deductions_computed_approval',
      employee_username: 'wael.hany',
      report_month: '2026-07',
      report_as_of_date: '2026-07-22',
    });
    expect(result.evidence).toHaveProperty('attendance_inputs');
    expect(result.evidence).toHaveProperty('delivery_tasks');
    expect(result.policy_snapshot).toMatchObject({
      attendance: { grace_minutes: 15, days_per_month: 30 },
      delivery: { minor_percent: 3, moderate_percent: 7, major_percent: 12, minimum_lead_time_hours: 24 },
      quality: { average_rounds_above: 2, rejection_rate_at_least_percent: 20, consecutive_months_required: 2 },
      monthly_cap: { percent: 25, attendance_exempt: true },
    });
  });

  it('fails closed when the report cannot produce a positive trusted candidate', () => {
    const missingCandidate = employee();
    missingCandidate.candidate = null;
    expect(() => buildComputedDeductionApprovalSnapshot(missingCandidate, {
      month: '2026-07',
      as_of_date: '2026-07-22',
      generated_at: '2026-07-22T12:00:00.000Z',
    })).toThrow('computed deduction candidate is unavailable');

    const zeroCandidate = employee();
    zeroCandidate.candidate!.cap.approved_amount = 0;
    expect(() => buildComputedDeductionApprovalSnapshot(zeroCandidate, {
      month: '2026-07',
      as_of_date: '2026-07-22',
      generated_at: '2026-07-22T12:00:00.000Z',
    })).toThrow('computed deduction amount must be positive');
  });
});
