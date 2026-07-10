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
