import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaskJourney } from '@/lib/production/metrics';
import {
  nextOpenDeadlineForReportMonth,
} from '@/lib/production/report';
import {
  isCurrentProductivityMonth,
  useProductivityDeadlineRefetch,
} from '@/hooks/useProductivity';

function journey(overrides: Partial<TaskJourney>): TaskJourney {
  return {
    task_id: 'task',
    title: 'Task',
    assignee: 'employee',
    due_date: null,
    effective_due_at: '2026-07-21T10:00:00.000Z',
    production_deadline_exempt: false,
    created_at: '2026-07-20T08:00:00.000Z',
    first_submitted_at: null,
    review_entry_timestamps: [],
    delivered_at: null,
    review_rounds: 0,
    review_wait_hours: [],
    on_time: null,
    delay_days: null,
    delivery_eligible: true,
    delivery_exclusion: null,
    days_to_first_submission: null,
    is_archived: false,
    ...overrides,
  };
}

describe('productivity next open deadline metadata', () => {
  it('returns the deterministic nearest still-open boundary for the current Dubai month', () => {
    const currentInstant = '2026-07-21T09:00:00.000Z';
    const nearest = '2026-07-21T09:30:00.000Z';
    const journeys = [
      journey({ task_id: 'later', effective_due_at: '2026-07-21T11:00:00.000Z' }),
      journey({ task_id: 'nearest', effective_due_at: nearest }),
      journey({ task_id: 'archived', effective_due_at: '2026-07-21T09:10:00.000Z', is_archived: true }),
      journey({ task_id: 'submitted', effective_due_at: '2026-07-21T09:05:00.000Z', first_submitted_at: '2026-07-21T09:00:00.000Z' }),
      journey({ task_id: 'past', effective_due_at: '2026-07-21T08:59:59.999Z' }),
    ];

    expect(nextOpenDeadlineForReportMonth(journeys, '2026-07', currentInstant)).toBe(nearest);
    expect(nextOpenDeadlineForReportMonth(journeys, '2026-06', currentInstant)).toBeNull();
  });

  it('keeps equality as the next boundary because overdue starts one millisecond later', () => {
    const boundary = '2026-07-21T10:00:00.000Z';
    expect(nextOpenDeadlineForReportMonth([journey({ effective_due_at: boundary })], '2026-07', boundary))
      .toBe(boundary);
  });
});

describe('productivity deadline client refresh', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refetches one millisecond after the server-provided boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-21T09:59:59.500Z');
    const refetch = vi.fn(async () => undefined);

    const { unmount } = renderHook(() =>
      useProductivityDeadlineRefetch('2026-07-21T10:00:00.000Z', true, refetch),
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(refetch).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not schedule or refetch for a past selected month', () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-21T09:00:00.000Z');
    const refetch = vi.fn(async () => undefined);

    expect(isCurrentProductivityMonth('2026-07', '2026-07-21T09:00:00.000Z')).toBe(true);
    expect(isCurrentProductivityMonth('2026-06', '2026-07-21T09:00:00.000Z')).toBe(false);

    const { unmount } = renderHook(() =>
      useProductivityDeadlineRefetch('2026-07-21T10:00:00.000Z', false, refetch),
    );
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(3_600_001);
    });
    expect(refetch).not.toHaveBeenCalled();

    unmount();
  });
});
