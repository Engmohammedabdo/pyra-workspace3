import type { SupabaseClient } from '@supabase/supabase-js';
import { evolutionClient } from '@/lib/evolution/client';

/**
 * Send a WhatsApp text to an internal USER (employee/agent).
 *
 * Recipient resolution priority (2026-07-03, Abdou's call — "the number
 * already lives on the profile, don't make admins re-enter it"):
 *   1. Explicit routing row in pyra_agent_whatsapp_settings (is_active=true,
 *      instance connected) — the Phase 11 Refinement admin OVERRIDE for
 *      special cases (route to a number different from the profile).
 *   2. FALLBACK: pyra_users.phone (active user, international format) sent
 *      via the most-recently-connected instance (last_connected_at DESC —
 *      same recency heuristic as the Phase 11 Q-11-1 lock).
 *
 * The locked CRM follow-up-reminders cron keeps its own inline two-step
 * lookup and is NOT affected by this fallback.
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
    let instanceName: string | null = null;
    let phone: string | null = null;

    // 1. Explicit admin routing row (override)
    const { data: setting } = await supabase
      .from('pyra_agent_whatsapp_settings')
      .select('sender_instance_name, recipient_phone')
      .eq('agent_username', username)
      .eq('is_active', true)
      .maybeSingle();

    if (setting?.sender_instance_name && setting?.recipient_phone) {
      const { data: instance } = await supabase
        .from('pyra_whatsapp_instances')
        .select('instance_name')
        .eq('instance_name', setting.sender_instance_name)
        .eq('status', 'connected')
        .maybeSingle();
      if (instance) {
        instanceName = setting.sender_instance_name;
        phone = setting.recipient_phone;
      } else {
        console.warn('[sendWhatsAppToUser] configured instance not connected:', setting.sender_instance_name);
      }
    }

    // 2. Fallback: profile phone + most-recently-connected instance
    if (!instanceName || !phone) {
      const { data: user } = await supabase
        .from('pyra_users')
        .select('phone')
        .eq('username', username)
        .eq('status', 'active')
        .maybeSingle();
      if (!user?.phone) return false;

      const { data: instance } = await supabase
        .from('pyra_whatsapp_instances')
        .select('instance_name')
        .eq('status', 'connected')
        .order('last_connected_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (!instance?.instance_name) return false;

      instanceName = instance.instance_name;
      phone = user.phone;
    }

    if (!instanceName || !phone) return false;

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) return false;

    await evolutionClient.sendText(instanceName, { number: digits, text });
    return true;
  } catch (err) {
    console.error('[sendWhatsAppToUser] failed for', username, err);
    return false;
  }
}

/** Production URL for links embedded in WhatsApp message bodies. */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || 'https://workspace.pyramedia.cloud';
