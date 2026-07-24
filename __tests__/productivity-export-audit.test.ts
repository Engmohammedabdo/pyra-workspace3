import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { ProductivityReport, ProductivityTrends } from '@/lib/production/report';
import type { TaskJourney } from '@/lib/production/metrics';
import { PRODUCTION_ATTRIBUTION_STATUS } from '@/lib/constants/production';
import {
  buildProductivityWorkbook,
  formatProductivityTaskInstant,
  productivityTaskCommitmentLabel,
  productivityTaskPdfLine,
} from '@/lib/production/productivity-export';

function journey(overrides: Partial<TaskJourney> = {}): TaskJourney {
  return {
    task_id: 'task-1',
    title: 'Audit task',
    assignee: 'employee',
    attribution_status: PRODUCTION_ATTRIBUTION_STATUS.SNAPSHOT_VERIFIED,
    due_date: '2026-07-21',
    effective_due_at: '2026-07-21T10:00:00.000000Z',
    production_deadline_exempt: false,
    created_at: '2026-07-19T08:00:00.000000Z',
    first_submitted_at: '2026-07-21T10:30:00.000001Z',
    review_entry_timestamps: ['2026-07-21T10:30:00.000001Z'],
    delivered_at: '2026-07-21T12:00:00.000000Z',
    review_rounds: 1,
    review_wait_hours: [1],
    on_time: false,
    delay_days: 0,
    delivery_eligible: true,
    delivery_exclusion: null,
    days_to_first_submission: 2,
    is_archived: false,
    ...overrides,
  };
}

const metrics = {
  deliveries: 1,
  on_time_pct: 0,
  on_time_count: 0,
  on_time_eligible_count: 1,
  late_count: 1,
  avg_delay_days: 0,
  avg_rounds: 1,
  review_rounds_total: 1,
  avg_days_to_first_submission: 2,
  avg_review_wait_hours: 1,
  reviewed_task_count: 1,
  outright_rejection_count: 0,
  outright_rejection_rate: 0,
  open_overdue: 0,
};

describe('productivity audit exports', () => {
  it('formats first submission in exact Dubai wall time and never calls same-day lateness zero days', () => {
    const task = journey();
    expect(formatProductivityTaskInstant(task.first_submitted_at)).toBe('2026-07-21 14:30 (+04:00)');
    expect(productivityTaskCommitmentLabel(task)).toBe('متأخر في نفس اليوم');
    expect(productivityTaskPdfLine(task)).toContain('أول رفع: 2026-07-21 14:30 (+04:00)');
    expect(productivityTaskPdfLine(task)).toContain('متأخر في نفس اليوم');
    expect(productivityTaskPdfLine(task)).not.toContain('متأخر 0 يوم');
  });

  it('exports unattributed work in a separate needs-review sheet', () => {
    const employeeTask = journey();
    const unattributedTask = journey({
      task_id: 'legacy-task',
      title: 'Legacy task',
      assignee: null,
      attribution_status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_UNVERIFIED,
    });
    const report: ProductivityReport = {
      month: '2026-07',
      next_open_deadline_at: null,
      employees: [{
        username: 'employee',
        display_name: 'Employee One',
        attendance: { present_days: 1, late_days: 0, absent_days: 0, total_hours: 8 },
        metrics,
        tasks: [employeeTask],
      }],
      unattributed_tasks: [unattributedTask],
    };
    const trends: ProductivityTrends = { months: [] };

    const workbook = XLSX.read(buildProductivityWorkbook(report, trends));
    expect(workbook.SheetNames).toContain('Needs Review');

    const employeeRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Tasks);
    expect(employeeRows).toHaveLength(1);
    expect(employeeRows[0]['أول رفع']).toBe('2026-07-21 14:30 (+04:00)');

    const reviewRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets['Needs Review'],
    );
    expect(reviewRows).toHaveLength(1);
    expect(reviewRows[0]['المهمة']).toBe('Legacy task');
    expect(reviewRows[0]['سبب المراجعة']).toBe('إسناد قديم غير موثوق');
  });
});
