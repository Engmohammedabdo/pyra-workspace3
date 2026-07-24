import {
  ATTENDANCE_HALF_DAY_MAX_MINUTES,
  ATTENDANCE_QUARTER_DAY_MAX_MINUTES,
  DELIVERY_DEDUCTION_PERCENT,
  DELIVERY_MIN_LEAD_TIME_HOURS,
  MONTHLY_DEDUCTION_CAP_PERCENT,
  QUALITY_AVG_ROUNDS_THRESHOLD,
  QUALITY_CONSECUTIVE_MONTHS_REQUIRED,
  QUALITY_REJECTION_RATE_THRESHOLD_PERCENT,
} from '@/lib/constants/deductions';
import { WEEKEND_DAYS } from '@/lib/constants/auth';
import {
  ATTENDANCE_GRACE_MINUTES,
  DEDUCTION_DAYS_PER_MONTH,
} from '@/lib/hr/attendance-policy';
import type { MonthlyEmployeeDeductionReport } from '@/lib/hr/deductions-report';

export const COMPUTED_DEDUCTION_EVIDENCE_SOURCE =
  'employee_deductions_computed_approval' as const;

export interface ComputedDeductionReportMeta {
  month: string;
  as_of_date: string;
  generated_at: string;
}

export interface ComputedDeductionApprovalSnapshot {
  employee_username: string;
  period_month: string;
  salary_snapshot: number;
  salary_currency: string;
  attendance_units: number;
  attendance_amount: number;
  delivery_on_time_pct: number | null;
  delivery_band: 'none' | 'minor' | 'moderate' | 'major';
  delivery_amount: number;
  delivery_percentage: number;
  quality_avg_rounds: number | null;
  quality_outright_rejection_rate: number | null;
  quality_below_band: boolean;
  quality_consecutive_months: number;
  quality_eligible: boolean;
  quality_amount: 0;
  monthly_cap_percentage: number;
  evidence: Record<string, unknown>;
  policy_snapshot: Record<string, unknown>;
}

/**
 * Freezes the trusted report inputs used by the atomic DB approval. The browser
 * never supplies salary, evidence, percentages, or monetary amounts.
 */
export function buildComputedDeductionApprovalSnapshot(
  employee: MonthlyEmployeeDeductionReport,
  report: ComputedDeductionReportMeta,
): ComputedDeductionApprovalSnapshot {
  if (!employee.candidate || employee.salary === null || !employee.currency) {
    throw new Error('computed deduction candidate is unavailable');
  }
  if (employee.integrity_blockers.length > 0) {
    throw new Error('computed deduction evidence has integrity blockers');
  }
  if (employee.candidate.cap.approved_amount <= 0) {
    throw new Error('computed deduction amount must be positive');
  }

  const candidate = employee.candidate;
  const qualityMonth = employee.quality_months.find(({ month }) => month === report.month) ?? null;

  return {
    employee_username: employee.username,
    period_month: `${report.month}-01`,
    salary_snapshot: employee.salary,
    salary_currency: employee.currency,
    attendance_units: candidate.attendance.total_units,
    attendance_amount: candidate.attendance.amount,
    delivery_on_time_pct: candidate.delivery.on_time_pct,
    delivery_band: candidate.delivery.band,
    delivery_amount: candidate.delivery.amount,
    delivery_percentage: candidate.delivery.percentage,
    quality_avg_rounds: qualityMonth?.avg_rounds ?? null,
    quality_outright_rejection_rate: qualityMonth?.outright_rejection_rate ?? null,
    quality_below_band: candidate.quality.current_below_band,
    quality_consecutive_months: candidate.quality.consecutive_months,
    quality_eligible: candidate.quality.eligible,
    quality_amount: 0,
    monthly_cap_percentage: MONTHLY_DEDUCTION_CAP_PERCENT,
    evidence: {
      schema_version: 1,
      source: COMPUTED_DEDUCTION_EVIDENCE_SOURCE,
      employee_username: employee.username,
      report_month: report.month,
      report_as_of_date: report.as_of_date,
      report_generated_at: report.generated_at,
      attendance_inputs: employee.attendance_inputs,
      delivery_tasks: employee.delivery_tasks,
      quality_months: employee.quality_months,
      computed_candidate: candidate,
    },
    policy_snapshot: {
      attendance: {
        grace_minutes: ATTENDANCE_GRACE_MINUTES,
        quarter_day_max_minutes: ATTENDANCE_QUARTER_DAY_MAX_MINUTES,
        half_day_max_minutes: ATTENDANCE_HALF_DAY_MAX_MINUTES,
        days_per_month: DEDUCTION_DAYS_PER_MONTH,
        weekend_days: WEEKEND_DAYS,
      },
      delivery: {
        minor_percent: DELIVERY_DEDUCTION_PERCENT.MINOR,
        moderate_percent: DELIVERY_DEDUCTION_PERCENT.MODERATE,
        major_percent: DELIVERY_DEDUCTION_PERCENT.MAJOR,
        minimum_lead_time_hours: DELIVERY_MIN_LEAD_TIME_HOURS,
      },
      quality: {
        average_rounds_above: QUALITY_AVG_ROUNDS_THRESHOLD,
        rejection_rate_at_least_percent: QUALITY_REJECTION_RATE_THRESHOLD_PERCENT,
        consecutive_months_required: QUALITY_CONSECUTIVE_MONTHS_REQUIRED,
        automatic_money: false,
      },
      monthly_cap: {
        percent: MONTHLY_DEDUCTION_CAP_PERCENT,
        attendance_exempt: true,
      },
    },
  };
}
