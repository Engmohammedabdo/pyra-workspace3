import { describe, it, expect } from 'vitest';
import { quoteContentHash } from '@/lib/quotes/content-hash';
import { toPublicQuotePayload } from '@/lib/quotes/public-payload';

const base = () =>
  toPublicQuotePayload(
    { id: 'qt_1', quote_number: 'QT-1', total: 100, currency: 'AED', tax_rate: 0 },
    [{ description: 'A', quantity: 1, rate: 100, amount: 100 }],
  );

describe('quoteContentHash', () => {
  it('is stable for identical content', () => {
    expect(quoteContentHash(base())).toBe(quoteContentHash(base()));
  });

  it('returns a 64-char hex digest', () => {
    expect(quoteContentHash(base())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when a line rate changes', () => {
    const changed = base();
    changed.items = [{ description: 'A', quantity: 1, rate: 150, amount: 150 }];
    expect(quoteContentHash(changed)).not.toBe(quoteContentHash(base()));
  });

  it('changes when the total changes', () => {
    const changed = base();
    (changed as Record<string, unknown>).total = 200;
    expect(quoteContentHash(changed)).not.toBe(quoteContentHash(base()));
  });

  it('ignores the signature fields, which move without the price moving', () => {
    const signed = base();
    (signed as Record<string, unknown>).signed_at = '2026-07-27T00:00:00.000Z';
    (signed as Record<string, unknown>).signed_by = 'Majed';
    expect(quoteContentHash(signed)).toBe(quoteContentHash(base()));
  });

  it('ignores status, which flips sent -> viewed on the first open', () => {
    const viewed = base();
    (viewed as Record<string, unknown>).status = 'viewed';
    expect(quoteContentHash(viewed)).toBe(quoteContentHash(base()));
  });
});
