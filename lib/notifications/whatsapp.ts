import type { SupabaseClient } from '@supabase/supabase-js';
import { evolutionClient } from '@/lib/evolution/client';
import { logError } from '@/lib/observability/log-error';

/** A connected instance considered as the sender of an internal notification. */
export interface SenderCandidate {
  instance_name: string;
  /** Instance-scoped Evolution token, when the line has one of its own. */
  api_key?: string | null;
  /** The admin-designated notification line (migration 058). At most one. */
  is_notification_line?: boolean | null;
  last_connected_at?: string | null;
}

/**
 * Choose which WhatsApp line an internal notification is sent FROM.
 *
 * Pure so it can be unit-tested (`__tests__/whatsapp-sender-selection.test.ts`)
 * — the rule below is load-bearing and was learned the expensive way.
 *
 * Order:
 *   1. The DESIGNATED notification line (`is_notification_line`).
 *   2. Otherwise the most-recently-connected line.
 *   3. Ties (including all-NULL timestamps) break on instance_name, so the
 *      sender is stable across calls instead of Postgres' whim.
 *
 * Why designation beats recency (2026-08-06 outage): the sender used to be
 * `ORDER BY last_connected_at DESC NULLS LAST LIMIT 1`, which made it an
 * accident of registration order. Registering the sales line `selver` instantly
 * outranked the company line `pyraai` (last_connected_at NULL) and re-routed
 * every employee notification onto a line our Evolution key cannot authenticate
 * against. Recency survives only as a fallback, so a database with no
 * designation still sends rather than going silent.
 */
export function pickSenderInstance(
  candidates: SenderCandidate[],
): SenderCandidate | null {
  if (candidates.length === 0) return null;

  const designated = candidates.filter((c) => c.is_notification_line === true);
  const pool = designated.length > 0 ? designated : candidates;

  // Copy before sorting — callers pass arrays they still own.
  return [...pool].sort((a, b) => {
    const at = a.last_connected_at ?? '';
    const bt = b.last_connected_at ?? '';
    if (at !== bt) return bt.localeCompare(at); // newer first, '' (NULL) last
    return a.instance_name.localeCompare(b.instance_name);
  })[0];
}

/**
 * Send a WhatsApp text to an internal USER (employee/agent).
 *
 * Recipient resolution priority (2026-07-03, Abdou's call — "the number
 * already lives on the profile, don't make admins re-enter it"):
 *   1. Explicit routing row in pyra_agent_whatsapp_settings (is_active=true,
 *      instance connected) — the Phase 11 Refinement admin OVERRIDE for
 *      special cases (route to a number different from the profile).
 *   2. FALLBACK: pyra_users.phone (active user, international format) sent
 *      via `pickSenderInstance()` over the connected lines.
 *
 * The locked CRM follow-up-reminders cron keeps its own inline two-step
 * lookup and is NOT affected by this fallback.
 *
 * Graceful degradation: never throws, returns false on any skip/failure —
 * callers ALWAYS do the in-app notify() regardless of this result. Because
 * of that contract nothing downstream can notice a WhatsApp outage, so every
 * exit path here records WHY it gave up (`pyra_error_logs`, severity
 * 'warning'). The 2026-08-06 outage ran 19+ hours unnoticed precisely because
 * these paths were silent — do not remove the logging.
 */
export async function sendWhatsAppToUser(
  supabase: SupabaseClient,
  username: string,
  text: string,
): Promise<boolean> {
  /** Record a give-up reason. Fire-and-forget; never throws. */
  const giveUp = (reason: string, metadata?: Record<string, unknown>): false => {
    logError({
      severity: 'warning',
      error: `WhatsApp notification not sent: ${reason}`,
      metadata: { username, reason, ...metadata },
    });
    return false;
  };

  try {
    let instanceName: string | null = null;
    let instanceApiKey: string | null = null;
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
        .select('instance_name, api_key')
        .eq('instance_name', setting.sender_instance_name)
        .eq('status', 'connected')
        .maybeSingle();
      if (instance) {
        instanceName = setting.sender_instance_name;
        instanceApiKey = instance.api_key ?? null;
        phone = setting.recipient_phone;
      } else {
        // Not a give-up: the fallback below still has a chance.
        console.warn('[sendWhatsAppToUser] configured instance not connected:', setting.sender_instance_name);
      }
    }

    // 2. Fallback: profile phone + the designated (or most recent) line
    if (!instanceName || !phone) {
      const { data: user } = await supabase
        .from('pyra_users')
        .select('phone')
        .eq('username', username)
        .eq('status', 'active')
        .maybeSingle();
      if (!user?.phone) return giveUp('no phone on an active user profile');

      const { data: instances } = await supabase
        .from('pyra_whatsapp_instances')
        .select('instance_name, api_key, is_notification_line, last_connected_at')
        .eq('status', 'connected');

      const picked = pickSenderInstance((instances ?? []) as SenderCandidate[]);
      if (!picked) return giveUp('no connected WhatsApp instance');

      instanceName = picked.instance_name;
      instanceApiKey = picked.api_key ?? null;
      phone = user.phone;
    }

    // Defensive: both branches above set these or return, but the compiler
    // cannot see that across the two assignment paths.
    if (!instanceName || !phone) return giveUp('sender or recipient unresolved');

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) return giveUp('recipient phone is not a usable number', { instanceName });

    // A line registered on Evolution with its own token cannot be driven with
    // another line's key — prefer the instance's own when we hold it.
    await evolutionClient.sendText(
      instanceName,
      { number: digits, text },
      instanceApiKey ?? undefined,
    );
    return true;
  } catch (err) {
    console.error('[sendWhatsAppToUser] failed for', username, err);
    logError({
      severity: 'warning',
      error: err,
      metadata: { username, reason: 'evolution send threw' },
    });
    return false;
  }
}

/** Production URL for links embedded in WhatsApp message bodies. */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || 'https://workspace.pyramedia.cloud';
