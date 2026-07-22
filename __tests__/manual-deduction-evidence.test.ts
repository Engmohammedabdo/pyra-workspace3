import { describe, expect, it } from 'vitest';
import { MANUAL_DEDUCTION_BASIS } from '@/lib/constants/deductions';
import {
  buildManualDeductionEvidence,
  parseTrustedManualDeductionEvidence,
} from '@/lib/hr/manual-deduction';
import type { DeliveryTaskEvidence } from '@/lib/hr/deductions-report';

function deliveryTask(
  overrides: Partial<DeliveryTaskEvidence> = {},
): DeliveryTaskEvidence {
  return {
    task_id: 'task-late-1',
    title: 'Legacy late delivery',
    created_at: '2026-07-01T08:00:00.000Z',
    due_date: '2026-07-13',
    due_at: '2026-07-13T19:59:00.000Z',
    deadline_unverified: true,
    first_submitted_at: '2026-07-14T13:04:00.000Z',
    delivered_at: null,
    on_time: null,
    delay_days: null,
    review_rounds: 1,
    outcome: 'excluded',
    exclusion_reason: 'unverified_legacy_deadline',
    attribution_status: 'snapshot_verified',
    ...overrides,
  };
}

const qualityMonths = [
  {
    month: '2026-06',
    avg_rounds: 3,
    review_rounds_total: 6,
    deliveries: 2,
    outright_rejection_count: 0,
    reviewed_task_count: 2,
    outright_rejection_rate: 0,
  },
  {
    month: '2026-07',
    avg_rounds: 2,
    review_rounds_total: 4,
    deliveries: 2,
    outright_rejection_count: 1,
    reviewed_task_count: 2,
    outright_rejection_rate: 50,
  },
] as const;

