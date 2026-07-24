import { describe, expect, it } from 'vitest';
import {
  buildMonthlyDeductionsReport,
  resolveAdminDeductionsMonth,
  type DeductionsReportInput,
} from '@/lib/hr/deductions-report';
import { PRODUCTION_ATTRIBUTION_STATUS } from '@/lib/constants/production';
import { QUALITY_CONSECUTIVE_MONTHS_REQUIRED } from '@/lib/constants/deductions';
import type { EmployeeReport, ProductivityReport } from '@/lib/production/report';
import type { EmployeeProductivity, TaskJourney } from '@/lib/production/metrics';
import type { PyraDeductionCase, PyraManualDeduction } from '@/types/database';

function metrics(overrides: Partial<EmployeeProductivity> = {}): EmployeeProductivity {
  return {
    deliveries: 0,
    on_time_pct: null,
    on_time_count: 0,
    on_time_eligible_count: 0,
    late_count: 0,
    avg_delay_days: null,
    avg_rounds: null,
    review_rounds_total: 0,
    avg_days_to_first_submission: null,
    avg_review_wait_hours: null,
    reviewed_task_count: 0,
    outright_rejection_count: 0,
    outright_rejection_rate: null,
    open_overdue: 0,
    ...overrides,
  };
}

function journey(overrides: Partial<TaskJourney> & Pick<TaskJourney, 'task_id' | 'title'>): TaskJourney {
  const { task_id, title, ...rest } = overrides;
  return {
    task_id,
    title,
    assignee: 'alice',
    attribution_status: PRODUCTION_ATTRIBUTION_STATUS.SNAPSHOT_VERIFIED,
    due_date: '2026-07-03',
    effective_due_at: '2026-07-03T14:00:00.000Z',
    production_deadline_exempt: false,
    created_at: '2026-07-01T08:00:00.000Z',
    first_submitted_at: '2026-07-03T13:00:00.000Z',
    review_entry_timestamps: ['2026-07-03T13:00:00.000Z'],
    delivered_at: null,
    review_rounds: 1,
    review_wait_hours: [],
    on_time: true,
    delay_days: null,
    delivery_eligible: true,
    delivery_exclusion: null,
    days_to_first_submission: 2.2,
    is_archived: false,
    ...rest,
  };
}

function employeeReport(
  username: string,
  metricOverrides: Partial<EmployeeProductivity> = {},
  tasks: TaskJourney[] = [],
): EmployeeReport {
  return {
    username,
    display_name: username,
    metrics: metrics(metricOverrides),
    attendance: { present_days: 0, late_days: 0, absent_days: 0, total_hours: 0 },
    tasks,
  };
}

function productivity(
  month: string,
  employees: EmployeeReport[],
  unattributedTasks: TaskJourney[] = [],
): ProductivityReport {
  return { month, employees, unattributed_tasks: unattributedTasks, next_open_deadline_at: null };
}

function deductionCase(overrides: Partial<PyraDeductionCase> = {}): PyraDeductionCase {
  return {
    id: 'dc-alice-2026-07',
    employee_username: 'alice',
    period_month: '2026-07-01',
    salary_snapshot: 3000,
    salary_currency: 'AED',
    attendance_units: 1.25,
    attendance_amount: 125,
    delivery_on_time_pct: 80,
    delivery_band: 'minor',
    delivery_amount: 90,
    delivery_percentage: 3,
    quality_avg_rounds: 2.5,
    quality_outright_rejection_rate: 25,
    quality_below_band: true,
    quality_consecutive_months: 2,
    quality_eligible: true,
    quality_amount: 50,
    monthly_cap_percentage: 25,
    requested_amount: 265,
    cap_amount: 750,
    prior_approved_amount: 0,
    remaining_cap_amount: 750,
    approved_amount: 265,
    evidence: {},
    policy_snapshot: {},
    admin_note: 'Documented repeated quality pattern',
    payment_id: 'pay-case',
    approved_by: 'admin',
    approved_at: '2026-07-08T08:00:00.000Z',
    created_at: '2026-07-08T08:00:00.000Z',
    ...overrides,
  };
}

