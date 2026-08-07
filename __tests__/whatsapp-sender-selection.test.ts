import { describe, expect, it } from 'vitest';
import { pickSenderInstance } from '@/lib/notifications/whatsapp';

/**
 * Regression lock — the 2026-08-06 production-notification outage.
 *
 * `sendWhatsAppToUser` used to pick its sender with
 * `ORDER BY last_connected_at DESC NULLS LAST LIMIT 1`. Registering a second
 * WhatsApp line for the sales inbox (`selver`, 2026-08-06 16:01) therefore
 * hijacked EVERY internal notification: the company line `pyraai` carried
 * `last_connected_at = NULL`, so any newly-registered line outranked it. The
 * app's Evolution key is not authorized for that line, every send 401'd, and
 * the helper's own graceful-degradation contract swallowed the failure — the
 * outage was completely silent for 19+ hours.
 *
 * The fix is an EXPLICIT designation. These tests exist so nobody restores
 * recency as the primary rule.
 */
describe('pickSenderInstance', () => {
  it('returns null when there is no connected instance', () => {
    expect(pickSenderInstance([])).toBeNull();
  });

  it('returns the only candidate', () => {
    const picked = pickSenderInstance([
      { instance_name: 'pyraai', last_connected_at: null },
    ]);

    expect(picked?.instance_name).toBe('pyraai');
  });

  it('prefers the designated notification line over a newer line', () => {
    // THE regression. `selver` was registered later and carries the newer
    // timestamp — recency alone would pick it, exactly as it did in prod.
    const picked = pickSenderInstance([
      { instance_name: 'selver', last_connected_at: '2026-08-06T16:01:29Z', is_notification_line: false },
      { instance_name: 'pyraai', last_connected_at: null, is_notification_line: true },
    ]);

    expect(picked?.instance_name).toBe('pyraai');
  });

  it('keeps the designated line even when another line connected more recently', () => {
    const picked = pickSenderInstance([
      { instance_name: 'newline', last_connected_at: '2026-09-01T00:00:00Z' },
      { instance_name: 'pyraai', last_connected_at: '2026-08-07T09:00:00Z', is_notification_line: true },
    ]);

    expect(picked?.instance_name).toBe('pyraai');
  });

  it('falls back to recency when no line is designated', () => {
    // Designation is opt-in: a database that predates the migration, or one
    // where the flag was cleared, must still send rather than go silent.
    const picked = pickSenderInstance([
      { instance_name: 'older', last_connected_at: '2026-08-01T00:00:00Z' },
      { instance_name: 'newer', last_connected_at: '2026-08-06T00:00:00Z' },
    ]);

    expect(picked?.instance_name).toBe('newer');
  });

  it('sorts a null last_connected_at last, never ahead of a real timestamp', () => {
    const picked = pickSenderInstance([
      { instance_name: 'never-connected', last_connected_at: null },
      { instance_name: 'connected-once', last_connected_at: '2026-01-01T00:00:00Z' },
    ]);

    expect(picked?.instance_name).toBe('connected-once');
  });

  it('is deterministic when every candidate has a null timestamp', () => {
    // The old SQL ordering left this case to Postgres' whim — two NULLs under
    // `DESC NULLS LAST` is an unordered tie, so the sender could change
    // between calls. Ties break on instance_name so the choice is stable.
    const rows = [
      { instance_name: 'bravo', last_connected_at: null },
      { instance_name: 'alpha', last_connected_at: null },
    ];

    expect(pickSenderInstance(rows)?.instance_name).toBe('alpha');
    expect(pickSenderInstance([...rows].reverse())?.instance_name).toBe('alpha');
  });

  it('is deterministic when two lines share the same timestamp', () => {
    const rows = [
      { instance_name: 'delta', last_connected_at: '2026-08-06T16:01:29Z' },
      { instance_name: 'charlie', last_connected_at: '2026-08-06T16:01:29Z' },
    ];

    expect(pickSenderInstance(rows)?.instance_name).toBe('charlie');
    expect(pickSenderInstance([...rows].reverse())?.instance_name).toBe('charlie');
  });

  it('is deterministic if more than one line is somehow designated', () => {
    // The partial unique index in migration 058 makes this unreachable through
    // normal writes, but the picker must not depend on that to stay stable.
    // Designation narrows the pool; the ordinary recency-then-name rule then
    // applies inside it, so `zulu` wins on its timestamp either way round.
    const rows = [
      { instance_name: 'zulu', is_notification_line: true, last_connected_at: '2026-09-09T00:00:00Z' },
      { instance_name: 'kilo', is_notification_line: true, last_connected_at: null },
    ];

    expect(pickSenderInstance(rows)?.instance_name).toBe('zulu');
    expect(pickSenderInstance([...rows].reverse())?.instance_name).toBe('zulu');
  });

  it('never picks an undesignated line just because it connected more recently', () => {
    // Guards the pool-narrowing itself: designation must be applied BEFORE
    // recency, not as a tiebreak after it.
    const picked = pickSenderInstance([
      { instance_name: 'sales-line', is_notification_line: false, last_connected_at: '2027-01-01T00:00:00Z' },
      { instance_name: 'notify-line', is_notification_line: true, last_connected_at: '2020-01-01T00:00:00Z' },
    ]);

    expect(picked?.instance_name).toBe('notify-line');
  });

  it('carries the per-instance api_key through to the caller', () => {
    // A line registered on Evolution with its own token cannot be driven with
    // another line's key — the picker must surface the key alongside the name.
    const picked = pickSenderInstance([
      { instance_name: 'pyraai', api_key: 'instance-scoped-token', is_notification_line: true },
    ]);

    expect(picked?.api_key).toBe('instance-scoped-token');
  });

  it('does not mutate the caller’s array', () => {
    const rows = [
      { instance_name: 'bravo', last_connected_at: '2026-08-01T00:00:00Z' },
      { instance_name: 'alpha', last_connected_at: '2026-08-09T00:00:00Z' },
    ];
    const snapshot = rows.map((r) => r.instance_name);

    pickSenderInstance(rows);

    expect(rows.map((r) => r.instance_name)).toEqual(snapshot);
  });
});