describe('trusted manual deduction evidence', () => {
  it('builds a canonical server snapshot for selected legacy late tasks', () => {
    const result = buildManualDeductionEvidence({
      basis: MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY,
      employee_username: 'wael.hany',
      report_month: '2026-07',
      evidence_task_ids: ['task-late-2', 'task-late-1'],
      owner_attestation: true,
      delivery_tasks: [
        deliveryTask(),
        deliveryTask({
          task_id: 'task-late-2',
          title: 'Second legacy late delivery',
          due_date: '2026-07-17',
          first_submitted_at: '2026-07-18T14:20:00.000Z',
          exclusion_reason: 'legacy_unverified_attribution',
          attribution_status: 'legacy_unverified',
        }),
      ],
      quality_months: qualityMonths,
    });

    expect(result).toEqual({
      ok: true,
      evidence: {
        schema_version: 1,
        source: 'employee_deductions_admin_approval',
        basis: 'owner_attested_legacy_delivery',
        employee_username: 'wael.hany',
        report_month: '2026-07',
        legacy_delivery: {
          evaluation: 'submitted_after_due_calendar_day_dubai',
          owner_attested: true,
          tasks: [
            expect.objectContaining({
              task_id: 'task-late-1',
              due_date: '2026-07-13',
              due_at: null,
              first_submitted_at: '2026-07-14T13:04:00.000Z',
            }),
            expect.objectContaining({
              task_id: 'task-late-2',
              due_date: '2026-07-17',
              first_submitted_at: '2026-07-18T14:20:00.000Z',
            }),
          ],
        },
      },
    });
  });

  it('rejects empty, duplicated, unknown, and non-qualifying legacy selections', () => {
    const base = {
      basis: MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY,
      employee_username: 'wael.hany',
      report_month: '2026-07',
      delivery_tasks: [deliveryTask()],
      quality_months: qualityMonths,
      owner_attestation: true,
    } as const;

    expect(buildManualDeductionEvidence({ ...base, evidence_task_ids: [] }))
      .toEqual({ ok: false, code: 'missing_task_selection' });
    expect(buildManualDeductionEvidence({
      ...base,
      evidence_task_ids: ['task-late-1'],
      owner_attestation: false,
    })).toEqual({ ok: false, code: 'owner_attestation_required' });
    expect(buildManualDeductionEvidence({
      ...base,
      evidence_task_ids: ['task-late-1', 'task-late-1'],
    })).toEqual({ ok: false, code: 'invalid_task_selection' });
    expect(buildManualDeductionEvidence({ ...base, evidence_task_ids: ['unknown'] }))
      .toEqual({ ok: false, code: 'invalid_task_selection' });
    expect(buildManualDeductionEvidence({
      ...base,
      evidence_task_ids: ['task-same-day'],
      delivery_tasks: [deliveryTask({
        task_id: 'task-same-day',
        first_submitted_at: '2026-07-13T19:59:00.000Z',
      })],
    })).toEqual({ ok: false, code: 'invalid_task_selection' });
    expect(buildManualDeductionEvidence({
      ...base,
      evidence_task_ids: ['task-next-month'],
      delivery_tasks: [deliveryTask({
        task_id: 'task-next-month',
        first_submitted_at: '2026-08-01T00:01:00.000Z',
      })],
    })).toEqual({ ok: false, code: 'invalid_task_selection' });
  });

  it('builds quality evidence only after two consecutive below-band months', () => {
    const result = buildManualDeductionEvidence({
      basis: MANUAL_DEDUCTION_BASIS.QUALITY_REPEATED_PATTERN,
      employee_username: 'quality.employee',
      report_month: '2026-07',
      evidence_task_ids: [],
      owner_attestation: false,
      delivery_tasks: [],
      quality_months: qualityMonths,
    });

    expect(result).toEqual({
      ok: true,
      evidence: {
        schema_version: 1,
        source: 'employee_deductions_admin_approval',
        basis: 'quality_repeated_pattern',
        employee_username: 'quality.employee',
        report_month: '2026-07',
        quality: {
          policy: {
            avg_rounds_above: 2,
            rejection_rate_at_least_percent: 20,
            consecutive_months_required: 2,
          },
          eligibility: {
            current_below_band: true,
            consecutive_months: 2,
            eligible: true,
          },
          months: qualityMonths,
        },
      },
    });
  });

  it('rejects quality money without eligibility or with task evidence attached', () => {
    const base = {
      basis: MANUAL_DEDUCTION_BASIS.QUALITY_REPEATED_PATTERN,
      employee_username: 'quality.employee',
      report_month: '2026-07',
      delivery_tasks: [],
      owner_attestation: false,
    } as const;

    expect(buildManualDeductionEvidence({
      ...base,
      evidence_task_ids: ['task-late-1'],
      quality_months: qualityMonths,
    })).toEqual({ ok: false, code: 'unexpected_task_selection' });
    expect(buildManualDeductionEvidence({
      ...base,
      evidence_task_ids: [],
      quality_months: [{
        month: '2026-07',
        avg_rounds: 1,
        outright_rejection_rate: 0,
      }],
    })).toEqual({ ok: false, code: 'quality_not_eligible' });
  });

  it('rejects unsupported bases and inconsistent report identity', () => {
    const base = {
      employee_username: 'employee',
      report_month: '2026-07',
      evidence_task_ids: [],
      delivery_tasks: [],
      quality_months: qualityMonths,
      owner_attestation: false,
    };

    expect(buildManualDeductionEvidence({ ...base, basis: 'anything' }))
      .toEqual({ ok: false, code: 'invalid_basis' });
    expect(buildManualDeductionEvidence({ ...base, basis: MANUAL_DEDUCTION_BASIS.QUALITY_REPEATED_PATTERN, report_month: 'July' }))
      .toEqual({ ok: false, code: 'invalid_identity' });
  });

  it('parses only untampered server snapshots for later audit and retry', () => {
    const built = buildManualDeductionEvidence({
      basis: MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY,
      employee_username: 'wael.hany',
      report_month: '2026-07',
      evidence_task_ids: ['task-late-1'],
      owner_attestation: true,
      delivery_tasks: [deliveryTask()],
      quality_months: qualityMonths,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.evidence.basis).toBe(MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY);
    if (built.evidence.basis !== MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY) return;

    expect(parseTrustedManualDeductionEvidence(built.evidence)).toEqual(built.evidence);
    expect(parseTrustedManualDeductionEvidence({
      ...built.evidence,
      legacy_delivery: {
        ...built.evidence.legacy_delivery,
        owner_attested: false,
      },
    })).toBeNull();
    expect(parseTrustedManualDeductionEvidence({
      ...built.evidence,
      legacy_delivery: {
        ...built.evidence.legacy_delivery,
        tasks: built.evidence.legacy_delivery.tasks.map((task) => ({
          ...task,
          due_at: '2026-07-13T19:59:00.000Z',
        })),
      },
    })).toBeNull();
    expect(parseTrustedManualDeductionEvidence({ evidence: 'from-browser' })).toBeNull();
  });

  it('validates historical quality evidence against its immutable policy snapshot', () => {
    const evidence = {
      schema_version: 1,
      source: 'employee_deductions_admin_approval',
      basis: MANUAL_DEDUCTION_BASIS.QUALITY_REPEATED_PATTERN,
      employee_username: 'quality.employee',
      report_month: '2026-07',
      quality: {
        policy: {
          avg_rounds_above: 4,
          rejection_rate_at_least_percent: 40,
          consecutive_months_required: 2,
        },
        eligibility: {
          current_below_band: true,
          consecutive_months: 2,
          eligible: true,
        },
        months: [
          {
            month: '2026-06',
            avg_rounds: 5,
            review_rounds_total: 10,
            reviewed_task_count: 2,
            outright_rejection_count: 0,
            outright_rejection_rate: 0,
          },
          {
            month: '2026-07',
            avg_rounds: 2,
            review_rounds_total: 4,
            reviewed_task_count: 2,
            outright_rejection_count: 1,
            outright_rejection_rate: 50,
          },
        ],
      },
    };

    expect(parseTrustedManualDeductionEvidence(evidence)).toEqual(evidence);
    expect(parseTrustedManualDeductionEvidence({
      ...evidence,
      quality: {
        ...evidence.quality,
        policy: { ...evidence.quality.policy, consecutive_months_required: 0 },
      },
    })).toBeNull();
  });
});
