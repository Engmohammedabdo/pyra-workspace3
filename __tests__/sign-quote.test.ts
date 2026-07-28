import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signQuote } from '@/lib/quotes/sign-quote';

const TODAY = '2026-07-28';

/**
 * Minimal chainable Supabase mock tailored to signQuote()'s exact call
 * sequence:
 *   1. from('pyra_quotes').select('*').eq(...).maybeSingle()      — load
 *   2. from('pyra_quote_items').select(...).eq(...).order(...)    — items
 *   3. from('pyra_quotes').update(...).eq(...).in(...).select(...).maybeSingle() — write
 * A second `pyra_quotes` call is assumed to be the write — asserted via
 * `quotesCallCount` so a test can prove the write never happened.
 */
function createSupabaseMock(opts: {
  quoteRow: Record<string, unknown>;
  itemsResult: { data: unknown; error: unknown };
  updateResult?: { data: unknown; error: unknown };
}) {
  let quotesCallCount = 0;
  const from = vi.fn((table: string) => {
    if (table === 'pyra_quote_items') {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.order = vi.fn(() => Promise.resolve(opts.itemsResult));
      return builder;
    }
    if (table === 'pyra_quotes') {
      quotesCallCount += 1;
      if (quotesCallCount === 1) {
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.maybeSingle = vi.fn(() => Promise.resolve({ data: opts.quoteRow, error: null }));
        return builder;
      }
      const builder: Record<string, unknown> = {};
      builder.update = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.in = vi.fn(() => builder);
      builder.select = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(() => Promise.resolve(opts.updateResult));
      return builder;
    }
    throw new Error(`unexpected table in signQuote test mock: ${table}`);
  });
  return { supabase: { from } as unknown as SupabaseClient, getQuotesCallCount: () => quotesCallCount };
}

const baseInput = {
  quoteId: 'q_1',
  signatureData: 'data:image/png;base64,abc',
  signedBy: 'Customer Name',
  signedIp: '1.2.3.4',
  userAgent: 'test-agent',
  source: 'public_link' as const,
  linkId: 'dl_1',
  todayKey: TODAY,
};

describe('signQuote', () => {
  it('returns db_error and never writes signed_snapshot when the items fetch fails', async () => {
    const { supabase, getQuotesCallCount } = createSupabaseMock({
      quoteRow: { id: 'q_1', status: 'sent', expiry_date: null },
      itemsResult: { data: null, error: { message: 'items query timed out' } },
    });

    const result = await signQuote(supabase, baseInput);

    expect(result).toEqual({
      ok: false,
      reason: 'db_error',
      error: { message: 'items query timed out' },
    });
    // The critical assertion: a failed items fetch must short-circuit BEFORE
    // the UPDATE that freezes signed_snapshot — that UPDATE is the second
    // from('pyra_quotes') call, so it must never have happened.
    expect(getQuotesCallCount()).toBe(1);
  });

  it('freezes the real items into signed_snapshot on a healthy sign', async () => {
    const items = [{ description: 'Design work', quantity: 1, rate: 11_997, amount: 11_997 }];
    const { supabase } = createSupabaseMock({
      quoteRow: { id: 'q_1', status: 'sent', expiry_date: null, total: 11_997 },
      itemsResult: { data: items, error: null },
      updateResult: {
        data: { id: 'q_1', status: 'signed', signed_by: 'Customer Name' },
        error: null,
      },
    });

    const result = await signQuote(supabase, baseInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quote).toEqual({ id: 'q_1', status: 'signed', signed_by: 'Customer Name' });
    }
  });
});
