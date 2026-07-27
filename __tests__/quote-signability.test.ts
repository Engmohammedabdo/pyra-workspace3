import { describe, it, expect } from 'vitest';
import { canSignQuote } from '@/lib/quotes/signability';

const TODAY = '2026-07-27';

describe('canSignQuote', () => {
  it('allows a sent quote', () => {
    expect(canSignQuote({ status: 'sent', expiry_date: null }, TODAY)).toEqual({ ok: true });
  });

  it('allows a viewed quote', () => {
    expect(canSignQuote({ status: 'viewed', expiry_date: null }, TODAY)).toEqual({ ok: true });
  });

  it('reports already_signed for a signed quote', () => {
    expect(canSignQuote({ status: 'signed', expiry_date: null }, TODAY)).toEqual({
      ok: false,
      reason: 'already_signed',
    });
  });

  it('reports already_signed for an invoiced quote', () => {
    expect(canSignQuote({ status: 'invoiced', expiry_date: null }, TODAY)).toEqual({
      ok: false,
      reason: 'already_signed',
    });
  });

  it.each(['draft', 'pending_approval', 'rejected', 'expired', 'cancelled'])(
    'blocks status %s as wrong_status',
    (status) => {
      expect(canSignQuote({ status, expiry_date: null }, TODAY)).toEqual({
        ok: false,
        reason: 'wrong_status',
      });
    },
  );

  it('still allows signing on the expiry date itself', () => {
    expect(canSignQuote({ status: 'sent', expiry_date: TODAY }, TODAY)).toEqual({ ok: true });
  });

  it('blocks the day after expiry', () => {
    expect(canSignQuote({ status: 'sent', expiry_date: '2026-07-26' }, TODAY)).toEqual({
      ok: false,
      reason: 'quote_expired',
    });
  });

  it('checks status before expiry so a signed expired quote reads as signed', () => {
    expect(canSignQuote({ status: 'signed', expiry_date: '2020-01-01' }, TODAY)).toEqual({
      ok: false,
      reason: 'already_signed',
    });
  });
});
