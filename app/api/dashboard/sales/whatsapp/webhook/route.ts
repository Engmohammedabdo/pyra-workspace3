import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import type { EvoMessageData } from '@/lib/evolution/types';
import { CONVERSATION_STATUS, CONVERSATION_PRIORITY } from '@/lib/constants/statuses';
import { applySlaPolicy } from '@/lib/whatsapp/sla';
import { typingMap, cleanupTypingMap } from '@/lib/whatsapp/typing-map';

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

        // ── Extract quoted reply info ──
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const replyToId = contextInfo?.stanzaId || null;
        let replyPreview: { text: string; sender?: string } | null = null;
        if (replyToId && contextInfo) {
          const quotedMsg = contextInfo.quotedMessage;
          const quotedText =
            quotedMsg?.conversation ||
            quotedMsg?.imageMessage?.caption ||
            quotedMsg?.documentMessage?.fileName ||
            '...';
          replyPreview = {
            text: quotedText,
            sender: contextInfo.participant
              ? contextInfo.participant.replace('@s.whatsapp.net', '').replace('@lid', '')
              : undefined,
          };
        }

        // Skip if we already have this message (dedup by message_id)
        if (msg.key.id) {
          const { data: existing } = await supabase
            .from('pyra_whatsapp_messages')
            .select('id')
            .eq('message_id', msg.key.id)
            .maybeSingle();
          if (existing) continue;
        } else {
          // Fallback dedup when message_id is absent: match by jid + timestamp + direction
          const fallbackTs = msg.messageTimestamp
            ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
            : null;
          if (fallbackTs) {
            const { data: existing } = await supabase
              .from('pyra_whatsapp_messages')
              .select('id')
              .eq('remote_jid', msg.key.remoteJid)
              .eq('timestamp', fallbackTs)
              .eq('direction', direction)
              .maybeSingle();
            if (existing) continue;
          }
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
        let existingConv: { id: string; assigned_to: string | null; status: string; unread_count: number } | null = null;
        if (phone && /^\d{7,20}$/.test(phone)) {
          const { data } = await supabase
            .from('pyra_whatsapp_conversations')
            .select('id, assigned_to, status, unread_count')
            .eq('contact_phone', phone)
            .eq('instance_name', instanceName || 'pyraai')
            .maybeSingle();
          existingConv = data;
        }
        if (!existingConv) {
          const { data } = await supabase
            .from('pyra_whatsapp_conversations')
            .select('id, assigned_to, status, unread_count')
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
            convUpdate.unread_count = (existingConv.unread_count || 0) + 1;
            // Auto-reopen if resolved or pending
            if (existingConv.status === CONVERSATION_STATUS.RESOLVED || existingConv.status === CONVERSATION_STATUS.PENDING) {
              convUpdate.status = CONVERSATION_STATUS.OPEN;
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
          // New conversation — try auto-assignment first
          const assignedAgent = await resolveAutoAssignment(supabase);

          conversationId = generateId('conv');
          await supabase.from('pyra_whatsapp_conversations').insert({
            id: conversationId,
            remote_jid: conversationJid,
            instance_name: instanceName || 'pyraai',
            contact_name: msg.pushName || null,
            contact_phone: phone || null,
            lead_id: matchedLead?.id || null,
            client_id: matchedLead?.client_id || null,
            status: CONVERSATION_STATUS.OPEN,
            priority: CONVERSATION_PRIORITY.NORMAL,
            assigned_to: assignedAgent,
            assigned_at: assignedAgent ? new Date().toISOString() : null,
            assigned_by: assignedAgent ? 'system' : null,
            last_message: content || (messageType !== 'text' ? `[${messageType}]` : null),
            last_message_at: msgTimestamp,
            last_customer_message_at: direction === 'incoming' ? msgTimestamp : null,
            last_agent_message_at: direction === 'outgoing' ? msgTimestamp : null,
            unread_count: direction === 'incoming' ? 1 : 0,
          });

          // Apply SLA policy to new conversation
          void applySlaPolicy(supabase, conversationId, CONVERSATION_PRIORITY.NORMAL);
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
          reply_to_id: replyToId,
          reply_preview: replyPreview,
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

        // ── CSAT Response Detection ──
        // If incoming message is a single digit 1-5 and conversation was
        // recently resolved (within 24h), record as CSAT response.
        if (direction === 'incoming' && content) {
          const trimmed = content.trim();
          const csatRating = /^[1-5]$/.test(trimmed) ? parseInt(trimmed, 10) : null;
          if (csatRating && existingConv) {
            void handleCsatResponse(supabase, existingConv.id, csatRating, phone, instanceName || 'pyraai');
          }
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
      // Status updates (delivered, read) and reactions
      const updates = Array.isArray(data) ? data : [data];
      for (const update of updates) {
        const key = update.key as { id?: string; remoteJid?: string; fromMe?: boolean };

        // ── Handle reaction updates ──
        const reactionMessage = (update as Record<string, unknown>).reactionMessage as
          | { key?: { id?: string }; text?: string; senderId?: string }
          | undefined;
        if (reactionMessage?.key?.id) {
          const targetMsgId = reactionMessage.key.id;
          const emoji = reactionMessage.text || '';
          const sender = reactionMessage.senderId || key?.remoteJid || '';

          // Fetch current reactions
          const { data: msg } = await supabase
            .from('pyra_whatsapp_messages')
            .select('reactions')
            .eq('message_id', targetMsgId)
            .maybeSingle();

          if (msg) {
            const reactions: Array<{ emoji: string; from: string }> = Array.isArray(msg.reactions) ? msg.reactions : [];
            // Remove existing reaction from this sender
            const filtered = reactions.filter((r: { from: string }) => r.from !== sender);
            // Add new reaction (empty emoji = remove)
            if (emoji) filtered.push({ emoji, from: sender });

            await supabase
              .from('pyra_whatsapp_messages')
              .update({ reactions: filtered })
              .eq('message_id', targetMsgId);
          }
          continue;
        }

        // ── Status updates ──
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

    case 'PRESENCE_UPDATE': {
      // Typing indicator from contacts
      const remoteJid = (data.remoteJid || data.id) as string | undefined;
      const presenceStatus = (data.status || data.presence) as string | undefined;
      if (remoteJid && presenceStatus) {
        cleanupTypingMap();
        typingMap.set(remoteJid, {
          typing: presenceStatus === 'composing',
          updatedAt: Date.now(),
        });
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

/**
 * Resolve auto-assignment for new conversations.
 * Reads the whatsapp_auto_assignment setting and returns the
 * username to assign, or null for manual mode.
 *
 * Modes:
 *   manual      → null (admin distributes)
 *   round_robin → rotate through agents
 *   least_busy  → assign to agent with fewest open conversations
 */
async function resolveAutoAssignment(
  supabase: ReturnType<typeof createServiceRoleClient>
): Promise<string | null> {
  try {
    // Read auto-assignment setting
    const { data: setting } = await supabase
      .from('pyra_settings')
      .select('value')
      .eq('key', 'whatsapp_auto_assignment')
      .maybeSingle();

    const mode = setting?.value?.mode || 'manual';
    if (mode === 'manual') return null;

    // Get all sales agents
    const { data: agents } = await supabase
      .from('pyra_users')
      .select('username')
      .eq('role', 'sales_agent')
      .eq('status', 'active');

    if (!agents || agents.length === 0) return null;

    const agentUsernames = agents.map(a => a.username);

    if (mode === 'round_robin') {
      // Find the last assigned agent
      const { data: lastAssigned } = await supabase
        .from('pyra_whatsapp_conversations')
        .select('assigned_to')
        .not('assigned_to', 'is', null)
        .eq('assigned_by', 'system')
        .order('assigned_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastAgent = lastAssigned?.assigned_to;
      const lastIndex = lastAgent ? agentUsernames.indexOf(lastAgent) : -1;
      const nextIndex = (lastIndex + 1) % agentUsernames.length;
      return agentUsernames[nextIndex];
    }

    if (mode === 'least_busy') {
      // Single query to count open conversations per agent (replaces N+1 loop)
      const { data: agentConvs } = await supabase
        .from('pyra_whatsapp_conversations')
        .select('assigned_to')
        .eq('status', CONVERSATION_STATUS.OPEN)
        .in('assigned_to', agentUsernames);

      const counts: Record<string, number> = {};
      for (const username of agentUsernames) counts[username] = 0;
      for (const row of agentConvs || []) {
        if (row.assigned_to) counts[row.assigned_to] = (counts[row.assigned_to] || 0) + 1;
      }

      // Find agent with fewest open conversations
      let minAgent = agentUsernames[0];
      let minCount = counts[minAgent] ?? 0;
      for (const username of agentUsernames) {
        if ((counts[username] ?? 0) < minCount) {
          minCount = counts[username] ?? 0;
          minAgent = username;
        }
      }
      return minAgent;
    }

    return null;
  } catch (err) {
    console.error('[Auto-Assignment] Error:', err);
    return null;
  }
}

/**
 * Handle a CSAT response: check if conversation was recently resolved (within 24h),
 * create/update CSAT record, update conversation, and send thank-you message.
 */
async function handleCsatResponse(
  supabase: ReturnType<typeof createServiceRoleClient>,
  conversationId: string,
  rating: number,
  phone: string,
  instanceName: string
) {
  try {
    // Check if CSAT is enabled
    const { data: setting } = await supabase
      .from('pyra_settings')
      .select('value')
      .eq('key', 'whatsapp_csat_enabled')
      .maybeSingle();

    if (setting?.value?.enabled !== true) return;

    // Check if conversation was resolved within the last 24 hours
    const { data: conv } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('id, resolved_at, contact_name, contact_phone, assigned_to, csat_rating')
      .eq('id', conversationId)
      .maybeSingle();

    if (!conv?.resolved_at) return;

    const resolvedAt = new Date(conv.resolved_at).getTime();
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    if (now - resolvedAt > twentyFourHours) return;

    // Don't overwrite existing CSAT
    if (conv.csat_rating) return;

    // Check if CSAT record already exists
    const { data: existing } = await supabase
      .from('pyra_csat_surveys')
      .select('id')
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (existing) {
      // Update existing record
      await supabase
        .from('pyra_csat_surveys')
        .update({ rating, submitted_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      // Create new CSAT record
      await supabase
        .from('pyra_csat_surveys')
        .insert({
          id: generateId('csat'),
          conversation_id: conversationId,
          rating,
          contact_phone: conv.contact_phone || phone,
          contact_name: conv.contact_name || null,
          agent_username: conv.assigned_to || null,
          submitted_at: new Date().toISOString(),
        });
    }

    // Update conversation csat_rating
    await supabase
      .from('pyra_whatsapp_conversations')
      .update({ csat_rating: rating })
      .eq('id', conversationId);

    // Send thank you message
    try {
      const { evolutionClient } = await import('@/lib/evolution/client');
      await evolutionClient.sendText(instanceName, {
        number: phone,
        text: '\u0634\u0643\u0631\u0627\u064b \u0644\u062a\u0642\u064a\u064a\u0645\u0643! \ud83c\udf1f',
      });
    } catch (sendErr) {
      console.error('[CSAT] Failed to send thank-you message:', sendErr);
    }

    console.log(`[CSAT] Recorded rating ${rating} for conversation ${conversationId}`);
  } catch (err) {
    console.error('[CSAT] handleCsatResponse error:', err);
  }
}
