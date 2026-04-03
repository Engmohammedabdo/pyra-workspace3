import { describe, it, expect } from 'vitest';
import { buildQueryString } from '@/hooks/api-helpers';

describe('buildQueryString', () => {
  it('returns empty string when no params', () => {
    expect(buildQueryString()).toBe('');
    expect(buildQueryString({})).toBe('');
  });

  it('builds correct query string', () => {
    const result = buildQueryString({ status: 'active', page: '1' });
    expect(result).toContain('status=active');
    expect(result).toContain('page=1');
    expect(result[0]).toBe('?');
  });

  it('skips undefined and empty values', () => {
    const result = buildQueryString({ status: 'active', search: undefined, empty: '' });
    expect(result).toBe('?status=active');
  });

  it('handles all undefined values', () => {
    const result = buildQueryString({ a: undefined, b: undefined });
    expect(result).toBe('');
  });
});
