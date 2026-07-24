import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import hrMessages from '@/messages/en/hr.json';
import type { ProductivityReport } from '@/lib/production/report';
import { PRODUCTION_ATTRIBUTION_STATUS } from '@/lib/constants/production';

const report: ProductivityReport = {
  month: '2026-07',
  next_open_deadline_at: null,
  employees: [{
    username: 'employee',
    display_name: 'Employee One',
    attendance: { present_days: 20, late_days: 1, absent_days: 0, total_hours: 160 },
    metrics: {
      deliveries: 1,
      on_time_pct: 0,
      on_time_count: 0,
      on_time_eligible_count: 1,
      late_count: 1,
      avg_delay_days: 0,
      avg_rounds: 1,
      review_rounds_total: 1,
      avg_days_to_first_submission: 1,
      avg_review_wait_hours: 2,
      reviewed_task_count: 1,
      outright_rejection_count: 0,
      outright_rejection_rate: 0,
      open_overdue: 0,
    },
    tasks: [{
      task_id: 'employee-task',
      title: 'Employee task',
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
      review_wait_hours: [1.5],
      on_time: false,
      delay_days: 0,
      delivery_eligible: true,
      delivery_exclusion: null,
      days_to_first_submission: 2,
      is_archived: false,
    }, {
      task_id: 'short-lead-task',
      title: 'Short lead task',
      assignee: 'employee',
      attribution_status: PRODUCTION_ATTRIBUTION_STATUS.SNAPSHOT_VERIFIED,
      due_date: '2026-07-21',
      effective_due_at: '2026-07-21T10:00:00.000000Z',
      production_deadline_exempt: false,
      created_at: '2026-07-20T12:00:00.000001Z',
      first_submitted_at: '2026-07-21T10:30:00.000001Z',
      review_entry_timestamps: ['2026-07-21T10:30:00.000001Z'],
      delivered_at: '2026-07-21T12:00:00.000000Z',
      review_rounds: 1,
      review_wait_hours: [1.5],
      on_time: false,
      delay_days: 0,
      delivery_eligible: false,
      delivery_exclusion: 'lead_time_under_24h',
      days_to_first_submission: 1,
      is_archived: false,
    }, {
      task_id: 'unverified-deadline-task',
      title: 'Unverified deadline task',
      assignee: 'employee',
      attribution_status: PRODUCTION_ATTRIBUTION_STATUS.SNAPSHOT_VERIFIED,
      due_date: '2026-07-21',
      effective_due_at: null,
      production_deadline_exempt: true,
      created_at: '2026-07-19T08:00:00.000000Z',
      first_submitted_at: '2026-07-21T09:00:00.000000Z',
      review_entry_timestamps: ['2026-07-21T09:00:00.000000Z'],
      delivered_at: '2026-07-21T12:00:00.000000Z',
      review_rounds: 1,
      review_wait_hours: [1],
      on_time: null,
      delay_days: null,
      delivery_eligible: false,
      delivery_exclusion: 'unverified_legacy_deadline',
      days_to_first_submission: 2,
      is_archived: false,
    }],
  }],
  unattributed_tasks: [{
    task_id: 'unattributed-task',
    title: 'Needs owner review',
    assignee: null,
    attribution_status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_UNVERIFIED,
    due_date: '2026-07-22',
    effective_due_at: '2026-07-22T11:00:00.000000Z',
    production_deadline_exempt: false,
    created_at: '2026-07-20T08:00:00.000000Z',
    first_submitted_at: '2026-07-22T12:00:00.000000Z',
    review_entry_timestamps: ['2026-07-22T12:00:00.000000Z'],
    delivered_at: null,
    review_rounds: 0,
    review_wait_hours: [],
    on_time: false,
    delay_days: 0,
    delivery_eligible: true,
    delivery_exclusion: null,
    days_to_first_submission: 2,
    is_archived: false,
  }],
};

vi.mock('@/hooks/useProductivity', () => ({
  useProductivityReport: () => ({
    data: report,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useProductivityTrends: () => ({
    data: { months: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { ProductivityClient } from '@/app/dashboard/hr/productivity/productivity-client';

describe('admin productivity audit UI', () => {
  afterEach(cleanup);

  it('shows exact Dubai first-submission time and a truthful same-day late label', () => {
    render(
      <NextIntlClientProvider locale="en" messages={hrMessages}>
        <ProductivityClient />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tasks & numbers (3)' }));
    expect(screen.getAllByText('2026-07-21 14:30 (+04:00)').length).toBeGreaterThan(0);
    expect(screen.getByText('Late on the same day')).toBeInTheDocument();
    expect(screen.queryByText('Late 0 days')).not.toBeInTheDocument();
  });

  it('shows why short-lead and unverified tasks are excluded from the on-time rate', () => {
    render(
      <NextIntlClientProvider locale="en" messages={hrMessages}>
        <ProductivityClient />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tasks & numbers (3)' }));
    expect(screen.getByText('Excluded · lead time under 24 hours')).toBeInTheDocument();
    expect(screen.getByText('Excluded · unverified legacy deadline')).toBeInTheDocument();
  });

  it('renders unattributed tasks in a separate admin review section', () => {
    render(
      <NextIntlClientProvider locale="en" messages={hrMessages}>
        <ProductivityClient />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText('Tasks needing attribution review')).toBeInTheDocument();
    expect(screen.getByText('Needs owner review')).toBeInTheDocument();
    expect(screen.getByText('Legacy attribution is not verifiable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tasks & numbers (3)' })).toBeInTheDocument();
  });
});
