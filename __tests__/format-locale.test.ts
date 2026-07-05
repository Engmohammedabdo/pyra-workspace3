import { describe, it, expect } from 'vitest';
import { getDateFnsLocale } from '@/lib/i18n/date-locale';
import { formatDate, formatRelativeDate, formatTaskDueDate, formatTime } from '@/lib/utils/format';

describe('locale-aware formatting', () => {
  const d = new Date('2026-01-15T10:00:00Z');

  it('getDateFnsLocale maps ar/en', () => {
    expect(getDateFnsLocale('ar').code).toBe('ar');
    expect(getDateFnsLocale('en').code).toBe('en-US');
  });

  it('formatDate defaults to Arabic (backward compatible)', () => {
    expect(formatDate(d, 'dd MMM')).toBe(formatDate(d, 'dd MMM', 'ar'));
  });

  it('formatDate en renders English month names', () => {
    expect(formatDate(d, 'dd MMM yyyy', 'en')).toContain('Jan');
  });

  it('formatRelativeDate en renders English', () => {
    expect(formatRelativeDate(new Date(Date.now() - 60_000), 'en')).toMatch(/minute|less than/i);
  });

  it('formatTaskDueDate en labels', () => {
    const today = new Date('2026-01-15T10:00:00Z');
    expect(formatTaskDueDate(null, today, 'en').label).toBe('No due date');
    expect(formatTaskDueDate('2026-01-15', today, 'en').label).toBe('Today');
    expect(formatTaskDueDate('2026-01-16', today, 'en').label).toBe('Tomorrow');
    expect(formatTaskDueDate('2026-01-12', today, 'en').label).toBe('Overdue by 3 days');
    expect(formatTaskDueDate('2026-01-18', today, 'en').label).toBe('In 3 days');
  });

  it('formatTaskDueDate ar labels unchanged (regression)', () => {
    const today = new Date('2026-01-15T10:00:00Z');
    expect(formatTaskDueDate(null, today).label).toBe('بدون موعد');
    expect(formatTaskDueDate('2026-01-15', today).label).toBe('اليوم');
    expect(formatTaskDueDate('2026-01-16', today).label).toBe('غداً');
  });

  it('formatTime en uses Latin digits', () => {
    expect(formatTime('2026-01-15T10:00:00Z', 'en')).toMatch(/\d/);
  });
});
