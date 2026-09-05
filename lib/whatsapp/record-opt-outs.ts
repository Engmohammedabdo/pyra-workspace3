// Persist opt-outs detected in inbound WhatsApp replies.
//
// Split from lib/whatsapp/opt-out.ts so the detection stays pure and unit
// tested; this file is the thin I/O half, called from BOTH inbound paths
// (the webhook and the pull). Hooking only one would leave an opt-out
// silently unhonoured depending on which transport delivered the reply.
//
// Writing the suppression row is sufficient on its own: startCampaignRun
// loads the whole suppression list before every batch and marks matching
// contacts 'skipped', so pending rows need no separate update here.

import { createServiceRoleClient } from '@/lib/supabase/server';
import { phoneMatchKey } from '@/lib/utils/phone';
import { collectOptOutPhones, type InboundReplyLike } from '@/lib/whatsapp/opt-out';

type Supa = ReturnType<typeof createServiceRoleClient>;

/**
 * Suppress every phone in this batch that asked us to stop.
 *
 * Best-effort by contract: never throws. It runs inside message-ingestion
 * paths whose job is to persist the conversation — an opt-out bookkeeping
 * failure must not cost us the message itself.
 *
 * Returns how many phones were newly suppressed (0 when already present).
 */
export async function recordOptOuts(
  supabase: Supa,
  messages: InboundReplyLike[],
): Promise<number> {
  try {
    const phones = collectOptOutPhones(messages);
    if (phones.length === 0) return 0;

    const rows = phones
      .map((raw) => ({ key: phoneMatchKey(raw), raw }))
      .filter((r) => r.key)
      .map((r) => ({
        phone_key: r.key,
        phone_raw: r.raw,
        reason: 'opted_out',
        created_by: 'whatsapp_reply',
      }));

    if (rows.length === 0) return 0;

    // The list is global across lines — someone who declined on one number
    // declined for the company. Existing rows win (a manual disqualification
    // keeps its own reason).
    const { error } = await supabase
      .from('pyra_whatsapp_suppressions')
      .upsert(rows, { onConflict: 'phone_key', ignoreDuplicates: true });

    if (error) {
      console.error('[opt-out] suppression insert failed:', error.message);
      return 0;
    }
    return rows.length;
  } catch (err) {
    console.error('[opt-out] unexpected failure:', err);
    return 0;
  }
}
