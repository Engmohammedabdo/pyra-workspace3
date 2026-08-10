import { describe, it, expect } from 'vitest';
import { shouldRecordCorrectedReason } from '@/lib/crm/mark-not-interested';

/**
 * B-14. `markNotInterested` short-circuits a lead already sitting in
 * «غير مهتم» with no write at all, which is what makes a retry safe — and is
 * also how a rep's CORRECTED reason vanished without trace.
 *
 * Both halves are load-bearing and they pull in opposite directions, so this
 * predicate is the only place that decides: a genuine retry must stay silent,
 * a real correction must be recorded.
 */
describe('shouldRecordCorrectedReason', () => {
  it('records a genuinely different reason', () => {
    expect(shouldRecordCorrectedReason('too expensive', 'budget approved next quarter')).toBe(true);
  });

  it('stays silent on an identical resend — this is what keeps retries idempotent', () => {
    expect(shouldRecordCorrectedReason('too expensive', 'too expensive')).toBe(false);
  });

  it('treats whitespace-only differences as the same reason', () => {
    // A phone that re-sends with a trailing newline has not corrected anything;
    // writing a timeline row for that would be the doubling the short-circuit
    // exists to prevent.
    expect(shouldRecordCorrectedReason('too expensive', '  too expensive  ')).toBe(false);
    expect(shouldRecordCorrectedReason('too expensive', 'too expensive\n')).toBe(false);
  });

  it('records the first reason when the lead somehow has none stored', () => {
    // Reachable: a lead moved to the stage through the web before lost_reason
    // was being written, or moved by a bulk action.
    expect(shouldRecordCorrectedReason(null, 'not hiring this year')).toBe(true);
    expect(shouldRecordCorrectedReason('', 'not hiring this year')).toBe(true);
    expect(shouldRecordCorrectedReason('   ', 'not hiring this year')).toBe(true);
  });

  it('never records an empty incoming reason', () => {
    // Nothing to preserve, and it must not erase what is already there.
    expect(shouldRecordCorrectedReason('too expensive', '')).toBe(false);
    expect(shouldRecordCorrectedReason('too expensive', '   ')).toBe(false);
    expect(shouldRecordCorrectedReason(null, '')).toBe(false);
  });

  it('is case- and diacritic-sensitive, deliberately', () => {
    // These are human-written Arabic/English notes, not identifiers. Two
    // spellings are two different things a rep typed, and picking a winner by
    // normalising would silently discard one of them.
    expect(shouldRecordCorrectedReason('Too Expensive', 'too expensive')).toBe(true);
    expect(shouldRecordCorrectedReason('غالي', 'غالي جدا')).toBe(true);
  });
});