function manualDeduction(overrides: Partial<PyraManualDeduction> = {}): PyraManualDeduction {
  const base: PyraManualDeduction = {
    id: 'manual-1',
    payment_id: 'pay-other',
    employee_username: 'alice',
    period_month: '2026-07-01',
    basis: 'owner_attested_legacy_delivery',
    salary_snapshot: 3000,
    salary_currency: 'AED',
    monthly_cap_percentage: 25,
    requested_amount: 20,
    cap_amount: 750,
    prior_approved_amount: 0,
    approved_amount: 20,
    reason: 'Owner-attested legacy delivery delay',
    evidence: {
      schema_version: 1,
      source: 'employee_deductions_admin_approval',
      basis: 'owner_attested_legacy_delivery',
      employee_username: 'alice',
      report_month: '2026-07',
    },
    approved_by: 'admin',
    approved_at: '2026-07-02T08:00:00.000Z',
    created_at: '2026-07-02T08:00:00.000Z',
  };
  return { ...base, ...overrides, basis: overrides.basis ?? base.basis };
}

function currentProductivityFixture(): ProductivityReport {
  return productivity('2026-07', [employeeReport(
    'alice',
    {
      deliveries: 5,
      on_time_pct: 80,
      on_time_count: 4,
      on_time_eligible_count: 5,
      late_count: 1,
      avg_rounds: 2.5,
      review_rounds_total: 5,
      reviewed_task_count: 2,
      outright_rejection_count: 1,
      outright_rejection_rate: 50,
    },
    [
      journey({ task_id: 'on-time', title: 'On time' }),
      journey({
        task_id: 'late',
        title: 'Late',
        on_time: false,
        delay_days: 1,
        first_submitted_at: '2026-07-04T14:00:00.000Z',
      }),
      journey({
        task_id: 'short-lead',
        title: 'Short lead',
        delivery_eligible: false,
        delivery_exclusion: 'lead_time_under_24h',
        on_time: true,
        first_submitted_at: '2026-07-04T10:00:00.000Z',
      }),
      journey({
        task_id: 'legacy',
        title: 'Legacy attribution',
        attribution_status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_UNVERIFIED,
        delivery_eligible: true,
        delivery_exclusion: null,
        first_submitted_at: '2026-07-05T10:00:00.000Z',
      }),
    ],
  )], [journey({
    task_id: 'unowned-legacy',
    title: 'Unowned legacy evidence',
    assignee: null,
    attribution_status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_UNVERIFIED,
    delivery_eligible: false,
    delivery_exclusion: 'legacy_unverified_attribution',
  })]);
}

function previousProductivityFixture(): ProductivityReport {
  return productivity('2026-06', [employeeReport('alice', {
    avg_rounds: 3,
    review_rounds_total: 6,
    reviewed_task_count: 2,
    outright_rejection_count: 0,
    outright_rejection_rate: 0,
  })]);
}

