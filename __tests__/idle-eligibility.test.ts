import { describe, expect, it } from 'vitest';
import {
  selectIdleNudges,
  IDLE_DAILY_CAP_PER_AGENT,
  type IdleCandidate,
} from '@/lib/crm/idle-eligibility';

const lead = (over: Partial<IdleCandidate> = {}): IdleCandidate => ({
  leadId: 'sl_1',
  agentUsername: 'youssef',
  lastNudgedMs: null,
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
      lead({ leadId: `sl_y${i}`, agentUsername: 'youssef', lastNudgedMs: i }),
    ).concat(
      Array.from({ length: 25 }, (_, i) =>
        lead({ leadId: `sl_c${i}`, agentUsername: 'cosette', lastNudgedMs: i }),
      ),
    );
    const out = selectIdleNudges(many, 10);
    expect(out.filter((c) => c.agentUsername === 'youssef')).toHaveLength(10);
    expect(out.filter((c) => c.agentUsername === 'cosette')).toHaveLength(10);
  });

  it('puts never-nudged leads before any ever-nudged lead', () => {
    // Nothing is more overdue than "never". A lead nudged even a long time
    // ago has still had its turn; a never-nudged lead has not.
    const out = selectIdleNudges(
      [
        lead({ leadId: 'sl_nudged_long_ago', lastNudgedMs: 100 }),
        lead({ leadId: 'sl_never_nudged', lastNudgedMs: null }),
      ],
      2,
    );
    expect(out.map((c) => c.leadId)).toEqual(['sl_never_nudged', 'sl_nudged_long_ago']);
  });

  it('prefers the OLDER nudge over the newer one — rotation, not recency', () => {
    // Locked 2026-08-12: recency-of-touch is the bug. The cron writes its own
    // idle_warning as the newest activity, so "most recently touched" is
    // mostly "most recently nudged by us" (619 of 772 eligible leads, 80%,
    // measured live). Rotation gives every lead a turn instead of re-picking
    // the same ~70-lead pool forever.
    const out = selectIdleNudges(
      [
        lead({ leadId: 'sl_recent_nudge', lastNudgedMs: 900 }),
        lead({ leadId: 'sl_old_nudge', lastNudgedMs: 100 }),
        lead({ leadId: 'sl_mid_nudge', lastNudgedMs: 500 }),
      ],
      2,
    );
    expect(out.map((c) => c.leadId)).toEqual(['sl_old_nudge', 'sl_mid_nudge']);
  });

  it('is deterministic when two leads share a nudge timestamp', () => {
    // Same reasoning as the calls duplicate-key tiebreak: an unordered read
    // makes the daily list shuffle for no reason and makes bugs unreproducible.
    const a = lead({ leadId: 'sl_a', lastNudgedMs: 500 });
    const b = lead({ leadId: 'sl_b', lastNudgedMs: 500 });
    expect(selectIdleNudges([a, b], 1)).toEqual(selectIdleNudges([b, a], 1));
  });

  it('is deterministic when two leads are both never-nudged', () => {
    const a = lead({ leadId: 'sl_a', lastNudgedMs: null });
    const b = lead({ leadId: 'sl_b', lastNudgedMs: null });
    expect(selectIdleNudges([a, b], 1)).toEqual(selectIdleNudges([b, a], 1));
  });

  it('anti-starvation: with a cap of 1, the long-ago nudge wins over the recent one', () => {
    // This is the property the whole rewrite exists to guarantee: a lead
    // nudged 40 days ago must outrank one nudged 8 days ago, every time,
    // so the tail of the book eventually gets a turn instead of the same
    // handful of leads winning the cap forever.
    const recentlyNudged = lead({ leadId: 'sl_recent', lastNudgedMs: Date.now() - 8 * 86_400_000 });
    const longAgoNudged = lead({ leadId: 'sl_long_ago', lastNudgedMs: Date.now() - 40 * 86_400_000 });
    const out = selectIdleNudges([recentlyNudged, longAgoNudged], 1);
    expect(out.map((c) => c.leadId)).toEqual(['sl_long_ago']);
  });

  it('defaults to the agreed cap', () => {
    expect(IDLE_DAILY_CAP_PER_AGENT).toBe(10);
    const many = Array.from({ length: 40 }, (_, i) => lead({ leadId: `sl_${i}`, lastNudgedMs: i }));
    expect(selectIdleNudges(many)).toHaveLength(10);
  });

  it('returns an empty list for an empty input rather than throwing', () => {
    expect(selectIdleNudges([])).toEqual([]);
  });
});
