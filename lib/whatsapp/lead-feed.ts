import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';

/**
 * Whether a WhatsApp message should write a lead touch (timeline activity +
 * last_contact_at bump). Ownership-gated like calls (fails closed on null
 * assignee); deduped by message; every WhatsApp message is a real contact
 * (no call-style "attempt" split), so both directions qualify.
 *
 * For an INBOUND message the customer authored, creditAgent may be null; the
 * touch is still real when the lead has an owner, and is credited to that owner.
 */
export function shouldWriteLeadTouch(input: {
  leadId: string | null;
  leadAssignedTo: string | null;
  creditAgent: string | null;
  alreadyLogged: boolean;
  inbound?: boolean;
}): boolean {
  if (!input.leadId || input.alreadyLogged || !input.leadAssignedTo) return false;
  if (input.inbound) return true; // customer touch on an owned lead
  return input.creditAgent === input.leadAssignedTo; // outbound: only the owner's own reach-out
}

/**
 * Insert the timeline activity + bump last_contact_at, together. Fire-and-
 * forget (best-effort): the caller loop must never let a failure here stop
 * the WhatsApp pull.
 *
 * Mirrors app/api/mobile/calls/sync/route.ts's pyra_lead_activities write:
 * `id` prefix `la`, `description: null` (the timeline UI derives its title
 * from activity_type + metadata via i18n — LEAD_ACTIVITY_TYPE_LABELS /
 * messages/{ar,en}/statuses.json `leadActivity.whatsapp_inbound` /
 * `whatsapp_outbound` already carry the exact same text, so a hardcoded
 * Arabic `description` here would only duplicate the title and freeze it in
 * Arabic even for an EN-locale reader).
 */
export async function writeWhatsAppLeadTouch(
  supabase: SupabaseClient,
  args: {
    leadId: string;
    creditAgent: string; // lead owner
    direction: 'incoming' | 'outgoing';
    messageId: string;
    at: string; // ISO
  },
): Promise<void> {
  const activityType = args.direction === 'incoming' ? 'whatsapp_inbound' : 'whatsapp_outbound';
  const { error: actErr } = await supabase.from('pyra_lead_activities').insert({
    id: generateId('la'),
    lead_id: args.leadId,
    activity_type: activityType,
    description: null,
    metadata: {
      direction: args.direction,
      auto: true,
      source: 'whatsapp_sync',
      message_id: args.messageId,
      at: args.at,
    },
    created_by: args.creditAgent,
    created_at: args.at,
  });
  if (actErr) {
    console.error('[wa-lead-feed] activity insert failed:', actErr.message);
    return;
  }
  const { error: bumpErr } = await supabase
    .from('pyra_sales_leads')
    .update({ last_contact_at: args.at })
    .eq('id', args.leadId);
  if (bumpErr) console.error('[wa-lead-feed] last_contact_at bump failed:', bumpErr.message);
}
