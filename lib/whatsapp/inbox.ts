// Pure prioritization helpers for the chat inbox redesign — no React, no
// Supabase, no I/O. Consumed by the conversations list (needs-reply vs rest
// split), the waiting badge, and the message-thread merge. Every function
// here is deterministic given its inputs so it is trivially unit-testable
// and safe to call from both the client store and (later) a server route.

/** A conversation is "late" once the customer has waited this many minutes. */
export const LATE_THRESHOLD_MINUTES = 120;

export interface InboxConversationLike {
  id: string;
  status: string;
  last_customer_message_at: string | null;
  last_agent_message_at: string | null;
  last_message_at: string | null;
}

/**
 * True when this conversation is waiting on OUR reply: open, the customer
 * has messaged at all, and either the agent never replied or the customer's
 * last message is newer than the agent's last reply.
 */
export function needsReply(c: InboxConversationLike): boolean {
  if (c.status !== 'open') return false;
  if (!c.last_customer_message_at) return false;
  if (!c.last_agent_message_at) return true;
  return Date.parse(c.last_customer_message_at) > Date.parse(c.last_agent_message_at);
}

/** Minutes the customer has been waiting; null when the conversation is not needs-reply. */
export function waitingMinutes(c: InboxConversationLike, nowMs: number): number | null {
  if (!needsReply(c)) return null;
  // needsReply guarantees last_customer_message_at is present.
  const customerAtMs = Date.parse(c.last_customer_message_at as string);
  return Math.floor((nowMs - customerAtMs) / 60_000);
}

/** 'late' once the wait reaches LATE_THRESHOLD_MINUTES, otherwise 'ok'. */
export function waitingSeverity(mins: number): 'ok' | 'late' {
  return mins >= LATE_THRESHOLD_MINUTES ? 'late' : 'ok';
}

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

function toArabicIndicDigits(n: number): string {
  return String(n)
    .split('')
    .map((ch) => (ch >= '0' && ch <= '9' ? ARABIC_INDIC_DIGITS[Number(ch)] : ch))
    .join('');
}

/**
 * Arabic label ladder for a waiting duration: minutes under an hour ('د'),
 * hours under a day ('س'), days beyond that ('ي'). Each tier floors rather
 * than rounds, matching the approved mockup (45 -> '٤٥د', 180 -> '٣س',
 * 2900 -> '٢ي').
 */
export function formatWaiting(mins: number): string {
  if (mins < MINUTES_PER_HOUR) return `${toArabicIndicDigits(mins)}د`;
  if (mins < MINUTES_PER_DAY) return `${toArabicIndicDigits(Math.floor(mins / MINUTES_PER_HOUR))}س`;
  return `${toArabicIndicDigits(Math.floor(mins / MINUTES_PER_DAY))}ي`;
}

function parseOrZero(value: string | null): number {
  return value ? Date.parse(value) : 0;
}

/**
 * Splits the inbox into conversations that need our reply (oldest customer
 * message first — the longest-waiting customer surfaces at the top) and
 * everything else (most recently active first).
 */
export function splitInbox<T extends InboxConversationLike>(
  list: T[],
  // Reserved for callers pairing this split with waitingMinutes/waitingSeverity
  // for the same "now" — the split/sort rule itself is time-independent.
  nowMs: number,
): { needs: T[]; rest: T[] } {
  const needs: T[] = [];
  const rest: T[] = [];
  for (const c of list) {
    if (needsReply(c)) needs.push(c);
    else rest.push(c);
  }
  needs.sort(
    (a, b) =>
      Date.parse(a.last_customer_message_at as string) - Date.parse(b.last_customer_message_at as string),
  );
  rest.sort((a, b) => parseOrZero(b.last_message_at) - parseOrZero(a.last_message_at));
  return { needs, rest };
}

export interface ThreadEvent {
  kind: 'message' | 'call';
  at: number;
  item: unknown;
}

/**
 * Merges chat messages with call activities (call_logged/call_attempt) into
 * one ascending timeline. Messages are placed before calls in the source
 * array so that Array#sort's stability keeps a message ahead of a call on
 * an exact timestamp tie — deterministic, not an artifact of input order.
 */
export function mergeThread(
  messages: Array<{ timestamp: string }>,
  calls: Array<{ created_at: string; activity_type: string }>,
): ThreadEvent[] {
  const messageEvents: ThreadEvent[] = messages.map((m) => ({
    kind: 'message',
    at: Date.parse(m.timestamp),
    item: m,
  }));
  const callEvents: ThreadEvent[] = calls.map((call) => ({
    kind: 'call',
    at: Date.parse(call.created_at),
    item: call,
  }));
  return [...messageEvents, ...callEvents].sort((a, b) => a.at - b.at);
}
