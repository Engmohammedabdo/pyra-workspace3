import { describe, it, expect } from 'vitest';
import {
  pickCampaignSender,
  startBurst,
  advancePacing,
  dubaiClock,
  isWithinSendWindow,
  windowFor,
  remainingQuota,
  buildSuppressionIndex,
  isSuppressed,
  renderTemplate,
  pickVariant,
  DEFAULT_SEND_WINDOWS,
  WORK_DAYS,
  GAP_MIN_MS,
  GAP_MAX_MS,
  BREAK_MIN_MS,
  BURST_MIN,
  BURST_MAX,
  type CampaignInstanceLike,
} from '@/lib/whatsapp/campaign-policy';

const INSTANCES: CampaignInstanceLike[] = [
  { instance_name: 'pyraai', status: 'connected', api_key: 'k-pyraai', is_notification_line: true },
  { instance_name: 'selver', status: 'connected', api_key: null, is_notification_line: false },
  { instance_name: 'yellow', status: 'connected', api_key: 'k-yellow', is_notification_line: false },
  { instance_name: 'dormant', status: 'disconnected', api_key: 'k-d', is_notification_line: false },
];

describe('pickCampaignSender', () => {
  it('returns the designated line when it is usable', () => {
    const choice = pickCampaignSender(INSTANCES, 'yellow');
    expect(choice.ok).toBe(true);
    if (choice.ok) expect(choice.instance.api_key).toBe('k-yellow');
  });

  it('NEVER falls back when no line is designated', () => {
    for (const missing of [null, undefined, '', '   ']) {
      const choice = pickCampaignSender(INSTANCES, missing);
      expect(choice).toEqual({ ok: false, reason: 'no_line_designated' });
    }
  });

  it('refuses the notification line even when it is connected and keyed', () => {
    // The regression this whole module exists to prevent: the old route fell
    // back to the literal string 'pyraai'.
    expect(pickCampaignSender(INSTANCES, 'pyraai')).toEqual({
      ok: false,
      reason: 'notification_line',
    });
  });

  it('reports notification_line ahead of connectivity so the reason is honest', () => {
    const offline: CampaignInstanceLike[] = [
      { instance_name: 'pyraai', status: 'close', api_key: 'k', is_notification_line: true },
    ];
    expect(pickCampaignSender(offline, 'pyraai')).toEqual({
      ok: false,
      reason: 'notification_line',
    });
  });

  it('allows the notification line only behind the explicit opt-in', () => {
    const choice = pickCampaignSender(INSTANCES, 'pyraai', { allowNotificationLine: true });
    expect(choice.ok).toBe(true);
  });

  it('rejects an unknown line, a disconnected line and a keyless line', () => {
    expect(pickCampaignSender(INSTANCES, 'ghost').ok).toBe(false);
    expect(pickCampaignSender(INSTANCES, 'ghost')).toEqual({ ok: false, reason: 'unknown_line' });
    expect(pickCampaignSender(INSTANCES, 'dormant')).toEqual({ ok: false, reason: 'not_connected' });
    // selver's api_key is NULL in production — the global key 401s for it.
    expect(pickCampaignSender(INSTANCES, 'selver')).toEqual({
      ok: false,
      reason: 'missing_api_key',
    });
  });

  it('treats a whitespace-only api_key as missing', () => {
    const blank: CampaignInstanceLike[] = [
      { instance_name: 'x', status: 'connected', api_key: '   ', is_notification_line: false },
    ];
    expect(pickCampaignSender(blank, 'x')).toEqual({ ok: false, reason: 'missing_api_key' });
  });
});

