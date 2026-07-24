import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import myworkMessages from '@/messages/en/mywork.json';
import { PRODUCTION_ATTRIBUTION_STATUS } from '@/lib/constants/production';
import type { ProductivityReport } from '@/lib/production/report';

const report: ProductivityReport = {
  month: '2026-07',
  next_open_deadline_at: null,
  unattributed_tasks: [],
  employees: [{
    username: 'wael.hany',
    display_name: 'Wael Hany',
    attendance: { present_days: 10, late_days: 2, absent_days: 1, total_hours: 79 },
    metrics: {
      deliveries: 2,
      on_time_pct: 50,
      on_time_count: 1,
      on_time_eligible_count: 2,
      late_count: 1,
      avg_delay_days: 0,
      avg_rounds: 1.5,
      review_rounds_total: 3,
      avg_days_to_first_submission: 2.5,
      avg_review_wait_hours: 1,
      reviewed_task_count: 2,
      outright_rejection_count: 0,
      outright_rejection_rate: 0,
      open_overdue: 0,
    },
    tasks: [{
      task_id: 'exact-late',
      title: 'Exact late task',
      assignee: 'wael.hany',
      attribution_status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_ACTOR_VERIFIED,
      due_date: '2026-07-21',
      effective_due_at: '2026-07-21T10:00:00.000000Z',
      production_deadline_exempt: false,
      created_at: '2026-07-15T08:00:00.000000Z',
      first_submitted_at: '2026-07-21T10:30:00.000001Z',
      review_entry_timestamps: ['2026-07-21T10:30:00.000001Z'],
      delivered_at: '2026-07-21T12:00:00.000000Z',
      review_rounds: 2,
      review_wait_hours: [1],
      on_time: false,
      delay_days: 0,
      delivery_eligible: true,
      delivery_exclusion: null,
      days_to_first_submission: 6,
      is_archived: false,
    }, {
      task_id: 'legacy-deadline',
      title: 'Legacy deadline task',
      assignee: 'wael.hany',
      attribution_status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_ACTOR_VERIFIED,
      due_date: '2026-07-18',
      effective_due_at: null,
      production_deadline_exempt: true,
      created_at: '2026-07-10T08:00:00.000000Z',
      first_submitted_at: '2026-07-18T09:00:00.000000Z',
      review_entry_timestamps: ['2026-07-18T09:00:00.000000Z'],
      delivered_at: '2026-07-18T12:00:00.000000Z',
      review_rounds: 1,
      review_wait_hours: [1],
      on_time: null,
      delay_days: null,
      delivery_eligible: false,
      delivery_exclusion: 'unverified_legacy_deadline',
      days_to_first_submission: 8,
      is_archived: false,
    }],
  }],
};

vi.mock('@/hooks/useProductivity', () => ({
  useMyProductivity: () => ({
    data: report,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { MyProductivityCard } from '@/components/dashboard/MyProductivityCard';

describe('employee productivity card', () => {
  afterEach(cleanup);

  it('shows month-to-date metrics and the employee own-scope task evidence', () => {
    render(
      <NextIntlClientProvider locale="en" messages={myworkMessages}>
        <MyProductivityCard />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('1.5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tasks & numbers (2)' }));

    expect(screen.getByText('Exact late task')).toBeInTheDocument();
    expect(screen.getByText('Legacy deadline task')).toBeInTheDocument();
    expect(screen.getByText('2026-07-21 14:00 (+04:00)')).toBeInTheDocument();
    expect(screen.getByText('Late on the same day')).toBeInTheDocument();
    expect(screen.getByText('Excluded · unverified legacy deadline')).toBeInTheDocument();
  });
});
