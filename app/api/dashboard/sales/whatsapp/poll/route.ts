import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { evolutionClient } from '@/lib/evolution/client';
import { generateId } from '@/lib/utils/id';
import { CONVERSATION_STATUS, CONVERSATION_PRIORITY } from '@/lib/constants/statuses';

export const maxDuration = 30;

const INSTANCE_NAME = 'pyraai';
const OWN_PHONE = '971565799505'; // Pyra's WhatsApp number — skip self-messages

/**
 * Normalize phone: strip non-digits, handle UAE local format
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0') && digits.length === 10) return `971${digits.slice(1)}`;
  return digits;
}

/**
 * Extract text content from Evolution message object
 */
function extractContent(msg: Record<string, unknown>): { content: string | null; type: string; mediaUrl: string | null; fileName: string | null } {
  const message = msg.message as Record<string, unknown> | null;
  if (!message) return { content: null, type: 'text', mediaUrl: null, fileName: null };

  if (typeof message.conversation === 'string') return { content: message.conversation, type: 'text', mediaUrl: null, fileName: null };

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

/**
 * POST /api/dashboard/sales/whatsapp/poll
 * Poll Evolution API for new messages and upsert into DB.
 * Called on chat page load + every 30s.
 * Fetches latest messages, deduplicates, creates/updates conversations.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiPermission('sales_whatsapp.view');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();

  try {
    // 1. Fetch latest messages from Evolution API (last 2 pages = ~100 msgs)
    const result = await evolutionClient.findAllMessages(INSTANCE_NAME, 1, 50);
    const records = result?.messages?.records || [];

    if (records.length === 0) {
      return apiSuccess({ synced: 0, conversations_updated: 0 });
    }

    // 2. Get existing message_ids for dedup
    const messageIds = records
      .map((r: Record<string, unknown>) => (r.key as Record<string, unknown>)?.id as string)
      .filter(Boolean);

    const { data: existingMsgs } = await supabase
      .from('pyra_whatsapp_messages')
      .select('message_id')
      .in('message_id', messageIds);

    const existingSet = new Set((existingMsgs || []).map((m: { message_id: string }) => m.message_id));

    // 3. Pre-load leads for phone matching
    const { data: leads } = await supabase
      .from('pyra_sales_leads')
      .select('id, client_id, phone')
      .not('phone', 'is', null);

    const leadsByPhone = new Map<string, { id: string; client_id: string | null }>();
    for (const l of leads || []) {
      if (l.phone) leadsByPhone.set(normalizePhone(l.phone), { id: l.id, client_id: l.client_id });
    }

    // 4. Process new messages
    const newMessages: Array<Record<string, unknown>> = [];
    const conversationsToUpdate = new Map<string, Record<string, unknown>>();

    for (const raw of records) {
      const key = raw.key as Record<string, unknown>;
      if (!key?.remoteJid) continue;

      const remoteJid = key.remoteJid as string;
      // Skip groups, broadcasts, and our own number
      if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') continue;
      if (remoteJid.includes(OWN_PHONE)) continue;

      const msgId = key.id as string;
      if (existingSet.has(msgId)) continue; // Already in DB

      const direction = key.fromMe ? 'outgoing' : 'incoming';
      const { content, type: msgType, mediaUrl, fileName } = extractContent(raw);

      // Phone extraction
      const jidForPhone = (key.remoteJidAlt as string) || remoteJid;
      const rawPhone = jidForPhone.replace(/@s\.whatsapp\.net|@c\.us|@lid/g, '');
      const phone = normalizePhone(rawPhone);

      // Lead matching
      const matchedLead = leadsByPhone.get(phone) || null;

      const timestamp = raw.messageTimestamp
        ? new Date(Number(raw.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString();

      const pushName = (raw.pushName as string) || null;

      // Find conversation — GROUP BY PHONE (not JID) to avoid duplicates
      // Same contact can have @lid and @s.whatsapp.net — must be ONE conversation
      const convKey = phone || remoteJid; // Use phone as primary key
      let convData = conversationsToUpdate.get(convKey);
      if (!convData) {
        convData = {
          remote_jid: remoteJid,
          instance_name: INSTANCE_NAME,
          contact_name: pushName,
          contact_phone: phone,
          lead_id: matchedLead?.id || null,
          client_id: matchedLead?.client_id || null,
          last_message: content || `[${msgType}]`,
          last_message_at: timestamp,
        };
        conversationsToUpdate.set(convKey, convData);
      }

      // Track conversation_id later (after upsert)
      newMessages.push({
        id: generateId('wm'),
        instance_name: INSTANCE_NAME,
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

    // 5. Upsert conversations — find by PHONE first (avoids @lid/@s.whatsapp.net duplicates)
    let conversationsUpdated = 0;
    for (const [_key, convData] of conversationsToUpdate) {
      // Try to find by phone first (prevents duplicates), then by remote_jid
      let existing: { id: string; status: string } | null = null;
      if (convData.contact_phone) {
        const { data } = await supabase
          .from('pyra_whatsapp_conversations')
          .select('id, status')
          .eq('contact_phone', convData.contact_phone as string)
          .eq('instance_name', INSTANCE_NAME)
          .maybeSingle();
        existing = data;
      }
      if (!existing) {
        const { data } = await supabase
          .from('pyra_whatsapp_conversations')
          .select('id, status')
          .eq('remote_jid', convData.remote_jid as string)
          .eq('instance_name', INSTANCE_NAME)
          .maybeSingle();
        existing = data;
      }

      if (existing) {
        // Update existing
        const update: Record<string, unknown> = {
          last_message: convData.last_message,
          last_message_at: convData.last_message_at,
          updated_at: new Date().toISOString(),
        };
        if (convData.contact_name) update.contact_name = convData.contact_name;
        if (convData.contact_phone) update.contact_phone = convData.contact_phone;
        if (convData.lead_id) update.lead_id = convData.lead_id;
        if (convData.client_id) update.client_id = convData.client_id;
        // Auto-reopen if new incoming message
        if (existing.status === CONVERSATION_STATUS.RESOLVED || existing.status === CONVERSATION_STATUS.PENDING) {
          update.status = CONVERSATION_STATUS.OPEN;
        }

        await supabase.from('pyra_whatsapp_conversations').update(update).eq('id', existing.id);

        // Set conversation_id on messages matching this phone or JID
        for (const msg of newMessages) {
          const msgPhone = (msg.metadata as Record<string, unknown>)?.phone as string;
          if (msg.remote_jid === convData.remote_jid || (msgPhone && msgPhone === convData.contact_phone)) {
            msg.conversation_id = existing.id;
          }
        }
      } else {
        // Create new conversation
        const convId = generateId('conv');
        await supabase.from('pyra_whatsapp_conversations').insert({
          id: convId,
          ...convData,
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

    // 6. Insert new messages
    if (newMessages.length > 0) {
      const { error } = await supabase.from('pyra_whatsapp_messages').insert(newMessages);
      if (error) console.error('Poll: message insert error:', error.message);
    }

    // 7. Update instance status
    void supabase
      .from('pyra_whatsapp_instances')
      .update({ status: 'connected', updated_at: new Date().toISOString() })
      .eq('instance_name', INSTANCE_NAME);

    return apiSuccess({
      synced: newMessages.length,
      conversations_updated: conversationsUpdated,
      total_fetched: records.length,
    });
  } catch (err) {
    console.error('Poll error:', err);
    return apiServerError(`Poll failed: ${err instanceof Error ? err.message : ''}`);
  }
}
