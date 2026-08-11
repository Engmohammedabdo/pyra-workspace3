import { describe, it, expect } from 'vitest';
import {
  LATE_THRESHOLD_MINUTES,
  needsReply,
  waitingMinutes,
  waitingSeverity,
  formatWaiting,
  splitInbox,
  mergeThread,
  type InboxConversationLike,
} from '@/lib/whatsapp/inbox';

function conv(overrides: Partial<InboxConversationLike> = {}): InboxConversationLike {
  return {
    id: 'c_1',
    status: 'open',
    last_customer_message_at: null,
    last_agent_message_at: null,
    last_message_at: null,
    ...overrides,
  };
}

describe('LATE_THRESHOLD_MINUTES', () => {
  it('is 120', () => {
    expect(LATE_THRESHOLD_MINUTES).toBe(120);
  });
});

describe('needsReply', () => {
  it('is true when open and customer message is after the agent reply', () => {
    const c = conv({
      status: 'open',
      last_customer_message_at: '2026-08-06T10:05:00Z',
      last_agent_message_at: '2026-08-06T10:00:00Z',
    });
    expect(needsReply(c)).toBe(true);
  });

  it('is false when the agent replied after the customer', () => {
    const c = conv({
      status: 'open',
      last_customer_message_at: '2026-08-06T10:00:00Z',
      last_agent_message_at: '2026-08-06T10:05:00Z',
    });
    expect(needsReply(c)).toBe(false);
  });

  it('is false when the conversation is resolved, even if customer waited last', () => {
    const c = conv({
      status: 'resolved',
      last_customer_message_at: '2026-08-06T10:05:00Z',
      last_agent_message_at: '2026-08-06T10:00:00Z',
    });
    expect(needsReply(c)).toBe(false);
  });

  it('is true when there is a customer message and the agent never replied (null)', () => {
    const c = conv({
      status: 'open',
      last_customer_message_at: '2026-08-06T10:05:00Z',
      last_agent_message_at: null,
    });
    expect(needsReply(c)).toBe(true);
  });

  it('is false when there is no customer message at all', () => {
    const c = conv({
      status: 'open',
      last_customer_message_at: null,
      last_agent_message_at: null,
    });
    expect(needsReply(c)).toBe(false);
  });
});

describe('waitingMinutes', () => {
  it('returns the elapsed minutes since the customer message when needs-reply', () => {
    const c = conv({
      status: 'open',
      last_customer_message_at: '2026-08-06T10:00:00Z',
      last_agent_message_at: null,
    });
    const nowMs = new Date('2026-08-06T10:45:00Z').getTime();
    expect(waitingMinutes(c, nowMs)).toBe(45);
  });

  it('returns null when the conversation does not need a reply', () => {
    const c = conv({
      status: 'resolved',
      last_customer_message_at: '2026-08-06T10:00:00Z',
      last_agent_message_at: null,
    });
    const nowMs = new Date('2026-08-06T10:45:00Z').getTime();
    expect(waitingMinutes(c, nowMs)).toBeNull();
  });

  it('returns null when the agent already replied after the customer', () => {
    const c = conv({
      status: 'open',
      last_customer_message_at: '2026-08-06T10:00:00Z',
      last_agent_message_at: '2026-08-06T10:10:00Z',
    });
    const nowMs = new Date('2026-08-06T10:45:00Z').getTime();
    expect(waitingMinutes(c, nowMs)).toBeNull();
  });
});

describe('waitingSeverity', () => {
  it('is "ok" below the late threshold', () => {
    expect(waitingSeverity(119)).toBe('ok');
  });

  it('is "late" exactly at the 120-minute boundary', () => {
    expect(waitingSeverity(120)).toBe('late');
  });

  it('is "late" above the threshold', () => {
    expect(waitingSeverity(121)).toBe('late');
  });
});

describe('formatWaiting', () => {
  it('renders minutes under an hour with Arabic-Indic digits + د', () => {
    expect(formatWaiting(45)).toBe('٤٥د');
  });

  it('renders hours (>=60 min, <24h) with Arabic-Indic digits + س', () => {
    expect(formatWaiting(180)).toBe('٣س');
  });

  it('renders days (>=24h) with Arabic-Indic digits + ي', () => {
    expect(formatWaiting(2900)).toBe('٢ي');
  });

  it('floors partial hours/days rather than rounding', () => {
    // 119 minutes -> under 120 (2h), still reports 1 full hour
    expect(formatWaiting(119)).toBe('١س');
  });
});