describe('pacing', () => {
  it('starts a burst inside the configured length range', () => {
    expect(startBurst(() => 0).burstSize).toBe(BURST_MIN);
    expect(startBurst(() => 0.999).burstSize).toBe(BURST_MAX);
    expect(startBurst(() => 0.5).sentInBurst).toBe(0);
  });

  it('uses a short randomised gap inside a burst', () => {
    const { delayMs, state } = advancePacing({ sentInBurst: 0, burstSize: 10 }, () => 0.5);
    expect(delayMs).toBeGreaterThanOrEqual(GAP_MIN_MS);
    expect(delayMs).toBeLessThan(GAP_MAX_MS);
    expect(state.sentInBurst).toBe(1);
    expect(state.burstSize).toBe(10);
  });

  it('takes a multi-minute break at the end of a burst and re-rolls the next one', () => {
    const { delayMs, state } = advancePacing({ sentInBurst: 6, burstSize: 7 }, () => 0.5);
    expect(delayMs).toBeGreaterThanOrEqual(BREAK_MIN_MS);
    expect(state.sentInBurst).toBe(0);
    expect(state.burstSize).toBeGreaterThanOrEqual(BURST_MIN);
  });

  it('never emits the same fixed interval twice for different draws', () => {
    const a = advancePacing({ sentInBurst: 0, burstSize: 10 }, () => 0.1).delayMs;
    const b = advancePacing({ sentInBurst: 0, burstSize: 10 }, () => 0.9).delayMs;
    expect(a).not.toBe(b);
  });
});