function baseInput(overrides: Partial<DeductionsReportInput> = {}): DeductionsReportInput {
  return {
    month: '2026-07',
    current_month: '2026-07',
    as_of_date: '2026-07-07',
    now_uae_minutes: 10 * 60,
    generated_at: '2026-07-07T06:00:00.000Z',
    employees: [
      {
        username: 'alice',
        display_name: 'Alice',
        role: 'employee',
        status: 'active',
        salary: 3000,
        salary_currency: 'AED',
        work_schedule_id: 'ws-main',
        hire_date: '2026-01-01',
        attendance_tracking_started_on: '2026-07-02',
        attendance_tracking_start_source: 'observed',
      },
      {
        username: 'sales',
        display_name: 'Sales',
        role: 'sales_agent',
        status: 'active',
        salary: 9000,
        salary_currency: 'AED',
        work_schedule_id: 'ws-main',
        hire_date: '2026-01-01',
        attendance_tracking_started_on: null,
        attendance_tracking_start_source: null,
      },
      {
        username: 'inactive',
        display_name: 'Inactive',
        role: 'employee',
        status: 'inactive',
        salary: 9000,
        salary_currency: 'AED',
        work_schedule_id: 'ws-main',
        hire_date: '2026-01-01',
        attendance_tracking_started_on: '2026-01-01',
        attendance_tracking_start_source: 'admin',
      },
    ],
    schedules: [{
      id: 'ws-main',
      start_time: '09:00:00',
      work_days: [1, 2, 3, 4, 5, 6],
      is_default: true,
    }],
    attendance: [
      {
        username: 'alice',
        date: '2026-07-02',
        clock_in: '2026-07-02T05:10:00.000Z',
        status: 'present',
      },
      {
        username: 'alice',
        date: '2026-07-03',
        clock_in: '2026-07-03T05:30:00.000Z',
        status: 'late',
      },
      {
        username: 'alice',
        date: '2026-07-04',
        clock_in: null,
        status: 'excused',
      },
    ],
    approved_leaves: [{ username: 'alice', start_date: '2026-07-06', end_date: '2026-07-06' }],
    current_productivity: currentProductivityFixture(),
    quality_productivity: [
      previousProductivityFixture(),
      currentProductivityFixture(),
    ],
    deduction_cases: [deductionCase()],
    manual_deductions: [manualDeduction()],
    deduction_payments: [
      {
        id: 'pay-case',
        username: 'alice',
        source_id: 'dc-alice-2026-07',
        description: 'Approved monthly deduction',
        amount: 265,
        deduction_cap_exempt_amount: 125,
        currency: 'AED',
        status: 'approved',
        payroll_id: null,
        effective_month: '2026-07-01',
        approved_at: '2026-07-08T08:00:00.000Z',
        paid_at: null,
        created_at: '2026-07-08T08:00:00.000Z',
      },
      {
        id: 'pay-other',
        username: 'alice',
        source_id: 'manual-1',
        description: 'Other documented deduction',
        amount: 20,
        deduction_cap_exempt_amount: 0,
        currency: 'AED',
        status: 'paid',
        payroll_id: 'pr-july',
        effective_month: '2026-07-01',
        approved_at: '2026-07-02T08:00:00.000Z',
        paid_at: '2026-07-06T08:00:00.000Z',
        created_at: '2026-07-02T08:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('monthly deductions report mapping', () => {
  it('requires the constant-driven chronological quality history window', () => {
    const input = baseInput();
    expect(input.quality_productivity).toHaveLength(QUALITY_CONSECUTIVE_MONTHS_REQUIRED);

    input.quality_productivity = input.quality_productivity.slice(1);
    expect(() => buildMonthlyDeductionsReport(input)).toThrow(
      'deductions report period inputs are inconsistent',
    );
  });

  it('derives attendance, delivery, quality, cap, and visible task evidence for active employees only', () => {
    const report = buildMonthlyDeductionsReport(baseInput());

    expect(report.month).toBe('2026-07');
    expect(report.employees).toHaveLength(1);
    const alice = report.employees[0];
    expect(alice.username).toBe('alice');
    expect(alice.currency).toBe('AED');
    expect(alice.integrity_blockers).toEqual([]);
    expect(alice.attendance_inputs).toEqual([
      { date: '2026-07-03', late_minutes: 30 },
      { date: '2026-07-07', late_minutes: null },
    ]);
    expect(alice.candidate).toMatchObject({
      attendance: { total_units: 1.25, amount: 125 },
      delivery: { on_time_pct: 80, band: 'minor', amount: 90 },
      quality: { current_below_band: true, consecutive_months: 2, eligible: true, amount: 0 },
      requested_amount: 215,
      cap: {
        already_used_amount: 20,
        cap_subject_requested_amount: 90,
        cap_subject_approved_amount: 90,
        cap_exempt_amount: 125,
        approved_amount: 215,
      },
    });
    expect(alice.cap_ledger).toEqual({
      cap_amount: 750,
      used_amount: 160,
      remaining_amount: 590,
    });
    expect(alice.existing_case?.case.id).toBe('dc-alice-2026-07');
    expect(alice.existing_case?.payment?.id).toBe('pay-case');
    expect(alice.manual_deductions).toEqual([{
      manual: expect.objectContaining({
        id: 'manual-1',
        reason: 'Owner-attested legacy delivery delay',
        basis: 'owner_attested_legacy_delivery',
        evidence: expect.objectContaining({
          source: 'employee_deductions_admin_approval',
          basis: 'owner_attested_legacy_delivery',
        }),
      }),
      payment: expect.objectContaining({ id: 'pay-other', amount: 20 }),
    }]);
    expect(report.unattributed_tasks).toEqual([
      expect.objectContaining({
        task_id: 'unowned-legacy',
        outcome: 'excluded',
        exclusion_reason: 'legacy_unverified_attribution',
      }),
    ]);
    expect(alice.delivery_tasks.map((task) => [
      task.task_id,
      task.outcome,
      task.exclusion_reason,
    ])).toEqual([
      ['on-time', 'on_time', null],
      ['late', 'late', null],
      ['short-lead', 'excluded', 'lead_time_under_24h'],
      ['legacy', 'excluded', 'legacy_unverified_attribution'],
    ]);
    expect(alice.quality_months.map((snapshot) => snapshot.month)).toEqual([
      '2026-06',
      '2026-07',
    ]);
  });

  it('counts zero-punch current-month no-shows from a previously documented tracking start', () => {
    const report = buildMonthlyDeductionsReport(baseInput({
      attendance: [],
      employees: [{
        username: 'alice',
        display_name: 'Alice',
        role: 'employee',
        status: 'active',
        salary: 3000,
        salary_currency: 'AED',
        work_schedule_id: 'ws-main',
        hire_date: '2026-01-01',
        attendance_tracking_started_on: '2026-06-15',
        attendance_tracking_start_source: 'observed',
      }],
      deduction_cases: [],
      manual_deductions: [],
      deduction_payments: [],
    }));

    expect(report.employees[0].attendance_inputs).toEqual([
      { date: '2026-07-01', late_minutes: null },
      { date: '2026-07-02', late_minutes: null },
      { date: '2026-07-03', late_minutes: null },
      { date: '2026-07-04', late_minutes: null },
      { date: '2026-07-07', late_minutes: null },
    ]);
  });

  it('marks zero-history attendance as unverified instead of inventing zero no-shows', () => {
    const input = baseInput();
    input.employees = input.employees.map((employee) => employee.username === 'alice'
      ? {
          ...employee,
          attendance_tracking_started_on: null,
          attendance_tracking_start_source: null,
        }
      : employee);
    input.attendance = [];

    const alice = buildMonthlyDeductionsReport(input).employees[0];
    expect(alice.attendance_inputs).toEqual([]);
    expect(alice.integrity_blockers).toContainEqual({
      code: 'attendance_tracking_unverified',
    });
    expect(alice.candidate).toBeNull();
    expect(alice.cap_ledger).not.toBeNull();
  });

  it('fails closed when a tracking date has no documented provenance', () => {
    const input = baseInput();
    input.employees = input.employees.map((employee) => employee.username === 'alice'
      ? {
          ...employee,
          attendance_tracking_started_on: '2026-07-01',
          attendance_tracking_start_source: null,
        }
      : employee);

    const alice = buildMonthlyDeductionsReport(input).employees[0];
    expect(alice.attendance_inputs).toEqual([]);
    expect(alice.integrity_blockers).toContainEqual({
      code: 'attendance_tracking_unverified',
    });
    expect(alice.candidate).toBeNull();
  });

  it('keeps finalized evidence visible after the employee becomes inactive', () => {
    const input = baseInput();
    input.employees = input.employees.map((employee) => employee.username === 'alice'
      ? { ...employee, status: 'inactive' }
      : employee);
    input.current_productivity = productivity('2026-07', []);
    input.quality_productivity = [productivity('2026-06', []), productivity('2026-07', [])];
    input.manual_deductions = [];
    input.deduction_cases = [deductionCase({ quality_amount: 0, requested_amount: 215, approved_amount: 215 })];
    input.deduction_payments = [{
      ...input.deduction_payments[0],
      amount: 215,
    }];

    const report = buildMonthlyDeductionsReport(input);
    expect(report.employees).toHaveLength(1);
    expect(report.employees[0]).toMatchObject({
      username: 'alice',
      existing_case: {
        case: { id: 'dc-alice-2026-07' },
        payment: { id: 'pay-case', amount: 215 },
      },
      integrity_blockers: [{ code: 'inactive_employee' }],
      candidate: null,
      cap_ledger: null,
    });
  });

  it('keeps the salary cap ledger available for legacy evidence when only quality history is missing', () => {
    const input = baseInput();
    input.quality_productivity = [
      { ...input.quality_productivity[0], employees: [] },
      input.quality_productivity[1],
    ];

    const report = buildMonthlyDeductionsReport(input);
    const alice = report.employees[0];

    expect(alice.candidate).toBeNull();
    expect(alice.integrity_blockers).toContainEqual({
      code: 'missing_productivity_evidence',
      month: '2026-06',
    });
    expect(alice.cap_ledger).toEqual({
      cap_amount: 750,
      used_amount: 160,
      remaining_amount: 590,
    });
  });

  it('fails closed when a deduction payment has an invalid cap-exempt split', () => {
    const input = baseInput();
    input.deduction_payments = input.deduction_payments.map((payment) => (
      payment.id === 'pay-other'
        ? { ...payment, deduction_cap_exempt_amount: 21 }
        : payment
    ));

    const alice = buildMonthlyDeductionsReport(input).employees[0];
    expect(alice.candidate).toBeNull();
    expect(alice.cap_ledger).toBeNull();
    expect(alice.integrity_blockers).toContainEqual({
      code: 'deduction_cap_exemption_invalid',
      payment_id: 'pay-other',
    });
  });

  it('keeps a cancelled deduction as verified history but removes it from the cap ledger', () => {
    const input = baseInput();
    input.deduction_payments = input.deduction_payments.map((payment) => (
      payment.id === 'pay-case'
        ? {
            ...payment,
            status: 'rejected',
            cancelled_at: '2026-07-22T12:00:00.000Z',
            cancelled_by: 'admin',
            cancellation_reason: 'Excuse accepted',
          }
        : payment
    ));

    const alice = buildMonthlyDeductionsReport(input).employees[0];
    expect(alice.integrity_blockers).toEqual([]);
    expect(alice.existing_case?.payment).toMatchObject({
      status: 'rejected',
      cancellation_reason: 'Excuse accepted',
    });
    expect(alice.cap_ledger).toEqual({
      cap_amount: 750,
      used_amount: 20,
      remaining_amount: 730,
    });
  });

  it('keeps past-month unsubmitted tasks visible from their exact or legacy deadline evidence', () => {
    const exactDeadline = journey({
      task_id: 'exact-overdue',
      title: 'Exact overdue',
      due_date: null,
      effective_due_at: '2026-06-18T12:00:00.000Z',
      first_submitted_at: null,
      delivered_at: null,
      on_time: null,
      production_deadline_exempt: false,
    });
    const legacyDeadline = journey({
      task_id: 'legacy-deadline',
      title: 'Legacy dated task',
      due_date: '2026-06-20',
      effective_due_at: null,
      first_submitted_at: null,
      delivered_at: null,
      on_time: null,
      delivery_eligible: false,
      delivery_exclusion: 'unverified_legacy_deadline',
      production_deadline_exempt: true,
    });
    const futureDeadline = journey({
      task_id: 'future',
      title: 'Future task',
      due_date: '2026-07-20',
      effective_due_at: '2026-07-20T12:00:00.000Z',
      first_submitted_at: null,
      delivered_at: null,
      on_time: null,
    });
    const report = buildMonthlyDeductionsReport(baseInput({
      month: '2026-06',
      current_month: '2026-07',
      as_of_date: '2026-06-30',
      attendance: [],
      approved_leaves: [],
      current_productivity: productivity('2026-06', [employeeReport(
        'alice',
        {},
        [exactDeadline, legacyDeadline, futureDeadline],
      )]),
      quality_productivity: [
        productivity('2026-05', [employeeReport('alice')]),
        productivity('2026-06', [employeeReport('alice', {}, [
          exactDeadline,
          legacyDeadline,
          futureDeadline,
        ])]),
      ],
      deduction_cases: [],
      manual_deductions: [],
      deduction_payments: [],
    }));

    expect(report.employees[0].delivery_tasks).toEqual([
      expect.objectContaining({
        task_id: 'exact-overdue',
        due_date: null,
        due_at: '2026-06-18T12:00:00.000Z',
        deadline_unverified: false,
      }),
      expect.objectContaining({
        task_id: 'legacy-deadline',
        due_date: '2026-06-20',
        due_at: null,
        deadline_unverified: true,
        outcome: 'excluded',
        exclusion_reason: 'unverified_legacy_deadline',
      }),
    ]);
    expect(report.employees[0]).toMatchObject({
      candidate: null,
      cap_ledger: null,
      integrity_blockers: [{
        code: 'historical_salary_unverified',
        month: '2026-06',
      }],
    });
  });

  it('blocks only the affected employee for ambiguous periods or target-month currency mismatches', () => {
    const employee = (username: string) => ({
      username,
      display_name: username,
      role: 'employee',
      status: 'active',
      salary: 3000,
      salary_currency: 'AED',
      work_schedule_id: 'ws-main',
      hire_date: '2026-01-01',
      attendance_tracking_started_on: '2026-01-01',
      attendance_tracking_start_source: 'admin' as const,
    });
    const input = baseInput({
      employees: [employee('alice'), employee('bob'), employee('carol')],
      attendance: [],
      approved_leaves: [],
      current_productivity: productivity('2026-07', [
        employeeReport('alice'), employeeReport('bob'), employeeReport('carol'),
      ]),
      quality_productivity: [
        productivity('2026-06', [
          employeeReport('alice'), employeeReport('bob'), employeeReport('carol'),
        ]),
        productivity('2026-07', [
          employeeReport('alice'), employeeReport('bob'), employeeReport('carol'),
        ]),
      ],
      deduction_cases: [],
      manual_deductions: [],
      deduction_payments: [
        {
          id: 'ambiguous', username: 'alice', source_id: 'legacy', description: null,
          amount: 10, deduction_cap_exempt_amount: 0, currency: 'AED', status: 'approved', payroll_id: null,
          effective_month: null, approved_at: null, paid_at: null,
          created_at: '2026-07-01T00:00:00.000Z',
        },
        {
          id: 'wrong-currency', username: 'bob', source_id: 'manual-bob', description: null,
          amount: 10, deduction_cap_exempt_amount: 0, currency: 'USD', status: 'approved', payroll_id: null,
          effective_month: '2026-07-01', approved_at: null, paid_at: null,
          created_at: '2026-07-01T00:00:00.000Z',
        },
        {
          id: 'old-wrong-currency', username: 'carol', source_id: 'old', description: null,
          amount: 999, deduction_cap_exempt_amount: 0, currency: 'USD', status: 'paid', payroll_id: null,
          effective_month: '2026-06-01', approved_at: null, paid_at: null,
          created_at: '2026-06-01T00:00:00.000Z',
        },
        {
          id: 'rejected-ambiguous', username: 'carol', source_id: 'rejected', description: null,
          amount: 999, deduction_cap_exempt_amount: 0, currency: 'USD', status: 'rejected', payroll_id: null,
          effective_month: null, approved_at: null, paid_at: null,
          created_at: '2026-07-01T00:00:00.000Z',
        },
      ],
    });

    const report = buildMonthlyDeductionsReport(input);
    const byUsername = new Map(report.employees.map((row) => [row.username, row]));
    expect(byUsername.get('alice')).toMatchObject({
      candidate: null,
      integrity_blockers: [{ code: 'deduction_missing_effective_month', payment_id: 'ambiguous' }],
    });
    expect(byUsername.get('bob')).toMatchObject({
      candidate: null,
      integrity_blockers: [{
        code: 'deduction_currency_mismatch',
        payment_id: 'wrong-currency',
        expected_currency: 'AED',
        actual_currency: 'USD',
      }],
    });
    expect(byUsername.get('carol')?.integrity_blockers).toEqual([]);
    expect(byUsername.get('carol')?.candidate).not.toBeNull();
  });
});

describe('admin deductions month validation', () => {
  it('accepts omitted/current/past months and rejects malformed or future months', () => {
    expect(resolveAdminDeductionsMonth(null, '2026-07')).toBe('2026-07');
    expect(resolveAdminDeductionsMonth('2026-07', '2026-07')).toBe('2026-07');
    expect(resolveAdminDeductionsMonth('2025-12', '2026-07')).toBe('2025-12');
    expect(resolveAdminDeductionsMonth('2026-13', '2026-07')).toBeNull();
    expect(resolveAdminDeductionsMonth('July-2026', '2026-07')).toBeNull();
    expect(resolveAdminDeductionsMonth('2026-08', '2026-07')).toBeNull();
  });
});
