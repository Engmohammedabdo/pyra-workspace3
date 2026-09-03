// Pure sending policy for WhatsApp broadcast campaigns — no React, no
// Supabase, no I/O, no clock of its own. Every function is deterministic
// given its inputs (randomness and "now" are injected) so the rules that keep
// a line alive are unit-testable instead of buried in a route handler.
//
// WHY THIS EXISTS (2026-09-03 — the campaign audit):
//   `campaigns/[id]/send` picked its sender with
//     .eq('status','connected').limit(1)   →  instances?.[0] ?? 'pyraai'
//   an UNORDERED read with a literal fallback to the notification line. That
//   is the same class of defect as the 2026-08-06 outage (migration 058): the
//   sender was an accident of row order. Here it is worse than a silent
//   failure — a broadcast to cold numbers from the notification line risks a
//   BAN on the one line every employee notification is sent from.
//
//   It also sent one message per second, forever, with a fixed delay, no
//   daily cap, no working-hours window and no opt-out list. A fixed interval
//   is the single clearest machine fingerprint a sender can emit.
//
// The doctrine these functions encode:
//   • The sending line is DESIGNATED, never guessed. No fallback, ever.
//   • The notification line is never a campaign sender.
//   • Gaps are randomised and interrupted by breaks — humans leave the desk.
//   • Nothing sends outside Dubai working hours, or on Fri/Sat.
//   • A per-line daily cap is enforced by the caller against this quota.
//   • One global suppression list, checked across every line.

import { phoneMatchKey } from '@/lib/utils/phone';

// ─── Sender selection ───────────────────────────────────────────────────────

export interface CampaignInstanceLike {
  instance_name: string;
  status: string;
  api_key: string | null;
  is_notification_line: boolean;
}

export type SenderRejection =
  | 'no_line_designated'
  | 'unknown_line'
  | 'notification_line'
  | 'not_connected'
  | 'missing_api_key';

export type SenderChoice =
  | { ok: true; instance: CampaignInstanceLike }
  | { ok: false; reason: SenderRejection };

/**
 * Resolve the line a campaign sends from.
 *
 * There is deliberately NO fallback: a campaign with no designated line is
 * refused rather than sent from whichever row the database returned first.
 * Refusing is cheap; sending 250 cold messages from the wrong number is not.
 *
 * The notification-line check runs BEFORE the connectivity and key checks so
 * the reason surfaced is always the real one — a disconnected notification
 * line must not be reported as merely "not connected", which reads like a
 * transient problem someone would then "fix" by reconnecting it.
 *
 * `allowNotificationLine` exists for a deliberate, reviewed exception only.
 * No route passes it today, and none should without an owner decision.
 */
export function pickCampaignSender(
  instances: CampaignInstanceLike[],
  requestedInstanceName: string | null | undefined,
  opts: { allowNotificationLine?: boolean } = {},
): SenderChoice {
  const requested = (requestedInstanceName ?? '').trim();
  if (!requested) return { ok: false, reason: 'no_line_designated' };

  const instance = instances.find((i) => i.instance_name === requested);
  if (!instance) return { ok: false, reason: 'unknown_line' };

  if (instance.is_notification_line && !opts.allowNotificationLine) {
    return { ok: false, reason: 'notification_line' };
  }
  if (instance.status !== 'connected') return { ok: false, reason: 'not_connected' };

  // Evolution tokens are instance-scoped — a line with no stored token can
  // only be sent through with the global key, which returns 401 for it.
  // Failing here beats discovering it 200 rows into a broadcast.
  if (!instance.api_key || !instance.api_key.trim()) {
    return { ok: false, reason: 'missing_api_key' };
  }

  return { ok: true, instance };
}

// ─── Pacing ─────────────────────────────────────────────────────────────────

/** Randomised gap between two consecutive messages. */
export const GAP_MIN_MS = 60_000;
export const GAP_MAX_MS = 180_000;

/** A burst is how many messages go out before the sender "leaves the desk". */
export const BURST_MIN = 7;
export const BURST_MAX = 12;

/** The break taken between bursts. */
export const BREAK_MIN_MS = 8 * 60_000;
export const BREAK_MAX_MS = 20 * 60_000;

export interface PacingState {
  /** Messages sent so far inside the current burst. */
  sentInBurst: number;
  /** How many this burst runs to before a long break. */
  burstSize: number;
}

/** Inclusive-low, exclusive-high pick from an injected [0,1) source. */
function pickBetween(min: number, max: number, rand: () => number): number {
  return Math.floor(min + rand() * (max - min));
}

/** A fresh burst with a randomised length. */
export function startBurst(rand: () => number): PacingState {
  return { sentInBurst: 0, burstSize: pickBetween(BURST_MIN, BURST_MAX + 1, rand) };
}

