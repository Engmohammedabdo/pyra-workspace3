import { describe, it, expect } from 'vitest';
import { parseCallsBatch, MAX_BATCH } from '@/lib/mobile/parse-calls';

const good = {
  device_call_key: 'dev:1',
  phone: '025836444',
  direction: 'outgoing',
  duration_seconds: 60,
  called_at: '2026-08-10T09:00:00.000Z',
};

describe('parseCallsBatch', () => {
  it('accepts a clean batch and normalises it', () => {
    const out = parseCallsBatch([{ ...good, phone: '  025836444  ', duration_seconds: 60.4 }]);
    expect(out?.dropped).toHaveLength(0);
    expect(out?.calls).toEqual([{ ...good, duration_seconds: 60 }]);
  });

  // ── the whole point of T-02 ────────────────────────────────────────────
  it('keeps the good rows when one row is unparseable', () => {
    // Before this, a single bad row 422'd the batch, and because the device
    // cursor only advances on a 2xx, that handset's sync froze permanently.
    const out = parseCallsBatch([
      good,
      { ...good, device_call_key: 'dev:2', phone: '' }, // withheld number → blank
      { ...good, device_call_key: 'dev:3' },
    ]);
    expect(out).not.toBeNull();
    expect(out!.calls.map((c) => c.device_call_key)).toEqual(['dev:1', 'dev:3']);
    expect(out!.dropped).toEqual([
      { index: 1, device_call_key: 'dev:2', reason: 'phone missing or blank' },
    ]);
  });

  it('returns an EMPTY batch rather than null when every row is bad', () => {
    // Must still be a 2xx: these rows can never be persisted, so re-sending
    // them forever is strictly worse than letting the cursor move past.
    const out = parseCallsBatch([{ ...good, phone: '' }, { nonsense: true }]);
    expect(out).not.toBeNull();
    expect(out!.calls).toHaveLength(0);
    expect(out!.dropped).toHaveLength(2);
  });

  it('reports the index even when the key itself is the invalid part', () => {
    const out = parseCallsBatch([{ ...good, device_call_key: '   ' }]);
    expect(out!.dropped[0]).toEqual({
      index: 0,
      device_call_key: null,
      reason: 'device_call_key missing or blank',
    });
  });

  // ── the envelope stays fatal ───────────────────────────────────────────
  it('rejects a malformed envelope, which is a client bug not bad data', () => {
    expect(parseCallsBatch(null)).toBeNull();
    expect(parseCallsBatch({})).toBeNull();
    expect(parseCallsBatch('calls')).toBeNull();
    expect(parseCallsBatch([])).toBeNull();
    expect(parseCallsBatch(new Array(MAX_BATCH + 1).fill(good))).toBeNull();
  });

  it('accepts exactly MAX_BATCH rows', () => {
    const batch = Array.from({ length: MAX_BATCH }, (_, i) => ({ ...good, device_call_key: `dev:${i}` }));
    expect(parseCallsBatch(batch)?.calls).toHaveLength(MAX_BATCH);
  });

  // ── per-field rules, each one a row that used to kill the batch ────────
  it('drops rows with an unknown direction', () => {
    const out = parseCallsBatch([{ ...good, direction: 'voicemail' }]);
    expect(out!.calls).toHaveLength(0);
    expect(out!.dropped[0].reason).toContain('direction');
  });

  it('drops rows with a negative or non-numeric duration', () => {
    expect(parseCallsBatch([{ ...good, duration_seconds: -1 }])!.dropped).toHaveLength(1);
    expect(parseCallsBatch([{ ...good, duration_seconds: 'long' }])!.dropped).toHaveLength(1);
    expect(parseCallsBatch([{ ...good, duration_seconds: Infinity }])!.dropped).toHaveLength(1);
    // 0 is VALID — an unanswered dial is a real, meaningful row.
    expect(parseCallsBatch([{ ...good, duration_seconds: 0 }])!.calls).toHaveLength(1);
  });

  it('drops rows whose called_at is not a real timestamp', () => {
    expect(parseCallsBatch([{ ...good, called_at: 'yesterday' }])!.dropped).toHaveLength(1);
    expect(parseCallsBatch([{ ...good, called_at: 12345 }])!.dropped).toHaveLength(1);
  });

  it('keeps only the first of a key duplicated inside one batch', () => {
    // Two rows with the same key in one pass would hit the unique index and
    // fail an otherwise valid insert.
    const out = parseCallsBatch([good, { ...good, duration_seconds: 99 }]);
    expect(out!.calls).toHaveLength(1);
    expect(out!.calls[0].duration_seconds).toBe(60);
    expect(out!.dropped[0].reason).toContain('duplicate');
  });
});
