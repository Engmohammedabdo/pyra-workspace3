import { evolutionClient } from '@/lib/evolution/client';
import { generateId } from '@/lib/utils/id';
import { CONVERSATION_STATUS, CONVERSATION_PRIORITY } from '@/lib/constants/statuses';
import type { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Pull recent WhatsApp messages for ONE Evolution instance into
 * pyra_whatsapp_conversations / pyra_whatsapp_messages.
 *
 * WHY THIS IS A PULL AND NOT A WEBHOOK
 * ------------------------------------
 * Evolution can push (`/webhook/set/{instance}`), and the receiving route at
 * app/api/dashboard/sales/whatsapp/webhook exists and works — verified
 * 2026-08-06 by POSTing a synthetic MESSAGES_UPSERT from outside: HTTP 200 and
 * the row landed. But Evolution's own container cannot reach
 * workspace.pyramedia.cloud. Four consecutive live messages to the `selver`
 * line were stored by Evolution (confirmed via /chat/findMessages) and never
 * delivered to us, across three webhook configurations: query-string secret,
 * clean URL + x-api-key header, and after an instance restart. So the pull is
 * the transport that actually works on this deployment. The webhook
 * registration is deliberately left in place — if the network is ever fixed,
 * it starts working as a bonus and the dedup below makes the overlap harmless.
 *
 * This body was lifted verbatim out of the chat page's poll route so the two
 * callers cannot drift: the browser poll (every 15s while the chat page is
 * open) and the scheduled cron (every few minutes, always). Both now cover
 * EVERY registered instance instead of the single hardcoded 'pyraai'.
 *
 * Idempotent: messages are deduped on `message_id`, so overlapping runs — the
 * browser poll and the cron firing simultaneously — cannot double-insert.
 */

/** Strip non-digits, drop a leading 00, map a local 05xxxxxxxx to 9715xxxxxxxx. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0') && digits.length === 10) return `971${digits.slice(1)}`;
  return digits;
}

/** Pull the human-readable part out of an Evolution message object. */
export function extractContent(msg: Record<string, unknown>): {
  content: string | null;
  type: string;
  mediaUrl: string | null;
  fileName: string | null;
} {
  const message = msg.message as Record<string, unknown> | null;
  if (!message) return { content: null, type: 'text', mediaUrl: null, fileName: null };

  if (typeof message.conversation === 'string') {
    return { content: message.conversation, type: 'text', mediaUrl: null, fileName: null };
  }

  const ext = message.extendedTextMessage as Record<string, unknown> | undefined;
  if (ext?.text) return { content: ext.text as string, type: 'text', mediaUrl: null, fileName: null };

  const img = message.imageMessage as Record<string, unknown> | undefined;
  if (img) return { content: (img.caption as string) || null, type: 'image', mediaUrl: (img.url as string) || null, fileName: null };

  const aud = message.audioMessage as Record<string, unknown> | undefined;
  if (aud) return { content: null, type: 'audio', mediaUrl: (aud.url as string) || null, fileName: null };

  const vid = message.videoMessage as Record<string, unknown> | undefined;
  if (vid) return { content: (vid.caption as string) || null, type: 'video', mediaUrl: (vid.url as string) || null, fileName: null };

  const doc = message.documentMessage as Record<string, unknown> | undefined;
  if (doc) return { content: null, type: 'document', mediaUrl: (doc.url as string) || null, fileName: (doc.fileName as string) || null };

  return { content: null, type: 'text', mediaUrl: null, fileName: null };
}

export interface PullResult {
  instance: string;
  synced: number;
  conversations_updated: number;
  total_fetched: number;
}

export interface PullOptions {
  supabase: ReturnType<typeof createServiceRoleClient>;
  instanceName: string;
  /** This line's OWN number — its self-chat is skipped. Digits only, any shape. */
  ownPhone?: string | null;
  pageSize?: number;
}

export async function pullInstanceMessages({
  supabase,
  instanceName,
  ownPhone,
  pageSize = 50,
}: PullOptions): Promise<PullResult> {
  const ownDigits = ownPhone ? normalizePhone(ownPhone) : null;

  // This line's own Evolution token (when we hold one) + its current holder.
  // A non-company line is instance-scoped — the app's default key 401s on it —
  // so the pull must be driven with the line's OWN token. `agent_username` (the
  // holder) is reused below to auto-assign new conversations on a personal line.
  const { data: line } = await supabase
    .from('pyra_whatsapp_instances')
    .select('api_key, agent_username')
    .eq('instance_name', instanceName)
    .maybeSingle();

  const result = await evolutionClient.findAllMessages(instanceName, 1, pageSize, line?.api_key ?? undefined);
  const records = result?.messages?.records || [];

  if (records.length === 0) {
    return { instance: instanceName, synced: 0, conversations_updated: 0, total_fetched: 0 };
  }

  // Dedup against what we already stored.
  const messageIds = records
    .map((r: Record<string, unknown>) => (r.key as Record<string, unknown>)?.id as string)
    .filter(Boolean);

  const { data: existingMsgs } = await supabase
    .from('pyra_whatsapp_messages')
    .select('message_id')
    .in('message_id', messageIds);

  const existingSet = new Set((existingMsgs || []).map((m: { message_id: string }) => m.message_id));

  // Phone → lead index for auto-linking a conversation to its lead.
  const { data: leads } = await supabase
    .from('pyra_sales_leads')
    .select('id, client_id, phone')
    .not('phone', 'is', null);

  const leadsByPhone = new Map<string, { id: string; client_id: string | null }>();
  for (const l of leads || []) {
    if (l.phone) leadsByPhone.set(normalizePhone(l.phone), { id: l.id, client_id: l.client_id });
  }

  const newMessages: Array<Record<string, unknown>> = [];
  const conversationsToUpdate = new Map<string, Record<string, unknown>>();

  for (const raw of records) {
    const key = raw.key as Record<string, unknown>;
    if (!key?.remoteJid) continue;

    const remoteJid = key.remoteJid as string;
    if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') continue;
    // Skip this line's own self-chat (not other instances' numbers — a message
    // between two company lines is a real conversation for the receiving one).
    if (ownDigits && remoteJid.includes(ownDigits)) continue;

    const msgId = key.id as string;
    if (existingSet.has(msgId)) continue;

    const direction = key.fromMe ? 'outgoing' : 'incoming';
    const { content, type: msgType, mediaUrl, fileName } = extractContent(raw);

    // WhatsApp now addresses some contacts by @lid instead of @s.whatsapp.net;
    // remoteJidAlt carries the real number when it does.
    const jidForPhone = (key.remoteJidAlt as string) || remoteJid;
    const rawPhone = jidForPhone.replace(/@s\.whatsapp\.net|@c\.us|@lid/g, '');
    const phone = normalizePhone(rawPhone);

    const matchedLead = leadsByPhone.get(phone) || null;

    const timestamp = raw.messageTimestamp
      ? new Date(Number(raw.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString();

    const pushName = (raw.pushName as string) || null;

    // Group by PHONE, not JID — the same contact arrives as both @lid and
    // @s.whatsapp.net and must not become two conversations.
    const convKey = phone || remoteJid;
    let convData = conversationsToUpdate.get(convKey);
    if (!convData) {
      convData = {
        remote_jid: remoteJid,
        instance_name: instanceName,
        contact_name: pushName,
        contact_phone: phone,
        lead_id: matchedLead?.id || null,
        client_id: matchedLead?.client_id || null,
        last_message: content || `[${msgType}]`,
        last_message_at: timestamp,
      };
      conversationsToUpdate.set(convKey, convData);
    }

    newMessages.push({
      id: generateId('wm'),
      instance_name: instanceName,
      remote_jid: remoteJid,
      lead_id: matchedLead?.id || null,
      client_id: matchedLead?.client_id || null,
      message_id: msgId,
      direction,
      message_type: msgType,
      content,
      media_url: mediaUrl,
      file_name: fileName,
      contact_name: pushName,
      status: direction === 'incoming' ? 'received' : 'sent',
      timestamp,
      metadata: { pushName, remoteJidAlt: key.remoteJidAlt || null, phone },
    });
  }

  let conversationsUpdated = 0;
  for (const [, convData] of conversationsToUpdate) {
    let existing: { id: string; status: string } | null = null;
    if (convData.contact_phone) {
      const { data } = await supabase
        .from('pyra_whatsapp_conversations')
        .select('id, status')
        .eq('contact_phone', convData.contact_phone as string)
        .eq('instance_name', instanceName)
        .maybeSingle();
      existing = data;
    }
    if (!existing) {
      const { data } = await supabase
        .from('pyra_whatsapp_conversations')
        .select('id, status')
        .eq('remote_jid', convData.remote_jid as string)
        .eq('instance_name', instanceName)
        .maybeSingle();
      existing = data;
    }

    if (existing) {
      const update: Record<string, unknown> = {
        last_message: convData.last_message,
        last_message_at: convData.last_message_at,
        updated_at: new Date().toISOString(),
      };
      if (convData.contact_name) update.contact_name = convData.contact_name;
      if (convData.contact_phone) update.contact_phone = convData.contact_phone;
      if (convData.lead_id) update.lead_id = convData.lead_id;
      if (convData.client_id) update.client_id = convData.client_id;
      if (
        existing.status === CONVERSATION_STATUS.RESOLVED ||
        existing.status === CONVERSATION_STATUS.PENDING
      ) {
        update.status = CONVERSATION_STATUS.OPEN;
      }

      await supabase.from('pyra_whatsapp_conversations').update(update).eq('id', existing.id);

      for (const msg of newMessages) {
        const msgPhone = (msg.metadata as Record<string, unknown>)?.phone as string;
        if (msg.remote_jid === convData.remote_jid || (msgPhone && msgPhone === convData.contact_phone)) {
          msg.conversation_id = existing.id;
        }
      }
    } else {
      const convId = generateId('conv');
      await supabase.from('pyra_whatsapp_conversations').insert({
        id: convId,
        ...convData,
        // Personal colour line (holder set) → its inbound is that agent's own
        // work: auto-assign to the holder so the existing assigned_to scoping
        // shows it to them + admin only. The shared company line has no holder
        // (NULL) → stays unassigned for the owner to distribute, as before.
        assigned_to: line?.agent_username ?? null,
        status: CONVERSATION_STATUS.OPEN,
        priority: CONVERSATION_PRIORITY.NORMAL,
        unread_count: 1,
      });

      for (const msg of newMessages) {
        const msgPhone = (msg.metadata as Record<string, unknown>)?.phone as string;
        if (msg.remote_jid === convData.remote_jid || (msgPhone && msgPhone === convData.contact_phone)) {
          msg.conversation_id = convId;
        }
      }
    }
    conversationsUpdated++;
  }

  if (newMessages.length > 0) {
    const { error } = await supabase.from('pyra_whatsapp_messages').insert(newMessages);
    // Loud but non-fatal: the conversations are already updated, and the next
    // run re-fetches the same window, so a transient insert failure self-heals.
    if (error) console.error(`[wa-pull:${instanceName}] message insert error:`, error.message);
  }

  return {
    instance: instanceName,
    synced: newMessages.length,
    conversations_updated: conversationsUpdated,
    total_fetched: records.length,
  };
}

/**
 * Every instance the system should pull. Reads pyra_whatsapp_instances so a
 * line connected through the settings screen is picked up with no code change
 * — the single hardcoded 'pyraai' was why `selver` was invisible on day one.
 */
export async function listPullableInstances(
  supabase: ReturnType<typeof createServiceRoleClient>,
): Promise<Array<{ instance_name: string; phone_number: string | null }>> {
  const { data, error } = await supabase
    .from('pyra_whatsapp_instances')
    .select('instance_name, phone_number, auto_sync')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`pyra_whatsapp_instances: ${error.message}`);

  return (data ?? [])
    .filter((r) => r.auto_sync !== false)
    .map((r) => ({ instance_name: r.instance_name as string, phone_number: r.phone_number as string | null }));
}
