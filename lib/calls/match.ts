import { phoneMatchKey } from '@/lib/utils/phone';

export interface LeadPhoneRef { id: string; name: string }

/** Build key→lead index. First lead wins on duplicate keys (stable). */
export function buildLeadPhoneIndex(
  leads: Array<{ id: string; name: string; phone: string | null }>,
): Map<string, LeadPhoneRef> {
  const index = new Map<string, LeadPhoneRef>();
  for (const lead of leads) {
    const key = phoneMatchKey(lead.phone);
    if (!key || index.has(key)) continue;
    index.set(key, { id: lead.id, name: lead.name });
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
