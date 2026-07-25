import { phoneMatchKey } from '@/lib/utils/phone';

// `assigned_to` is optional on the INPUT row (existing callers like
// /api/mobile/leads never selected it and don't need ownership) but always
// present on the OUTPUT ref, defaulting to null — so a caller that DOES care
// about ownership (the calls/sync route, Gap-2 fix) never has to guess
// between "not selected" and "genuinely unassigned".
export interface LeadPhoneRef { id: string; name: string; assigned_to: string | null }

/** Build key→lead index. First lead wins on duplicate keys (stable). */
export function buildLeadPhoneIndex(
  leads: Array<{ id: string; name: string; phone: string | null; assigned_to?: string | null }>,
): Map<string, LeadPhoneRef> {
  const index = new Map<string, LeadPhoneRef>();
  for (const lead of leads) {
    const key = phoneMatchKey(lead.phone);
    if (!key || index.has(key)) continue;
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
