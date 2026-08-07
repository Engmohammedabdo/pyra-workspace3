import { describe, it, expect } from 'vitest';
import { buildLeadPhoneIndex, matchLeadByPhone, isOwnedByAgent } from '@/lib/calls/match';

describe('lead phone matching', () => {
  const index = buildLeadPhoneIndex([
    { id: 'sl_1', name: 'Ahmed', phone: '+971 50 123 4567' },
    { id: 'sl_2', name: 'Sara', phone: '0509998877' },
    { id: 'sl_3', name: 'NoPhone', phone: null },
  ]);

  it('matches international vs local formats via 9-digit key', () => {
    expect(matchLeadByPhone(index, '0501234567')?.id).toBe('sl_1');
    expect(matchLeadByPhone(index, '00971509998877')?.id).toBe('sl_2');
  });
  it('returns null for unknown numbers and empty input', () => {
    expect(matchLeadByPhone(index, '0561112233')).toBeNull();
    expect(matchLeadByPhone(index, '')).toBeNull();
  });
  it('first lead wins on duplicate phone keys', () => {
    const dup = buildLeadPhoneIndex([
      { id: 'sl_a', name: 'A', phone: '0501234567' },
      { id: 'sl_b', name: 'B', phone: '+971501234567' },
    ]);
    expect(matchLeadByPhone(dup, '0501234567')?.id).toBe('sl_a');
  });
});

// Duplicate lead CARDS for one business on one number are real (18 phone keys
// in prod carry >1 lead row). Once `owned` gates timeline writes, letting a
// colleague's duplicate win an arbitrary tie erases the caller's own real
// conversations — the measured production case (youssef's own prospect losing
// to cosette's duplicate on 025836444, 14 of 25 cross-agent calls).
describe('buildLeadPhoneIndex — duplicate-key ownership tiebreak', () => {
  const mine = { id: 'sl_mine', name: 'Milestones Coffee Abu Dhabi Mall', phone: '025836444', assigned_to: 'youssef' };
  // Same 9-digit key as `mine`, keyed in with spaces — how the duplicate card
  // actually looks. (A `+971 2 …` landline would NOT collide: phoneMatchKey
  // takes the last 9 digits, so the country code shifts a 9-digit landline.)
  const theirs = { id: 'sl_theirs', name: 'milestones coffee', phone: '02 583 6444', assigned_to: 'cosette' };

  it("prefers the caller's own lead when it comes FIRST in the array", () => {
    const index = buildLeadPhoneIndex([mine, theirs], 'youssef');
    expect(matchLeadByPhone(index, '025836444')?.id).toBe('sl_mine');
  });

  // THE INVERSION CASE. PostgREST row order is arbitrary, so the preferred
  // lead arrives second roughly half the time — and this is precisely the path
  // the original `if (!key || index.has(key)) continue;` short-circuits. A
  // suite that only covered preferred-FIRST would pass against an
  // implementation where the tiebreak does nothing at all.
  it("prefers the caller's own lead when it comes SECOND in the array", () => {
    const index = buildLeadPhoneIndex([theirs, mine], 'youssef');
    expect(matchLeadByPhone(index, '025836444')?.id).toBe('sl_mine');
    expect(matchLeadByPhone(index, '025836444')?.assigned_to).toBe('youssef');
  });

  it('does not let a second owned lead displace the first owned one', () => {
    const alsoMine = { id: 'sl_mine2', name: 'dup', phone: '025836444', assigned_to: 'youssef' };
    const index = buildLeadPhoneIndex([mine, alsoMine, theirs], 'youssef');
    expect(matchLeadByPhone(index, '025836444')?.id).toBe('sl_mine');
  });

  it('no preference → plain first-match-wins, unchanged', () => {
    expect(matchLeadByPhone(buildLeadPhoneIndex([theirs, mine]), '025836444')?.id).toBe('sl_theirs');
    expect(matchLeadByPhone(buildLeadPhoneIndex([theirs, mine], null), '025836444')?.id).toBe('sl_theirs');
    expect(matchLeadByPhone(buildLeadPhoneIndex([theirs, mine], undefined), '025836444')?.id).toBe('sl_theirs');
  });

  it('a preference matching nobody leaves the index unchanged', () => {
    const index = buildLeadPhoneIndex([theirs, mine], 'someone.else');
    expect(matchLeadByPhone(index, '025836444')?.id).toBe('sl_theirs');
  });

  it('never treats a null/absent assigned_to as owned, for any preference', () => {
    const orphan = { id: 'sl_orphan', name: 'orphan', phone: '025836444', assigned_to: null };
    const noField = { id: 'sl_nofield', name: 'no field', phone: '025836444' };
    // an unassigned newcomer must not displace an incumbent…
    expect(matchLeadByPhone(buildLeadPhoneIndex([theirs, orphan], 'youssef'), '025836444')?.id).toBe('sl_theirs');
    expect(matchLeadByPhone(buildLeadPhoneIndex([theirs, noField], 'youssef'), '025836444')?.id).toBe('sl_theirs');
    // …and must not be "protected" as owned when the real owner arrives second.
    expect(matchLeadByPhone(buildLeadPhoneIndex([orphan, mine], 'youssef'), '025836444')?.id).toBe('sl_mine');
    // a null preference must never match a null assigned_to
    expect(matchLeadByPhone(buildLeadPhoneIndex([theirs, orphan], null), '025836444')?.id).toBe('sl_theirs');
  });

  it('still skips phone-less leads and keeps unrelated keys independent', () => {
    const index = buildLeadPhoneIndex(
      [{ id: 'sl_np', name: 'NoPhone', phone: null, assigned_to: 'youssef' }, theirs, mine],
      'youssef',
    );
    expect(index.size).toBe(1);
    expect(matchLeadByPhone(index, '025836444')?.id).toBe('sl_mine');
  });
});

// The write gate in /api/mobile/calls/sync. Both timeline writes and the
// last_contact_at bump hang off this predicate, so it is the security
// boundary — it must stay byte-identical to the 403 gate in
// /api/mobile/call-outcome, including failing CLOSED on an unassigned lead.
describe('isOwnedByAgent — the calls/sync write gate', () => {
  it('is true only when assigned_to equals the calling agent', () => {
    expect(isOwnedByAgent({ assigned_to: 'youssef' }, 'youssef')).toBe(true);
    expect(isOwnedByAgent({ assigned_to: 'cosette' }, 'youssef')).toBe(false);
  });
  it('fails closed on an unassigned lead and on no lead at all', () => {
    expect(isOwnedByAgent({ assigned_to: null }, 'youssef')).toBe(false);
    expect(isOwnedByAgent(null, 'youssef')).toBe(false);
  });
  it('is case- and whitespace-sensitive (no fuzzy username matching)', () => {
    expect(isOwnedByAgent({ assigned_to: 'Youssef' }, 'youssef')).toBe(false);
    expect(isOwnedByAgent({ assigned_to: 'youssef ' }, 'youssef')).toBe(false);
  });
});
