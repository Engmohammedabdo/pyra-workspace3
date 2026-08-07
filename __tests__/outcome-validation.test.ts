import { describe, it, expect } from 'vitest';
import { validateOutcomeRequest, REASON_MAX_LENGTH } from '@/lib/mobile/outcome-validation';

const base = { lead_id: 'sl_abc', outcome: 'interested' };

describe('validateOutcomeRequest', () => {
  it('accepts a minimal valid body', () => {
    const r = validateOutcomeRequest(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.leadId).toBe('sl_abc');
      expect(r.value.outcome).toBe('interested');
      expect(r.value.note).toBe('');
      expect(r.value.nextFollowUpAtIso).toBeNull();
      expect(r.value.notInterestedReason).toBeNull();
      expect(r.value.completeFollowUpId).toBeNull();
    }
  });

  it('rejects a missing lead_id', () => {
    expect(validateOutcomeRequest({ outcome: 'interested' }).ok).toBe(false);
  });

  it('rejects an unknown outcome', () => {
    expect(validateOutcomeRequest({ ...base, outcome: 'maybe' }).ok).toBe(false);
  });

  it('rejects a note over 2000 chars', () => {
    expect(validateOutcomeRequest({ ...base, note: 'x'.repeat(2001) }).ok).toBe(false);
  });

  // --- the not_interested reason rules ---

  it('REQUIRES a reason when outcome is not_interested', () => {
    const r = validateOutcomeRequest({ ...base, outcome: 'not_interested' });
    expect(r.ok).toBe(false);
  });

  it('rejects a reason shorter than 5 characters', () => {
    const r = validateOutcomeRequest({
      ...base, outcome: 'not_interested', not_interested_reason: 'غالي',
    });
    expect(r.ok).toBe(false);
  });

  it('accepts a 5-character reason', () => {
    const r = validateOutcomeRequest({
      ...base, outcome: 'not_interested', not_interested_reason: '12345',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.notInterestedReason).toBe('12345');
  });

  it('trims the reason before measuring it', () => {
    const r = validateOutcomeRequest({
      ...base, outcome: 'not_interested', not_interested_reason: '   12   ',
    });
    expect(r.ok).toBe(false);
  });

  it('accepts a reason exactly at REASON_MAX_LENGTH', () => {
    const r = validateOutcomeRequest({
      ...base, outcome: 'not_interested', not_interested_reason: 'x'.repeat(REASON_MAX_LENGTH),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.notInterestedReason?.length).toBe(REASON_MAX_LENGTH);
  });

  it('rejects a reason one character over REASON_MAX_LENGTH', () => {
    const r = validateOutcomeRequest({
      ...base, outcome: 'not_interested', not_interested_reason: 'x'.repeat(REASON_MAX_LENGTH + 1),
    });
    expect(r.ok).toBe(false);
  });

  // Rejected, NOT silently ignored: a client that sends a reason with the
  // wrong outcome has a bug, and swallowing it would hide it.
  it('REJECTS a reason sent with any other outcome', () => {
    const r = validateOutcomeRequest({
      ...base, outcome: 'call_again', not_interested_reason: 'مش مهتم خالص',
    });
    expect(r.ok).toBe(false);
  });

  // --- follow-up fields ---

  it('rejects an unparseable next_follow_up_at', () => {
    expect(validateOutcomeRequest({ ...base, next_follow_up_at: 'soon' }).ok).toBe(false);
  });

  it('normalises next_follow_up_at to ISO', () => {
    const r = validateOutcomeRequest({ ...base, next_follow_up_at: '2026-08-10T06:00:00Z' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.nextFollowUpAtIso).toBe('2026-08-10T06:00:00.000Z');
  });

  it('passes complete_follow_up_id through trimmed', () => {
    const r = validateOutcomeRequest({ ...base, complete_follow_up_id: ' fu_1 ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.completeFollowUpId).toBe('fu_1');
  });

  it('treats a blank complete_follow_up_id as absent', () => {
    const r = validateOutcomeRequest({ ...base, complete_follow_up_id: '   ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.completeFollowUpId).toBeNull();
  });

  it('rejects a non-object body', () => {
    expect(validateOutcomeRequest(null).ok).toBe(false);
  });
});
