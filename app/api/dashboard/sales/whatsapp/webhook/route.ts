import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import type { EvoMessageData } from '@/lib/evolution/types';

/** Shared secret for webhook authentication */
const WEBHOOK_SECRET = process.env.EVOLUTION_API_KEY || '';

/**
 * Normalize a phone number to digits-only, stripping leading zeros and
 * ensuring consistent format for exact matching.
 * e.g. "+971 56 579 9505" → "971565799505"
 *      "0565799505"       → "971565799505" (assumes UAE)
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // If starts with "00" (international prefix), strip it
  if (digits.startsWith('00')) return digits.slice(2);
  // If starts with "0" and is 10 digits (UAE local), add country code
  if (digits.startsWith('0') && digits.length === 10) return `971${digits.slice(1)}`;
  return digits;
}

/**
 * Webhook endpoint for Evolution API events.
 * Authenticated via x-api-key header or ?secret= query parameter.
 * Returns 200 immediately; processing is best-effort.
 */
export async function POST(request: NextRequest) {
  // ── Auth: validate webhook secret ──
  const headerKey = request.headers.get('x-api-key') || request.headers.get('apikey') || '';
  const queryKey = request.nextUrl.searchParams.get('secret') || '';
  const providedKey = headerKey || queryKey;

  if (!WEBHOOK_SECRET || providedKey !== WEBHOOK_SECRET) {
    console.warn('[WA Webhook] Unauthorized request — invalid or missing secret');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { event?: string; instance?: string; data?: Record<string, unknown> };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: 'ok' });
  }

  const { event, instance, data } = body;
  if (!event || !data) {
    return NextResponse.json({ status: 'ok' });
  }

  // Process asynchronously
  processWebhook(event, instance || '', data).catch(err =>
    console.error('[WA Webhook] Processing error:', err)
  );

  return NextResponse.json({ status: 'ok' });
}

