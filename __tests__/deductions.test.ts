import { describe, expect, it } from 'vitest';
import { MANUAL_DEDUCTION_BASIS } from '@/lib/constants/deductions';
import {
  applyMonthlyDeductionCap,
  attendanceUnitsForLateMinutes,
  calculateAttendanceDeduction,
  calculateDeliveryDeduction,
  computeMonthlyDeductionCandidate,
  deliveryBandForOnTimePct,
  evaluateQualityEligibility,
  isLegacyDeliveryDelayEvidence,
  isQualityBelowBand,
} from '@/lib/hr/deductions';

describe('manual deduction evidence basis', () => {
  it('centralizes the only two supported manual bases', () => {
    expect(MANUAL_DEDUCTION_BASIS).toEqual({
      OWNER_ATTESTED_LEGACY_DELIVERY: 'owner_attested_legacy_delivery',
      QUALITY_REPEATED_PATTERN: 'quality_repeated_pattern',
    });
  });

  it.each([
    'unverified_legacy_deadline',
    'legacy_unverified_attribution',
  ] as const)('accepts a documented legacy delay for %s', (exclusionReason) => {
    expect(isLegacyDeliveryDelayEvidence({
      due_date: '2026-07-13',
      first_submitted_at: '2026-07-13T20:00:00.000Z', // 2026-07-14 00:00 Dubai
      exclusion_reason: exclusionReason,
    })).toBe(true);
  });

  it('does not call a submission late when its Dubai day is still the due day', () => {
    expect(isLegacyDeliveryDelayEvidence({
      due_date: '2026-07-13',
      first_submitted_at: '2026-07-13T19:59:59.999Z', // 2026-07-13 23:59 Dubai
      exclusion_reason: 'unverified_legacy_deadline',
    })).toBe(false);
  });

  it.each([
    { due_date: null, first_submitted_at: '2026-07-14T08:00:00.000Z' },
    { due_date: '2026-07-13', first_submitted_at: null },
  ])('rejects missing documented evidence: %o', ({ due_date, first_submitted_at }) => {
    expect(isLegacyDeliveryDelayEvidence({
      due_date,
      first_submitted_at,
      exclusion_reason: 'legacy_unverified_attribution',
    })).toBe(false);
  });

  it('rejects a short-lead exclusion even when the submission was on a later day', () => {
    expect(isLegacyDeliveryDelayEvidence({
      due_date: '2026-07-13',
      first_submitted_at: '2026-07-15T08:00:00.000Z',
      exclusion_reason: 'lead_time_under_24h',
    })).toBe(false);
  });

  it.each([
    { due_date: '2026-02-30', first_submitted_at: '2026-03-01T08:00:00.000Z' },
    { due_date: '2026-07-13', first_submitted_at: 'not-a-timestamp' },
  ])('rejects invalid date or timestamp evidence: %o', ({ due_date, first_submitted_at }) => {
    expect(isLegacyDeliveryDelayEvidence({
      due_date,
      first_submitted_at,
      exclusion_reason: 'unverified_legacy_deadline',
    })).toBe(false);
  });
});

describe('attendance deduction tiers', () => {
  it.each([
    [0, 0],
    [15, 0],
    [16, 0.25],
    [60, 0.25],
    [61, 0.5],
    [120, 0.5],
    [121, 1],
    [510, 1],
    [null, 1],
  ] as const)('maps %s late minutes to %s day units', (lateMinutes, expected) => {
    expect(attendanceUnitsForLateMinutes(lateMinutes)).toBe(expected);
  });

  it('never deducts an excused late arrival or no-show', () => {
    expect(attendanceUnitsForLateMinutes(121, true)).toBe(0);
    expect(attendanceUnitsForLateMinutes(null, true)).toBe(0);
  });

  it('uses salary/30 and rounds only the money total', () => {
    expect(calculateAttendanceDeduction(10_000, [
      { date: '2026-07-01', late_minutes: 16 },
      { date: '2026-07-02', late_minutes: 61 },
      { date: '2026-07-03', late_minutes: null },
      { date: '2026-07-04', late_minutes: 121, excused: true },
    ])).toEqual({
      daily_rate: 333.33,
      total_units: 1.75,
      amount: 583.33,
      incidents: [
        { date: '2026-07-01', late_minutes: 16, kind: 'late', excused: false, units: 0.25 },
        { date: '2026-07-02', late_minutes: 61, kind: 'late', excused: false, units: 0.5 },
        { date: '2026-07-03', late_minutes: null, kind: 'no_show', excused: false, units: 1 },
        { date: '2026-07-04', late_minutes: 121, kind: 'late', excused: true, units: 0 },
      ],
    });
  });
});

