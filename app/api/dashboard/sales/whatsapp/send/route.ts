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
 * - Always uses 'pyraai' instance (single shared number)
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

  if (!number) return apiError('رقم الهاتف مطلوب');
  if (!text && !media_url) return apiError('محتوى الرسالة مطلوب');

  const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);

  // Shared Inbox: verify agent is assigned to the conversation (or admin)
  if (!isAdmin && conversation_id) {
    const { data: conv } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('assigned_to')
      .eq('id', conversation_id)
      .maybeSingle();

    if (conv && conv.assigned_to !== auth.pyraUser.username) {
      return apiError('هذه المحادثة غير مسندة إليك', 403);
    }
  }

  // Always use pyraai instance (shared inbox = single number)
  const instanceToUse = 'pyraai';

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

    let response;
    let messageType = 'text';
    let content = text;

    if (media_url) {
      response = await evolutionClient.sendMedia(instanceToUse, {
        number,
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
        number,
        text,
        quotedMessageId: evoQuotedId,
      });
    } else {
      response = await evolutionClient.sendText(instanceToUse, { number, text });
    }

    const finalRemoteJid = remote_jid || response.key?.remoteJid || `${number.replace(/\D/g, '')}@s.whatsapp.net`;

    // Find or create conversation_id
    let convId = conversation_id;
    if (!convId) {
      const { data: conv } = await supabase
        .from('pyra_whatsapp_conversations')
        .select('id')
        .eq('remote_jid', finalRemoteJid)
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
    });

    // Update conversation timestamps
    if (convId) {
      // Check if this is the first agent reply (for SLA tracking)
      const { data: convData } = await supabase
        .from('pyra_whatsapp_conversations')
        .select('first_reply_at')
        .eq('id', convId)
        .maybeSingle();

      const updatePayload: Record<string, unknown> = {
        last_message: content,
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