describe('send window', () => {
  // 2026-09-03 is a Thursday. 06:00 UTC = 10:00 Dubai.
  const thu10Dubai = new Date('2026-09-03T06:00:00Z');

  it('converts a UTC instant to Dubai weekday and minute-of-day', () => {
    expect(dubaiClock(thu10Dubai)).toEqual({ weekday: 4, minuteOfDay: 600 });
  });

  it('rolls the Dubai date forward past UTC midnight', () => {
    // 2026-09-03T21:00Z is Friday 01:00 in Dubai — a non-working day.
    expect(dubaiClock(new Date('2026-09-03T21:00:00Z')).weekday).toBe(5);
  });

  it('accepts a time inside the shared window on a working day', () => {
    expect(isWithinSendWindow(thu10Dubai, DEFAULT_SEND_WINDOWS.pyraai)).toBe(true);
    expect(isWithinSendWindow(thu10Dubai, DEFAULT_SEND_WINDOWS.yellow)).toBe(true);
    // 08:00 Dubai is before the working day starts.
    expect(isWithinSendWindow(new Date('2026-09-03T04:00:00Z'), DEFAULT_SEND_WINDOWS.pyraai)).toBe(false);
  });

  it('treats the window end as exclusive', () => {
    // 14:00 UTC = 18:00 Dubai — exactly the window end, so already closed.
    expect(isWithinSendWindow(new Date('2026-09-03T14:00:00Z'), DEFAULT_SEND_WINDOWS.yellow)).toBe(false);
    // One minute earlier is still inside.
    expect(isWithinSendWindow(new Date('2026-09-03T13:59:00Z'), DEFAULT_SEND_WINDOWS.yellow)).toBe(true);
  });

  it('works Friday and Saturday — Pyramedia is Mon-Sat, not the Gulf Sun-Thu week', () => {
    const fri10 = new Date('2026-09-04T06:00:00Z'); // Friday 10:00 Dubai
    const sat10 = new Date('2026-09-05T06:00:00Z'); // Saturday 10:00 Dubai
    expect(dubaiClock(fri10).weekday).toBe(5);
    expect(dubaiClock(sat10).weekday).toBe(6);
    expect(isWithinSendWindow(fri10, DEFAULT_SEND_WINDOWS.pyraai)).toBe(true);
    expect(isWithinSendWindow(sat10, DEFAULT_SEND_WINDOWS.pyraai)).toBe(true);
  });

  it("sends nothing on SUNDAY, the company's only weekend day", () => {
    const sun10 = new Date('2026-09-06T06:00:00Z'); // Sunday 10:00 Dubai
    expect(dubaiClock(sun10).weekday).toBe(0);
    expect(isWithinSendWindow(sun10, DEFAULT_SEND_WINDOWS.pyraai)).toBe(false);
  });

  it('matches the company work-week constant exactly', () => {
    expect([...WORK_DAYS].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('every line shares the working day so the three run in parallel', () => {
    // Owner decision 2026-09-04: the staggered slots were replaced by one
    // shared window. Per-line safety is carried by daily_cap, the suppression
    // list and randomised pacing — not by keeping the numbers apart in time.
    const spans = Object.values(DEFAULT_SEND_WINDOWS);
    expect(spans.length).toBeGreaterThanOrEqual(3);
    for (const s of spans) {
      expect(s.startMinute).toBe(9 * 60);
      expect(s.endMinute).toBe(18 * 60);
    }
  });

  it('all three lines are open at the same instant', () => {
    // 09:00 UTC = 13:00 Dubai on a Friday, a Pyramedia working day.
    const fridayNoon = new Date('2026-09-04T09:00:00Z');
    expect(dubaiClock(fridayNoon)).toEqual({ weekday: 5, minuteOfDay: 780 });
    for (const line of ['pyraai', 'selver', 'yellow']) {
      expect(isWithinSendWindow(fridayNoon, DEFAULT_SEND_WINDOWS[line])).toBe(true);
    }
  });

  it('returns null for a line with no configured window', () => {
    expect(windowFor('yellow')).toEqual(DEFAULT_SEND_WINDOWS.yellow);
    expect(windowFor('unconfigured')).toBeNull();
  });
});

describe('remainingQuota', () => {
  it('counts down and floors at zero', () => {
    expect(remainingQuota(40, 0)).toBe(40);
    expect(remainingQuota(40, 39)).toBe(1);
    expect(remainingQuota(40, 40)).toBe(0);
    expect(remainingQuota(40, 95)).toBe(0);
  });
  it('treats a missing or nonsense cap as stop', () => {
    expect(remainingQuota(0, 0)).toBe(0);
    expect(remainingQuota(-5, 0)).toBe(0);
    expect(remainingQuota(Number.NaN, 0)).toBe(0);
  });
});

describe('suppression', () => {
  const index = buildSuppressionIndex(['+971 50 123 4567', '0509998877', null, '']);

  it('matches across written formats', () => {
    expect(isSuppressed(index, '0501234567')).toBe(true);
    expect(isSuppressed(index, '00971509998877')).toBe(true);
  });
  it('lets an unlisted number through', () => {
    expect(isSuppressed(index, '0561112233')).toBe(false);
  });
  it('fails CLOSED on an unusable number', () => {
    expect(isSuppressed(index, '')).toBe(true);
    expect(isSuppressed(index, null)).toBe(true);
  });
});

describe('renderTemplate', () => {
  it('fills placeholders case-insensitively and with padding', () => {
    expect(renderTemplate('مرحباً {{name}} من {{ Company }}', { name: 'سالم', company: 'زيا' }))
      .toBe('مرحباً سالم من زيا');
  });

  it('does not leave punctuation stranded when a value is empty', () => {
    // The merge-failure tell: "أهلاً ، معك" advertises itself as a mail merge.
    expect(renderTemplate('أهلاً {{name}}، معك يوسف', { name: '' })).toBe('أهلاً، معك يوسف');
    expect(renderTemplate('Hi {{name}}, this is Youssef', { name: null }))
      .toBe('Hi, this is Youssef');
  });

  it('collapses runaway whitespace and blank lines', () => {
    expect(renderTemplate('a  b\n\n\n\nc', {})).toBe('a b\n\nc');
  });

  it('leaves an unknown placeholder untouched rather than blanking it', () => {
    expect(renderTemplate('x {{unknown}} y', { name: 'n' })).toBe('x {{unknown}} y');
  });
});

describe('pickVariant', () => {
  it('is stable for the same seed, so a retry re-sends the same text', () => {
    const variants = ['a', 'b', 'c'];
    const first = pickVariant(variants, '971501234567');
    expect(pickVariant(variants, '971501234567')).toBe(first);
  });
  it('spreads different seeds across the available wordings', () => {
    const variants = ['a', 'b', 'c'];
    const seen = new Set(
      Array.from({ length: 60 }, (_, i) => pickVariant(variants, `9715012345${i}`)),
    );
    expect(seen.size).toBeGreaterThan(1);
  });
  it('handles the empty and single-variant cases', () => {
    expect(pickVariant([], 'x')).toBe('');
    expect(pickVariant(['only'], 'x')).toBe('only');
  });
});