describe('delivery monthly band', () => {
  it.each([
    [null, 'none'],
    [100, 'none'],
    [90, 'none'],
    [89.99, 'minor'],
    [75, 'minor'],
    [74.99, 'moderate'],
    [50, 'moderate'],
    [49.99, 'major'],
    [0, 'major'],
  ] as const)('maps %s%% to %s', (onTimePct, expected) => {
    expect(deliveryBandForOnTimePct(onTimePct)).toBe(expected);
  });

  it('uses the owner-set 3/7/12 percentages against monthly salary', () => {
    expect(calculateDeliveryDeduction(10_000, 89.99)).toEqual({
      on_time_pct: 89.99,
      band: 'minor',
      percentage: 3,
      amount: 300,
    });
    expect(calculateDeliveryDeduction(10_000, 74.99).amount).toBe(700);
    expect(calculateDeliveryDeduction(10_000, 49.99).amount).toBe(1_200);
  });
});

describe('quality warning and eligibility', () => {
  it('uses exact raw averages and rejection rates at the locked boundaries', () => {
    expect(isQualityBelowBand({ avg_rounds: 2, outright_rejection_rate: 19.999 })).toBe(false);
    expect(isQualityBelowBand({ avg_rounds: 2.0001, outright_rejection_rate: 0 })).toBe(true);
    expect(isQualityBelowBand({ avg_rounds: null, outright_rejection_rate: 20 })).toBe(true);
  });

  it('becomes money-eligible only after two consecutive below-band months', () => {
    expect(evaluateQualityEligibility([
      { month: '2026-07', avg_rounds: 2.1, outright_rejection_rate: 0 },
    ])).toEqual({ current_below_band: true, consecutive_months: 1, eligible: false });

    expect(evaluateQualityEligibility([
      { month: '2026-06', avg_rounds: 2.1, outright_rejection_rate: 0 },
      { month: '2026-07', avg_rounds: 2, outright_rejection_rate: 20 },
    ])).toEqual({ current_below_band: true, consecutive_months: 2, eligible: true });

    expect(evaluateQualityEligibility([
      { month: '2026-05', avg_rounds: 3, outright_rejection_rate: 0 },
      { month: '2026-06', avg_rounds: 2, outright_rejection_rate: 0 },
      { month: '2026-07', avg_rounds: 3, outright_rejection_rate: 0 },
    ])).toEqual({ current_below_band: true, consecutive_months: 1, eligible: false });
  });

  it('does not treat two below-band rows with a missing calendar month as consecutive', () => {
    expect(evaluateQualityEligibility([
      { month: '2026-05', avg_rounds: 3, outright_rejection_rate: 0 },
      { month: '2026-07', avg_rounds: 3, outright_rejection_rate: 0 },
    ])).toEqual({ current_below_band: true, consecutive_months: 1, eligible: false });
  });
});

describe('monthly cap arithmetic', () => {
  it('caps the new approved amount at the remaining 25% salary ceiling', () => {
    expect(applyMonthlyDeductionCap(3_000, 1_000)).toEqual({
      cap_amount: 750,
      already_used_amount: 0,
      remaining_cap_amount: 750,
      cap_subject_requested_amount: 1_000,
      cap_subject_approved_amount: 750,
      cap_exempt_amount: 0,
      approved_amount: 750,
      capped: true,
    });

    expect(applyMonthlyDeductionCap(10_000, 1_000, 2_000)).toEqual({
      cap_amount: 2_500,
      already_used_amount: 2_000,
      remaining_cap_amount: 500,
      cap_subject_requested_amount: 1_000,
      cap_subject_approved_amount: 500,
      cap_exempt_amount: 0,
      approved_amount: 500,
      capped: true,
    });
  });

  it('adds cap-exempt attendance after capping only disciplinary deductions', () => {
    expect(applyMonthlyDeductionCap(3_000, 1_000, 0, 200)).toEqual({
      cap_amount: 750,
      already_used_amount: 0,
      remaining_cap_amount: 750,
      cap_subject_requested_amount: 1_000,
      cap_subject_approved_amount: 750,
      cap_exempt_amount: 200,
      approved_amount: 950,
      capped: true,
    });
  });

  it('never returns a negative approved amount when the ceiling is already consumed', () => {
    expect(applyMonthlyDeductionCap(10_000, 500, 3_000)).toEqual({
      cap_amount: 2_500,
      already_used_amount: 3_000,
      remaining_cap_amount: 0,
      cap_subject_requested_amount: 500,
      cap_subject_approved_amount: 0,
      cap_exempt_amount: 0,
      approved_amount: 0,
      capped: true,
    });
  });
});

