import { describe, it, expect } from 'vitest';
import { chunk } from '@/lib/utils/chunk';

describe('chunk', () => {
  it('splits into full batches', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });
  it('keeps the short trailing batch', () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
  it('returns an empty array for empty input', () => {
    expect(chunk([], 10)).toEqual([]);
  });
  it('returns one batch when size exceeds length', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });
});
