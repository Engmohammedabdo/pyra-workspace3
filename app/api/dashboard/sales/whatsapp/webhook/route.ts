import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import type { EvoMessageData } from '@/lib/evolution/types';

/**
 * Public webhook — receives events from Evolution API.
 * No auth required (Evolution API calls this directly).
 * Returns 200 immediately; processing is best-effort.
 */
export async function POST(request: NextRequest) {
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
  const supabase = await createServerSupabaseClient();

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

        // Try to match with a lead by phone number
        const phone = msg.key.remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        const { data: matchedLead } = await supabase
          .from('pyra_sales_leads')
          .select('id, client_id')
          .or(`phone.ilike.%${phone}%,phone.ilike.%${phone.slice(-9)}%`)
          .maybeSingle();

        await supabase.from('pyra_whatsapp_messages').insert({
          id: generateId('wm'),
          instance_name: instanceName,
          remote_jid: msg.key.remoteJid,
          lead_id: matchedLead?.id || null,
          client_id: matchedLead?.client_id || null,
          message_id: msg.key.id || null,
          direction,
          message_type: messageType,
          content,
          media_url: mediaUrl,
          file_name: fileName,
          status: direction === 'incoming' ? 'received' : 'sent',
          timestamp: msg.messageTimestamp
            ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
            : new Date().toISOString(),
          metadata: { pushName: msg.pushName },
        });

        // Update lead's last_contact_at
        if (matchedLead?.id && direction === 'incoming') {
          await supabase
            .from('pyra_sales_leads')
            .update({
              last_contact_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', matchedLead.id);
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