describe('monthly deduction candidate', () => {
  const eligibleQualityMonths = [
    {
      month: '2026-06',
      avg_rounds: 3,
      outright_rejection_rate: 0,
      review_rounds_total: 3,
      reviewed_task_count: 1,
      outright_rejection_count: 0,
    },
    {
      month: '2026-07',
      avg_rounds: 2,
      outright_rejection_rate: 20,
      review_rounds_total: 2,
      reviewed_task_count: 5,
      outright_rejection_count: 1,
    },
  ] as const;

  it('combines independently derived components and preserves salary currency', () => {
    expect(computeMonthlyDeductionCandidate({
      salary: 10_000,
      currency: 'EGP',
      attendance: [{ date: '2026-07-01', late_minutes: 16 }],
      delivery_on_time_pct: 74.99,
      quality_months: eligibleQualityMonths,
      quality_amount: 250,
    })).toEqual({
      salary: 10_000,
      currency: 'EGP',
      attendance: {
        daily_rate: 333.33,
        total_units: 0.25,
        amount: 83.33,
        incidents: [
          { date: '2026-07-01', late_minutes: 16, kind: 'late', excused: false, units: 0.25 },
        ],
      },
      delivery: {
        on_time_pct: 74.99,
        band: 'moderate',
        percentage: 7,
        amount: 700,
      },
      quality: {
        current_below_band: true,
        consecutive_months: 2,
        eligible: true,
        amount: 250,
      },
      requested_amount: 1_033.33,
      cap: {
        cap_amount: 2_500,
        already_used_amount: 0,
        remaining_cap_amount: 2_500,
        cap_subject_requested_amount: 950,
        cap_subject_approved_amount: 950,
        cap_exempt_amount: 83.33,
        approved_amount: 1_033.33,
        capped: false,
      },
    });
  });

  it('uses only the remaining ceiling after existing disciplinary deductions', () => {
    const candidate = computeMonthlyDeductionCandidate({
      salary: 10_000,
      currency: 'AED',
      attendance: [],
      delivery_on_time_pct: 74.99,
      quality_months: [],
      already_used_amount: 2_000,
    });

    expect(candidate.requested_amount).toBe(700);
    expect(candidate.cap).toEqual({
      cap_amount: 2_500,
      already_used_amount: 2_000,
      remaining_cap_amount: 500,
      cap_subject_requested_amount: 700,
      cap_subject_approved_amount: 500,
      cap_exempt_amount: 0,
      approved_amount: 500,
      capped: true,
    });
  });

  it('keeps attendance fully payable after the disciplinary ceiling is consumed', () => {
    const candidate = computeMonthlyDeductionCandidate({
      salary: 3_000,
      currency: 'EGP',
      attendance: [{ date: '2026-07-01', late_minutes: null }],
      delivery_on_time_pct: 49.99,
      quality_months: [],
      already_used_amount: 750,
    });

    expect(candidate.requested_amount).toBe(460);
    expect(candidate.cap).toEqual({
      cap_amount: 750,
      already_used_amount: 750,
      remaining_cap_amount: 0,
      cap_subject_requested_amount: 360,
      cap_subject_approved_amount: 0,
      cap_exempt_amount: 100,
      approved_amount: 100,
      capped: true,
    });
  });

  it('rejects quality money unless the repeated-pattern rule is satisfied', () => {
    expect(() => computeMonthlyDeductionCandidate({
      salary: 10_000,
      currency: 'AED',
      attendance: [],
      delivery_on_time_pct: null,
      quality_months: [{
        month: '2026-07',
        avg_rounds: 3,
        outright_rejection_rate: 0,
      }],
      quality_amount: 1,
    })).toThrow('quality amount requires an eligible repeated pattern');
  });

  it('returns zero money safely for a zero salary', () => {
    const candidate = computeMonthlyDeductionCandidate({
      salary: 0,
      currency: 'AED',
      attendance: [{ date: '2026-07-01', late_minutes: null }],
      delivery_on_time_pct: 0,
      quality_months: [],
    });

    expect(candidate.attendance.total_units).toBe(1);
    expect(candidate.requested_amount).toBe(0);
    expect(candidate.cap.approved_amount).toBe(0);
  });
});
