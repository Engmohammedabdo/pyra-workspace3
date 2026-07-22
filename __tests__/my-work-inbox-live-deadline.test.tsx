import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MockTask {
  id: string;
  title: string;
  due_date: string | null;
  due_at: string | null;
  production_deadline_exempt: boolean;
  board_id: string;
  board_name: string;
  column_name: string;
  is_done_column: boolean;
}

const mocks = vi.hoisted(() => ({
  response: {
    tasks: {
      overdue: [] as MockTask[],
      today: [
        {
          id: 'task-exact',
          title: 'Exact deadline task',
          due_date: '2026-07-21',
          due_at: '2026-07-21T10:00:00.000Z',
          production_deadline_exempt: false,
          board_id: 'board-1',
          board_name: 'Production',
          column_name: 'Working',
          is_done_column: false,
        },
      ] as MockTask[],
      this_week: [] as MockTask[],
      unverified: [] as MockTask[],
    },
    approvals_waiting: { leave: [], expense: [], timesheet: [], total: 0 },
    conversations: { unread: [] },
    leads: { needs_action: [] },
    follow_ups: { due: [] },
    counts: {
      tasks_total: 1,
      approvals_total: 0,
      conversations_unread: 0,
      leads_action: 0,
      follow_ups_due: 0,
    },
  },
}));

vi.mock('@/hooks/useMyWork', () => ({
  useMyWork: () => ({ data: mocks.response, isLoading: false }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/i18n/status-labels', () => ({
  useStatusLabels: () => (value: string) => value,
}));

import { MyWorkInbox } from '@/components/dashboard/MyWorkInbox';

describe('MyWorkInbox exact deadline clock', () => {
  beforeEach(() => {
    mocks.response.tasks.overdue = [];
    mocks.response.tasks.today = [{
      id: 'task-exact',
      title: 'Exact deadline task',
      due_date: '2026-07-21',
      due_at: '2026-07-21T10:00:00.000Z',
      production_deadline_exempt: false,
      board_id: 'board-1',
      board_name: 'Production',
      column_name: 'Working',
      is_done_column: false,
    }];
    mocks.response.tasks.this_week = [];
    mocks.response.tasks.unverified = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('changes an idle task from due to overdue one millisecond after due_at', () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-21T09:59:59.500Z');

    const { container, unmount } = render(<MyWorkInbox />);

    expect(screen.getByText('dueDate.exact')).toBeTruthy();
    expect(screen.queryByText('dueDate.exactOverdue')).toBeNull();
    expect(container.querySelector('.from-emerald-500')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText('dueDate.exact')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText('dueDate.exactOverdue')).toBeTruthy();
    expect(container.querySelector('.from-red-500')).not.toBeNull();

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['the provenance flag', true],
    ['the literal migration sentinel', false],
  ])('shows a date-only unverified label and never overdue for %s', (_label, exempt) => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-22T08:00:00.000Z');
    mocks.response.tasks.today = [{
      ...mocks.response.tasks.today[0],
      due_date: '2026-07-21',
      due_at: '2026-07-21T19:59:59.999Z',
      production_deadline_exempt: exempt,
    }];

    const { container, unmount } = render(<MyWorkInbox />);

    expect(screen.getByText('dueDate.unverified')).toBeTruthy();
    expect(screen.queryByText('dueDate.exact')).toBeNull();
    expect(screen.queryByText('dueDate.exactOverdue')).toBeNull();
    expect(container.querySelector('.from-red-500')).toBeNull();

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows an amber explicit warning when a known legacy task has no deadline date', () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-22T08:00:00.000Z');
    mocks.response.tasks.today = [];
    mocks.response.tasks.unverified = [{
      id: 'task-unverified-missing',
      title: 'Legacy task without a deadline',
      due_date: null,
      due_at: null,
      production_deadline_exempt: true,
      board_id: 'board-1',
      board_name: 'Production',
      column_name: 'Working',
      is_done_column: false,
    }];

    const { container, unmount } = render(<MyWorkInbox />);

    expect(screen.getByText('dueDate.unverifiedMissing')).toBeTruthy();
    expect(container.querySelector('.from-amber-500')).not.toBeNull();
    expect(container.querySelector('.from-emerald-500')).toBeNull();
    expect(container.querySelector('.from-red-500')).toBeNull();

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
