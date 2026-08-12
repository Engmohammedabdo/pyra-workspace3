import { describe, expect, it } from 'vitest';
import {
  selectIdleNudges,
  IDLE_DAILY_CAP_PER_AGENT,
  type IdleCandidate,
} from '@/lib/crm/idle-eligibility';

const lead = (over: Partial<IdleCandidate> = {}): IdleCandidate => ({
  leadId: 'sl_1',
  agentUsername: 'youssef',
  lastTouchedMs: 1_000,
  hasConnectedCall: true,
  ...over,
});

describe('selectIdleNudges', () => {
  it('drops leads nobody has ever actually spoken to', () => {
    // Measured 2026-08-12: the old rule warned on 1,189 of 1,258 leads — 95% of
    // the book — so the nudge meant nothing. A lead that never answered is not
    // "going cold"; it was never warm.
    const out = selectIdleNudges([
      lead({ leadId: 'sl_spoke', hasConnectedCall: true }),
      lead({ leadId: 'sl_never', hasConnectedCall: false }),
    ]);
    expect(out.map((c) => c.leadId)).toEqual(['sl_spoke']);
  });

  it('caps each agent independently', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      lead({ leadId: `sl_y${i}`, agentUsername: 'youssef', lastTouchedMs: i }),
    ).concat(
      Array.from({ length: 25 }, (_, i) =>
        lead({ leadId: `sl_c${i}`, agentUsername: 'cosette', lastTouchedMs: i }),
      ),
    );
    const out = selectIdleNudges(many, 10);
    expect(out.filter((c) => c.agentUsername === 'youssef')).toHaveLength(10);
    expect(out.filter((c) => c.agentUsername === 'cosette')).toHaveLength(10);
  });

  it('prefers the MOST recently spoken-to lead, not the oldest', () => {
    // A conversation 8 days ago is recoverable; one from 90 days ago is a
    // different job. Sorting oldest-first would fill the daily cap with the
    // least recoverable leads in the book, every single day.
    const out = selectIdleNudges(
      [
        lead({ leadId: 'sl_ancient', lastTouchedMs: 100 }),
        lead({ leadId: 'sl_recent', lastTouchedMs: 900 }),
        lead({ leadId: 'sl_mid', lastTouchedMs: 500 }),
      ],
      2,
    );
    expect(out.map((c) => c.leadId)).toEqual(['sl_recent', 'sl_mid']);
  });

  it('is deterministic when two leads share a timestamp', () => {
    // Same reasoning as the calls duplicate-key tiebreak: an unordered read
    // makes the daily list shuffle for no reason and makes bugs unreproducible.
    const a = lead({ leadId: 'sl_a', lastTouchedMs: 500 });
    const b = lead({ leadId: 'sl_b', lastTouchedMs: 500 });
    expect(selectIdleNudges([a, b], 1)).toEqual(selectIdleNudges([b, a], 1));
  });

  it('defaults to the agreed cap', () => {
    expect(IDLE_DAILY_CAP_PER_AGENT).toBe(10);
    const many = Array.from({ length: 40 }, (_, i) => lead({ leadId: `sl_${i}`, lastTouchedMs: i }));
    expect(selectIdleNudges(many)).toHaveLength(10);
  });

  it('returns an empty list for an empty input rather than throwing', () => {
    expect(selectIdleNudges([])).toEqual([]);
  });
});
