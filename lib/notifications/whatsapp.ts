import type { SupabaseClient } from '@supabase/supabase-js';
import { evolutionClient } from '@/lib/evolution/client';

/**
 * Send a WhatsApp text to an internal USER (employee/agent) via their
 * pyra_agent_whatsapp_settings routing row (Phase 11 Refinement model:
 * one shared connected instance can serve many recipients).
 *
 * Two-step lookup (locked contract):
 *   1. settings row (is_active=true) → (sender_instance_name, recipient_phone)
 *   2. pyra_whatsapp_instances → the configured instance must be 'connected'
 *
 * Graceful degradation: never throws, returns false on any skip/failure —
 * callers ALWAYS do the in-app notify() regardless of this result.
 */
export async function sendWhatsAppToUser(
  supabase: SupabaseClient,
  username: string,
  text: string,
): Promise<boolean> {
  try {
    const { data: setting } = await supabase
      .from('pyra_agent_whatsapp_settings')
      .select('sender_instance_name, recipient_phone')
      .eq('agent_username', username)
      .eq('is_active', true)
      .maybeSingle();
    if (!setting?.sender_instance_name || !setting?.recipient_phone) return false;

    const { data: instance } = await supabase
      .from('pyra_whatsapp_instances')
      .select('instance_name')
      .eq('instance_name', setting.sender_instance_name)
      .eq('status', 'connected')
      .maybeSingle();
    if (!instance) {
      console.warn('[sendWhatsAppToUser] instance not connected:', setting.sender_instance_name);
      return false;
    }

    const digits = setting.recipient_phone.replace(/\D/g, '');
    if (digits.length < 7) return false;

    await evolutionClient.sendText(setting.sender_instance_name, { number: digits, text });
    return true;
  } catch (err) {
    console.error('[sendWhatsAppToUser] failed for', username, err);
    return false;
  }
}

/** Production URL for links embedded in WhatsApp message bodies. */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || 'https://workspace.pyramedia.cloud';
