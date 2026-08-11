/**
 * T-02 — pure request parsing for `POST /api/mobile/calls/sync`.
 *
 * ## The failure this exists to end
 *
 * The old parser returned null — a 422 for the WHOLE batch — the moment ANY
 * single row failed validation. That is a permanent poison pill, not a
 * transient error: the device's cursor only advances on a 2xx
 * (`SyncPlanner.nextCursor`), so one unparseable call-log row froze that
 * handset's sync FOREVER. Every later call piles up behind it, unseen, and the
 * rep's phone looks like it is working.
 *
 * And the row does not have to be exotic. The payload is built from the SIM
 * call log, where a withheld/private number can surface with a blank number
 * field — enough to fail the `phone` check and take the batch down with it.
 *
 * ## Why dropping the row is the right answer, and safe
 *
 * A row that cannot be parsed can never be persisted, so re-sending it forever
 * costs the rep everything and gains nothing. Dropping it lets the cursor move
 * past. Three things make that safe rather than lossy-by-accident:
 *
 *  - `nextCursor` advances to `batchMaxId` regardless of whether every call got
 *    a result, so an omitted row does not strand the cursor.
 *  - The caller LOGS every drop, so a silent data hole becomes a visible one.
 *  - It must NEVER be reported back as `status: 'error'`. That is the one status
 *    `SyncPlanner` treats as "nothing was persisted, do not advance" — using it
 *    here would rebuild the exact freeze this removes, just one layer down.
 *
 * The envelope itself is still fatal: a non-array, an empty array, or one over
 * MAX_BATCH means the request is malformed rather than the data, and the device
 * should hear about that as a 422.
 */

export const MAX_BATCH = 100;
const DIRECTIONS = new Set(['outgoing', 'incoming', 'missed']);

export interface IncomingCall {
  device_call_key: string;
  phone: string;
  direction: 'outgoing' | 'incoming' | 'missed';
  duration_seconds: number;
  called_at: string;
}

export interface DroppedCall {
  /** Index in the incoming array — the only stable handle for a row whose own key may be the invalid part. */
  index: number;
  /** Present only when it was a usable string; deliberately not invented. */
  device_call_key: string | null;
  reason: string;
}

export interface ParsedCallsBatch {
  calls: IncomingCall[];
  dropped: DroppedCall[];
}

/**
 * @returns `null` when the ENVELOPE is unusable (422 territory); otherwise the
 *   valid calls plus a record of every row dropped. An all-invalid batch
 *   returns `{ calls: [], dropped: [...] }` — NOT null — so the device still
 *   gets a 2xx and its cursor clears rows that can never be stored.
 */
export function parseCallsBatch(raw: unknown): ParsedCallsBatch | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BATCH) return null;

  const calls: IncomingCall[] = [];
  const dropped: DroppedCall[] = [];
  const seen = new Set<string>();

  raw.forEach((item, index) => {
    const drop = (reason: string, key: string | null = null) =>
      dropped.push({ index, device_call_key: key, reason });

    if (typeof item !== 'object' || item === null) return drop('not an object');
    const c = item as Record<string, unknown>;

    if (typeof c.device_call_key !== 'string' || !c.device_call_key.trim()) {
      return drop('device_call_key missing or blank');
    }
    const key = c.device_call_key.trim();

    // Duplicates WITHIN one batch: the first wins. Without this the route would
    // insert the same key twice in one pass and trip the unique index, failing a
    // row that was otherwise perfectly valid.
    if (seen.has(key)) return drop('duplicate device_call_key within the batch', key);

    if (typeof c.phone !== 'string' || !c.phone.trim()) return drop('phone missing or blank', key);
    if (typeof c.direction !== 'string' || !DIRECTIONS.has(c.direction)) {
      return drop(`direction not one of outgoing/incoming/missed`, key);
    }
    const dur = Number(c.duration_seconds);
    if (!Number.isFinite(dur) || dur < 0) return drop('duration_seconds not a finite number >= 0', key);
    if (typeof c.called_at !== 'string' || Number.isNaN(Date.parse(c.called_at))) {
      return drop('called_at not a parseable timestamp', key);
    }

    seen.add(key);
    calls.push({
      device_call_key: key,
      phone: c.phone.trim(),
      direction: c.direction as IncomingCall['direction'],
      duration_seconds: Math.round(dur),
      called_at: c.called_at,
    });
  });

  return { calls, dropped };
}