/**
 * Advance pacing after ONE message was sent: how long to wait before the
 * next, and the state to carry forward.
 *
 * Reaching the end of a burst yields a multi-minute break and a NEW burst
 * length — so neither the gap nor the rhythm of the gaps ever repeats.
 */
export function advancePacing(
  state: PacingState,
  rand: () => number,
): { delayMs: number; state: PacingState } {
  const sentInBurst = state.sentInBurst + 1;
  if (sentInBurst >= state.burstSize) {
    return {
      delayMs: pickBetween(BREAK_MIN_MS, BREAK_MAX_MS, rand),
      state: startBurst(rand),
    };
  }
  return {
    delayMs: pickBetween(GAP_MIN_MS, GAP_MAX_MS, rand),
    state: { sentInBurst, burstSize: state.burstSize },
  };
}

// ─── Working window ─────────────────────────────────────────────────────────

/** Dubai is UTC+4 year-round — no DST, so a fixed offset is exact. */
export const DUBAI_UTC_OFFSET_MINUTES = 240;

/** Sunday(0) … Thursday(4). Friday and Saturday send nothing at all. */
export const WORK_DAYS: readonly number[] = [0, 1, 2, 3, 4];

export interface SendWindow {
  /** Minutes from Dubai midnight. */
  startMinute: number;
  endMinute: number;
}

const hm = (h: number, m = 0) => h * 60 + m;

/**
 * Staggered per-line windows. Two lines sending in the same minute is a
 * server pattern; overlapping-but-offset windows are not.
 */
export const DEFAULT_SEND_WINDOWS: Record<string, SendWindow> = {
  pyraai: { startMinute: hm(9, 30), endMinute: hm(11, 30) },
  selver: { startMinute: hm(11, 30), endMinute: hm(14, 0) },
  yellow: { startMinute: hm(14, 30), endMinute: hm(17, 30) },
};

/** Dubai weekday + minute-of-day for a UTC instant. */
export function dubaiClock(now: Date): { weekday: number; minuteOfDay: number } {
  const shifted = new Date(now.getTime() + DUBAI_UTC_OFFSET_MINUTES * 60_000);
  return {
    weekday: shifted.getUTCDay(),
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** True only inside the line's window, on a working day. End is exclusive. */
export function isWithinSendWindow(now: Date, window: SendWindow): boolean {
  const { weekday, minuteOfDay } = dubaiClock(now);
  if (!WORK_DAYS.includes(weekday)) return false;
  return minuteOfDay >= window.startMinute && minuteOfDay < window.endMinute;
}

/** The window for a line, or null when the line has no configured window. */
export function windowFor(
  instanceName: string,
  windows: Record<string, SendWindow> = DEFAULT_SEND_WINDOWS,
): SendWindow | null {
  return windows[instanceName] ?? null;
}

// ─── Daily quota ────────────────────────────────────────────────────────────

/** Never negative — a cap lowered below today's sends means "stop", not "owe". */
export function remainingQuota(dailyCap: number, sentToday: number): number {
  if (!Number.isFinite(dailyCap) || dailyCap <= 0) return 0;
  return Math.max(0, Math.floor(dailyCap) - Math.max(0, Math.floor(sentToday)));
}

// ─── Suppression ────────────────────────────────────────────────────────────

/**
 * Build the lookup for "never message this number again", keyed the same way
 * every other phone comparison in the codebase is keyed. Suppression is
 * GLOBAL: someone who said "no" to one line has said no to the company.
 */
export function buildSuppressionIndex(phones: Array<string | null | undefined>): Set<string> {
  const set = new Set<string>();
  for (const p of phones) {
    const key = phoneMatchKey(p);
    if (key) set.add(key);
  }
  return set;
}

/** An unparseable number is treated as suppressed — we cannot prove consent. */
export function isSuppressed(index: Set<string>, phone: string | null | undefined): boolean {
  const key = phoneMatchKey(phone);
  if (!key) return true;
  return index.has(key);
}

// ─── Message rendering ──────────────────────────────────────────────────────

/**
 * Fill {{name}} / {{company}} / {{sector}} (case-insensitive).
 *
 * An empty value leaves punctuation stranded — "أهلاً {{name}}، معك" would
 * render as "أهلاً ، معك". Collapsing the leftover space before Arabic and
 * Latin commas is what keeps a merge-failure from advertising itself as a
 * mail-merge, which is exactly what gets a message reported.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | null | undefined>,
): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'gi'), (v ?? '').trim());
  }
  return out
    .replace(/[ \t]+([،,.؟?!])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Deterministically choose one of several wordings for a contact.
 *
 * Deterministic on purpose: a retry after a failure must re-send the SAME
 * text, and two lines must never send the same person two different versions
 * of "our first message".
 */
export function pickVariant(variants: string[], seed: string): string {
  if (variants.length === 0) return '';
  if (variants.length === 1) return variants[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return variants[Math.abs(hash) % variants.length];
}
