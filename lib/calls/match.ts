import { phoneMatchKey } from '@/lib/utils/phone';

// `assigned_to` is optional on the INPUT row (existing callers like
// /api/mobile/leads never selected it and don't need ownership) but always
// present on the OUTPUT ref, defaulting to null — so a caller that DOES care
// about ownership (the calls/sync route, Gap-2 fix) never has to guess
// between "not selected" and "genuinely unassigned".
export interface LeadPhoneRef { id: string; name: string; assigned_to: string | null }

/**
 * Build key→lead index. First lead wins on duplicate keys (stable).
 *
 * `preferAssignedTo` (optional) breaks a duplicate-key tie in favour of the
 * lead owned by that username. Duplicate lead CARDS for the same business on
 * the same number are real and common (18 phone keys in prod carry more than
 * one lead row), and plain first-match-wins over an UNORDERED PostgREST read
 * picked an arbitrary one of them. That is fine while the match is only used
 * to display a name, but it is NOT fine once ownership gates writes: the
 * caller's own lead row would lose the tie to a colleague's duplicate and a
 * real conversation with the caller's own prospect would be dropped on the
 * floor (measured: 14 of 25 cross-agent matched calls in prod were exactly
 * this, incl. 6 real conversations youssef had with his own prospect that
 * produced no notification, no outcome sheet and no follow-up attach).
 *
 * With `preferAssignedTo` omitted or null the behaviour is IDENTICAL to plain
 * first-match-wins — `owned` and `incumbentOwned` are both false, so the
 * `continue` fires for every already-present key, exactly as before.
 */
export function buildLeadPhoneIndex(
  leads: Array<{ id: string; name: string; phone: string | null; assigned_to?: string | null }>,
  preferAssignedTo?: string | null,
): Map<string, LeadPhoneRef> {
  const index = new Map<string, LeadPhoneRef>();
  for (const lead of leads) {
    const key = phoneMatchKey(lead.phone);
    if (!key) continue;
    const existing = index.get(key);
    if (existing) {
      // Keep the incumbent UNLESS the newcomer is the preferred owner's lead
      // and the incumbent is not. A lead with assigned_to null/absent never
      // counts as owned, for any preference value.
      const owned = preferAssignedTo != null && (lead.assigned_to ?? null) === preferAssignedTo;
      const incumbentOwned = preferAssignedTo != null && existing.assigned_to === preferAssignedTo;
      if (!owned || incumbentOwned) continue;
    }
    index.set(key, { id: lead.id, name: lead.name, assigned_to: lead.assigned_to ?? null });
  }
  return index;
}

export function matchLeadByPhone(
  index: Map<string, LeadPhoneRef>,
  rawPhone: string,
): LeadPhoneRef | null {
  const key = phoneMatchKey(rawPhone);
  if (!key) return null;
  return index.get(key) ?? null;
}

/**
 * A call counts as real CONTACT only when someone actually picked up.
 *
 * The original gate was `direction !== 'missed'`, which classified a
 * 0-second unanswered outgoing dial as contact — writing a `call_logged`
 * timeline row and stamping `last_contact_at`. That poisoned every
 * recency-driven signal (health score, deals-at-risk, lead-idle-check) and
 * produced 257 fake activities + 107 falsely-fresh leads before it was
 * caught. Duration is the only honest signal the Android CallLog gives us.
 */
export function isConnectedCall(call: {
  direction: string;
  duration_seconds: number;
}): boolean {
  return call.direction !== 'missed' && call.duration_seconds > 0;
}

/**
 * Does the calling agent OWN the matched lead? The gate that decides whether a
 * device-synced call may write onto a lead's timeline / bump its
 * last_contact_at.
 *
 * The body is deliberately byte-identical to the ownership gate in
 * `app/api/mobile/call-outcome/route.ts` (`lead.assigned_to !== agentUsername`
 * → 403) so the two can never drift on null-handling: a lead with
 * `assigned_to IS NULL` is NOT owned by anybody and therefore fails CLOSED
 * (0 of 1,245 phone-bearing leads in prod are unassigned, so this costs
 * nothing today and is the safe default if that ever changes).
 *
 * Extracted here — rather than inlined in the route — purely so the security
 * boundary is unit-testable without a Supabase harness.
 */
export function isOwnedByAgent(
  lead: { assigned_to: string | null } | null,
  agentUsername: string,
): boolean {
  return lead !== null && lead.assigned_to === agentUsername;
}
