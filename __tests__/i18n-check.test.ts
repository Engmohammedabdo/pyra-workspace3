import { describe, it, expect } from 'vitest';
import { scanSource, findOrphanKeys } from '@/scripts/i18n-check';

describe('scanSource', () => {
  it('flags lines containing Arabic', () => {
    expect(scanSource(`const a = 'حفظ';\nconst b = 'save';`)).toEqual([1]);
  });
  it('returns empty for clean source', () => {
    expect(scanSource(`const b = 'save';`)).toEqual([]);
  });
  it('honors the i18n-exempt marker', () => {
    expect(scanSource(`const a = 'حفظ'; // i18n-exempt: PDF-only label`)).toEqual([]);
  });
});

describe('findOrphanKeys', () => {
  it('reports EN keys absent from AR', () => {
    expect(findOrphanKeys({ a: { x: '1' } }, { a: { x: '2', y: '3' } })).toEqual(['a.y']);
  });
  it('empty when EN ⊆ AR', () => {
    expect(findOrphanKeys({ a: { x: '1', y: '2' } }, { a: { x: '3' } })).toEqual([]);
  });
});