async function processWebhook(event: string, instanceName: string, data: Record<string, unknown>) {
  const supabase = createServiceRoleClient();

  switch (event) {
    case 'MESSAGES_UPSERT': {
      const messages = Array.isArray(data) ? data : [data];
      for (const rawMsg of messages) {
        const msg = rawMsg as unknown as EvoMessageData;
        if (!msg.key?.remoteJid) continue;

        // Skip status/broadcast messages
        if (msg.key.remoteJid === 'status@broadcast') continue;
        if (msg.key.remoteJid.endsWith('@g.us')) continue; // Skip group messages

        const direction = msg.key.fromMe ? 'outgoing' : 'incoming';
        const content = extractTextContent(msg);
        const messageType = detectMessageType(msg);
        const mediaUrl = extractMediaUrl(msg);
        const fileName = extractFileName(msg);

        // Skip if we already have this message (dedup by message_id)
        if (msg.key.id) {
          const { data: existing } = await supabase
            .from('pyra_whatsapp_messages')
            .select('id')
            .eq('message_id', msg.key.id)
            .maybeSingle();
          if (existing) continue;
        }

        // ── Extract phone: handle both @lid and @s.whatsapp.net formats ──
        // New WhatsApp uses @lid (Linked ID) format. The real phone is in remoteJidAlt.
        const jidForPhone = msg.key.remoteJidAlt || msg.key.remoteJid;
        const rawPhone = jidForPhone
          .replace('@s.whatsapp.net', '')
          .replace('@c.us', '')
          .replace('@lid', '');
        const phone = normalizePhone(rawPhone);

        // Use remoteJid as the conversation key (could be @lid or @s.whatsapp.net)
        const conversationJid = msg.key.remoteJid;

        // Try to match with a lead by normalized phone number
        let matchedLead: { id: string; client_id: string | null } | null = null;
        if (phone && /^\d{7,20}$/.test(phone)) {
          const { data: candidateLeads } = await supabase
            .from('pyra_sales_leads')
            .select('id, client_id, phone')
            .not('phone', 'is', null);

          matchedLead = candidateLeads?.find(
            (l) => l.phone && normalizePhone(l.phone) === phone
          ) || null;
        }

        const msgTimestamp = msg.messageTimestamp
          ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
          : new Date().toISOString();

        // ── Upsert conversation (Shared Inbox model) ──
        // Find by PHONE first (prevents @lid/@s.whatsapp.net duplicates), then by JID
        let existingConv: { id: string; assigned_to: string | null; status: string } | null = null;
        if (phone && /^\d{7,20}$/.test(phone)) {
          const { data } = await supabase
            .from('pyra_whatsapp_conversations')
            .select('id, assigned_to, status')
            .eq('contact_phone', phone)
            .eq('instance_name', instanceName || 'pyraai')
            .maybeSingle();
          existingConv = data;
        }
        if (!existingConv) {
          const { data } = await supabase
            .from('pyra_whatsapp_conversations')
            .select('id, assigned_to, status')
            .eq('remote_jid', conversationJid)
            .eq('instance_name', instanceName || 'pyraai')
            .maybeSingle();
          existingConv = data;
        }

        let conversationId: string;

        if (existingConv) {
          conversationId = existingConv.id;
          const convUpdate: Record<string, unknown> = {
            last_message: content || (messageType !== 'text' ? `[${messageType}]` : null),
            last_message_at: msgTimestamp,
            updated_at: new Date().toISOString(),
          };
          if (direction === 'incoming') {
            convUpdate.last_customer_message_at = msgTimestamp;
            convUpdate.unread_count = (existingConv as unknown as { unread_count?: number }).unread_count
              ? Number((existingConv as unknown as { unread_count: number }).unread_count) + 1
              : 1;
            // Auto-reopen if resolved or pending
            if (existingConv.status === 'resolved' || existingConv.status === 'pending') {
              convUpdate.status = 'open';
            }
          } else {
            convUpdate.last_agent_message_at = msgTimestamp;
          }
          // Update contact info if available
          if (msg.pushName) convUpdate.contact_name = msg.pushName;
          if (matchedLead?.id) convUpdate.lead_id = matchedLead.id;
          if (matchedLead?.client_id) convUpdate.client_id = matchedLead.client_id;
          if (phone) convUpdate.contact_phone = phone;

          await supabase.from('pyra_whatsapp_conversations').update(convUpdate).eq('id', existingConv.id);
        } else {
          // New conversation — unassigned (admin will distribute)
          conversationId = generateId('conv');
          await supabase.from('pyra_whatsapp_conversations').insert({
            id: conversationId,
            remote_jid: conversationJid,
            instance_name: instanceName || 'pyraai',
            contact_name: msg.pushName || null,
            contact_phone: phone || null,
            lead_id: matchedLead?.id || null,
            client_id: matchedLead?.client_id || null,
            status: 'open',
            priority: 'normal',
            assigned_to: null, // Unassigned — admin distributes
            last_message: content || (messageType !== 'text' ? `[${messageType}]` : null),
            last_message_at: msgTimestamp,
            last_customer_message_at: direction === 'incoming' ? msgTimestamp : null,
            last_agent_message_at: direction === 'outgoing' ? msgTimestamp : null,
            unread_count: direction === 'incoming' ? 1 : 0,
          });
        }

        // ── Insert message with conversation_id ──
        await supabase.from('pyra_whatsapp_messages').insert({
          id: generateId('wm'),
          instance_name: instanceName,
          remote_jid: conversationJid,
          conversation_id: conversationId,
          lead_id: matchedLead?.id || null,
          client_id: matchedLead?.client_id || null,
          message_id: msg.key.id || null,
          direction,
          message_type: messageType,
          content,
          media_url: mediaUrl,
          file_name: fileName,
          contact_name: msg.pushName || null,
          status: direction === 'incoming' ? 'received' : 'sent',
          timestamp: msgTimestamp,
          metadata: {
            pushName: msg.pushName,
            remoteJidAlt: msg.key.remoteJidAlt || null,
            addressingMode: msg.key.addressingMode || null,
            phone: phone || null,
          },
        });

        // Update lead's last_contact_at
        if (matchedLead?.id && direction === 'incoming') {
          void supabase
            .from('pyra_sales_leads')
            .update({ last_contact_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', matchedLead.id);
        }

        // ── Notifications (Shared Inbox) ──
        if (direction === 'incoming') {
          const senderName = msg.pushName || (phone ? `+${phone}` : 'جهة اتصال');
          const preview = content
            ? (content.length > 60 ? content.slice(0, 60) + '...' : content)
            : (messageType === 'image' ? '📷 صورة' : messageType === 'audio' ? '🎤 صوتية' : messageType === 'video' ? '🎬 فيديو' : '📎 ملف');

          if (existingConv?.assigned_to) {
            // Notify assigned agent
            void supabase.from('pyra_notifications').insert({
              id: generateId('n'),
              recipient_username: existingConv.assigned_to,
              type: 'whatsapp_message',
              title: `رسالة من ${senderName}`,
              message: preview,
              source_display_name: senderName,
              target_path: '/dashboard/sales/chat',
              is_read: false,
            });
          } else if (!existingConv) {
            // New unassigned conversation — notify admin
            void supabase.from('pyra_notifications').insert({
              id: generateId('n'),
              recipient_username: 'admin',
              type: 'whatsapp_new_conversation',
              title: `محادثة جديدة من ${senderName}`,
              message: `${preview} — بحاجة للتعيين`,
              source_display_name: senderName,
              target_path: '/dashboard/sales/chat',
              is_read: false,
            });
          }
        }
      }
      break;
    }

    case 'MESSAGES_UPDATE': {
      // Status updates (delivered, read)
      const updates = Array.isArray(data) ? data : [data];
      for (const update of updates) {
        const key = update.key as { id?: string };
        const statusMap: Record<number, string> = {
          2: 'sent',
          3: 'delivered',
          4: 'read',
          5: 'read',
        };
        const newStatus = statusMap[update.status as number];
        if (key?.id && newStatus) {
          await supabase
            .from('pyra_whatsapp_messages')
            .update({ status: newStatus })
            .eq('message_id', key.id);
        }
      }
      break;
    }

    case 'CONNECTION_UPDATE': {
      const state = data.state as string;
      const statusMap: Record<string, string> = {
        open: 'connected',
        close: 'disconnected',
        connecting: 'pending',
      };
      const newStatus = statusMap[state];
      if (newStatus) {
        await supabase
          .from('pyra_whatsapp_instances')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('instance_name', instanceName);
      }
      break;
    }
  }
}

function extractTextContent(msg: EvoMessageData): string | null {
  if (msg.message?.conversation) return msg.message.conversation;
  if (msg.message?.extendedTextMessage?.text) return msg.message.extendedTextMessage.text;
  if (msg.message?.imageMessage?.caption) return msg.message.imageMessage.caption;
  if (msg.message?.videoMessage?.caption) return msg.message.videoMessage.caption;
  return null;
}

function detectMessageType(msg: EvoMessageData): string {
  if (msg.message?.imageMessage) return 'image';
  if (msg.message?.documentMessage) return 'document';
  if (msg.message?.audioMessage) return 'audio';
  if (msg.message?.videoMessage) return 'video';
  return 'text';
}

function extractMediaUrl(msg: EvoMessageData): string | null {
  if (msg.message?.imageMessage?.url) return msg.message.imageMessage.url;
  if (msg.message?.documentMessage?.url) return msg.message.documentMessage.url;
  if (msg.message?.audioMessage?.url) return msg.message.audioMessage.url;
  if (msg.message?.videoMessage?.url) return msg.message.videoMessage.url;
  return null;
}

function extractFileName(msg: EvoMessageData): string | null {
  if (msg.message?.documentMessage?.fileName) return msg.message.documentMessage.fileName;
  return null;
}
