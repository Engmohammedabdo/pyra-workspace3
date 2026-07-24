import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resolveTaskDeadlineDisplay,
  useDeadlineClock,
} from '@/hooks/useDeadlineClock';

describe('useDeadlineClock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-renders immediately after the nearest exact deadline boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-20T09:59:59.500Z');

    const { result, unmount } = renderHook(() =>
      useDeadlineClock(['2026-07-20T10:00:00.000Z']),
    );

    expect(result.current).toBe('2026-07-20T09:59:59.500Z');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe('2026-07-20T09:59:59.500Z');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('2026-07-20T10:00:00.001Z');

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('resolveTaskDeadlineDisplay', () => {
  it('never falls back to a legacy date when a non-null exact value is invalid', () => {
    expect(resolveTaskDeadlineDisplay('not-an-instant', '2026-07-20', 'en')).toBeNull();
  });

  it('formats date-only deadlines independently of the viewer timezone', () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      expect(resolveTaskDeadlineDisplay(null, '2026-07-20', 'en')).toEqual({
        kind: 'legacy',
        label: '20 Jul',
      });
    } finally {
      process.env.TZ = previousTimezone;
    }
  });

  it('returns the exact Dubai date and time when the exact value is valid', () => {
    expect(
      resolveTaskDeadlineDisplay(
        '2026-07-20T10:00:00.000Z',
        '2026-07-19',
        'en',
      ),
    ).toEqual({
      kind: 'exact',
      date: '2026-07-20',
      time: '14:00',
    });
  });
});