describe('splitInbox', () => {
  it('puts needs-reply conversations first, ordered by OLDEST customer message first', () => {
    const older = conv({
      id: 'needs_older',
      status: 'open',
      last_customer_message_at: '2026-08-06T09:00:00Z',
      last_agent_message_at: null,
    });
    const newer = conv({
      id: 'needs_newer',
      status: 'open',
      last_customer_message_at: '2026-08-06T11:00:00Z',
      last_agent_message_at: null,
    });
    const { needs } = splitInbox([newer, older]);
    expect(needs.map((c) => c.id)).toEqual(['needs_older', 'needs_newer']);
  });

  it('puts everything else in rest, ordered by last_message_at DESC', () => {
    const resolvedOld = conv({
      id: 'rest_old',
      status: 'resolved',
      last_message_at: '2026-08-06T08:00:00Z',
    });
    const resolvedNew = conv({
      id: 'rest_new',
      status: 'resolved',
      last_message_at: '2026-08-06T10:00:00Z',
    });
    const { rest } = splitInbox([resolvedOld, resolvedNew]);
    expect(rest.map((c) => c.id)).toEqual(['rest_new', 'rest_old']);
  });

  it('separates needs vs rest correctly on a mixed list', () => {
    const needsOne = conv({
      id: 'needs_1',
      status: 'open',
      last_customer_message_at: '2026-08-06T09:00:00Z',
      last_agent_message_at: null,
    });
    const restOne = conv({
      id: 'rest_1',
      status: 'open',
      last_customer_message_at: '2026-08-06T09:00:00Z',
      last_agent_message_at: '2026-08-06T09:30:00Z',
      last_message_at: '2026-08-06T09:30:00Z',
    });
    const { needs, rest } = splitInbox([needsOne, restOne]);
    expect(needs.map((c) => c.id)).toEqual(['needs_1']);
    expect(rest.map((c) => c.id)).toEqual(['rest_1']);
  });

  it('returns empty needs/rest arrays for an empty list', () => {
    expect(splitInbox([])).toEqual({ needs: [], rest: [] });
  });
});

describe('mergeThread', () => {
  it('interleaves messages and calls sorted ascending by time', () => {
    const messages = [
      { timestamp: '2026-08-06T10:00:00Z' },
      { timestamp: '2026-08-06T10:10:00Z' },
    ];
    const calls = [
      { created_at: '2026-08-06T10:05:00Z', activity_type: 'call_logged' },
    ];
    const merged = mergeThread(messages, calls);
    expect(merged.map((e) => e.kind)).toEqual(['message', 'call', 'message']);
    expect(merged.map((e) => e.at)).toEqual([
      new Date('2026-08-06T10:00:00Z').getTime(),
      new Date('2026-08-06T10:05:00Z').getTime(),
      new Date('2026-08-06T10:10:00Z').getTime(),
    ]);
  });

  it('passes messages through unchanged, sorted, when calls is empty', () => {
    const messages = [
      { timestamp: '2026-08-06T10:10:00Z' },
      { timestamp: '2026-08-06T10:00:00Z' },
    ];
    const merged = mergeThread(messages, []);
    expect(merged.map((e) => e.kind)).toEqual(['message', 'message']);
    expect(merged.map((e) => e.at)).toEqual([
      new Date('2026-08-06T10:00:00Z').getTime(),
      new Date('2026-08-06T10:10:00Z').getTime(),
    ]);
  });

  it('on an exact timestamp tie, a message comes before a call (stable, deterministic)', () => {
    const tie = '2026-08-06T10:00:00Z';
    const messages = [{ timestamp: tie }];
    const calls = [{ created_at: tie, activity_type: 'call_attempt' }];
    const merged = mergeThread(messages, calls);
    expect(merged.map((e) => e.kind)).toEqual(['message', 'call']);
  });
});
