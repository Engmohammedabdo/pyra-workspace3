import { phoneMatchKey } from '@/lib/utils/phone';
import { buildLeadPhoneIndex, matchLeadByPhone } from '@/lib/calls/match';

/**
 * "Is this walk-in already someone we know?" — by phone.
 *
 * WHY PHONE AND NOT EMAIL: measured against live data on 2026-07-31, all 1,125
 * leads in the pipeline have a phone number and only 101 have an email. Matching
 * a walk-in on email would find almost nobody; the phone is what actually
 * identifies a lead in this business.
 *
 * The lead side deliberately delegates to `matchLeadByPhone` from
 * lib/calls/match.ts rather than re-deriving a key. CLAUDE.md calls that the ONE
 * contact predicate, and a second, subtly different phone-matching rule living
 * here is precisely how "the app says it's the same person and the CRM says it
 * isn't" starts.
 */

/**
 * Below this many digits a "match" is meaningless — the operator is still
 * mid-typing, and a 2-digit key would happily collide with anything. Mirrors
 * the floor `whatsAppHref` already applies before it will build a wa.me link.
 */
export const MIN_MATCH_DIGITS = 7;

export interface ClientPhoneRow {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
}

export interface LeadPhoneRow {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  stage_id: string | null;
  assigned_to: string | null;
  client_id: string | null;
  created_at: string;
  is_converted: boolean | null;
}

/** True when `phone` carries enough digits to be worth matching on at all. */
export function isMatchablePhone(phone: string | null | undefined): boolean {
  return phoneMatchKey(phone, 32).length >= MIN_MATCH_DIGITS;
}

/**
 * `pyra_clients.phone` is free text with no normalisation, so this compares
 * derived keys rather than raw strings. A client row with a blank/short phone
 * can never match: its key is empty or too short, and an empty key would
 * otherwise match every empty input.
 */
export function matchClientByPhone<T extends { phone: string | null }>(
  clients: T[],
  phone: string,
): T | null {
  if (!isMatchablePhone(phone)) return null;
  const key = phoneMatchKey(phone);
  if (!key) return null;
  return clients.find((c) => isMatchablePhone(c.phone) && phoneMatchKey(c.phone) === key) ?? null;
}

/**
 * The full lead row behind a phone match.
 *
 * `matchLeadByPhone` only returns `{ id, name, assigned_to }`, but the dialog
 * has to show the stage and whether the lead already has a client. Looking the
 * id back up in the same array keeps the shared predicate — including its
 * "first lead wins on duplicate keys" tie-break — as the single authority for
 * WHICH lead matched.
 */
export function matchLeadRowByPhone<T extends LeadPhoneRow>(
  leads: T[],
  phone: string,
): T | null {
  if (!isMatchablePhone(phone)) return null;
  const ref = matchLeadByPhone(buildLeadPhoneIndex(leads), phone);
  if (!ref) return null;
  return leads.find((l) => l.id === ref.id) ?? null;
}
