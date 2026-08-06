import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';
import { evolutionClient } from '@/lib/evolution/client';
import { isSuperAdmin } from '@/lib/auth/rbac';
import { logActivity } from '@/lib/api/activity';

/**
 * POST /api/dashboard/sales/whatsapp/send
 * Send a WhatsApp message via the shared inbox.
 *
 * Shared Inbox model:
 * - The reply goes out from the SAME line the conversation lives on
 *   (conversation.instance_name). Until 2026-08-06 this was hardcoded to
 *   'pyraai' — harmless with one number, but the moment a second line
 *   (`selver`) was connected, replying to its conversations from the system
 *   would have reached the customer from the company number instead of the
 *   one they wrote to. Fallback is still 'pyraai' for conversation-less sends
 *   (quick actions that message a lead with no existing thread).
 * - Agent must be assigned to the conversation (or be admin)
 * - Updates conversation timestamps after sending
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiPermission('sales_whatsapp.send');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();
  const body = await request.json();
  const {
    conversation_id,
    remote_jid,
    number,
    text,
    media_url, media_type, mime_type, file_name,
    lead_id, client_id,
    quoted_message_id,
  } = body;

  if (!number && !remote_jid) return apiError('رقم الهاتف مطلوب');
  if (!text && !media_url) return apiError('محتوى الرسالة مطلوب');

  // Detect group sends: group JIDs end with @g.us
  const isGroupSend = number?.endsWith('@g.us') || remote_jid?.endsWith('@g.us');

  const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);

  // Resolve the conversation once — it carries BOTH the assignment (auth) and
  // the line the reply must leave from (instance_name).
  let instanceToUse = 'pyraai';
  if (conversation_id) {
    const { data: conv } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('assigned_to, instance_name')
      .eq('id', conversation_id)
      .maybeSingle();

    // Shared Inbox: verify agent is assigned to the conversation (or admin)
    if (!isAdmin && conv && conv.assigned_to !== auth.pyraUser.username) {
      return apiError('هذه المحادثة غير مسندة إليك', 403);
    }
    if (conv?.instance_name) instanceToUse = conv.instance_name;
  } else if (remote_jid) {
    // Conversation-less send to a known thread (e.g. deep link by JID): still
    // honor the line that thread lives on if we have it.
    const { data: conv } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('instance_name')
      .eq('remote_jid', remote_jid)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (conv?.instance_name) instanceToUse = conv.instance_name;
  }

  try {
    // Resolve Evolution message key ID for quoted reply
    let evoQuotedId: string | null = null;
    if (quoted_message_id) {
      const { data: quotedMsg } = await supabase
        .from('pyra_whatsapp_messages')
        .select('message_id')
        .eq('id', quoted_message_id)
        .maybeSingle();
      evoQuotedId = quotedMsg?.message_id || null;
    }

    // For group sends, use the group JID directly; for individual, use the phone number
    const sendNumber = isGroupSend ? (remote_jid || number) : number;

    let response;
    let messageType = 'text';
    let content = text;

    if (media_url) {
      response = await evolutionClient.sendMedia(instanceToUse, {
        number: sendNumber,
        mediatype: media_type || 'document',
        mimetype: mime_type || 'application/pdf',
        media: media_url,
        caption: text || undefined,
        fileName: file_name,
      });
      messageType = media_type || 'document';
      content = text || file_name || media_url;
    } else if (evoQuotedId) {
      response = await evolutionClient.sendTextQuoted(instanceToUse, {
        number: sendNumber,
        text,
        quotedMessageId: evoQuotedId,
      });
    } else {
      response = await evolutionClient.sendText(instanceToUse, { number: sendNumber, text });
    }

    const finalRemoteJid = remote_jid || response.key?.remoteJid || (
      isGroupSend ? sendNumber : `${number.replace(/\D/g, '')}@s.whatsapp.net`
    );

    // Find or create conversation_id — scoped to the sending line, because the
    // same contact can now hold one thread per line and the message must land
    // on the thread of the line it actually left from.
    let convId = conversation_id;
    if (!convId) {
      const { data: conv } = await supabase
        .from('pyra_whatsapp_conversations')
        .select('id')
        .eq('remote_jid', finalRemoteJid)
        .eq('instance_name', instanceToUse)
        .maybeSingle();
      convId = conv?.id || null;
    }

    // Build reply preview if quoting
    let replyPreview: { text: string; sender?: string } | null = null;
    if (quoted_message_id) {
      const { data: qMsg } = await supabase
        .from('pyra_whatsapp_messages')
        .select('content, direction, contact_name')
        .eq('id', quoted_message_id)
        .maybeSingle();
      if (qMsg) {
        replyPreview = {
          text: qMsg.content || '...',
          sender: qMsg.direction === 'incoming' ? (qMsg.contact_name || undefined) : undefined,
        };
      }
    }

    // Save message with conversation_id
    await supabase.from('pyra_whatsapp_messages').insert({
      id: generateId('wm'),
      instance_name: instanceToUse,
      remote_jid: finalRemoteJid,
      conversation_id: convId || null,
      lead_id: lead_id || null,
      client_id: client_id || null,
      message_id: response.key?.id || null,
      direction: 'outgoing',
      message_type: messageType,
      content,
      media_url: media_url || null,
      file_name: file_name || null,
      status: 'sent',
      timestamp: new Date().toISOString(),
      reply_to_id: evoQuotedId || null,
      reply_preview: replyPreview,
      // Group support: store sender info for outgoing messages
      sender_jid: null, // we are the sender (our own instance)
      sender_name: auth.pyraUser.display_name || auth.pyraUser.username,
    });

    // Update conversation timestamps
    if (convId) {
      // Check if this is the first agent reply (for SLA tracking)
      const { data: convData } = await supabase
        .from('pyra_whatsapp_conversations')
        .select('first_reply_at')
        .eq('id', convId)
        .maybeSingle();

      // For group conversations, prefix last_message with sender name
      const lastMessageText = isGroupSend
        ? `${auth.pyraUser.display_name || 'أنت'}: ${content || '[ملف]'}`
        : content;

      const updatePayload: Record<string, unknown> = {
        last_message: lastMessageText,
        last_message_at: new Date().toISOString(),
        last_agent_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Set first_reply_at if this is the first agent reply
      if (convData && !convData.first_reply_at) {
        updatePayload.first_reply_at = new Date().toISOString();
      }

      await supabase.from('pyra_whatsapp_conversations').update(updatePayload).eq('id', convId);
    }

    
    logActivity(auth.pyraUser.username, auth.pyraUser.display_name, 'whatsapp_message_sent', '/dashboard/sales/whatsapp', {});

return apiSuccess({ message_id: response.key?.id, status: 'sent' });
  } catch (err) {
    return apiServerError(`فشل إرسال الرسالة: ${err instanceof Error ? err.message : ''}`);
  }
}
