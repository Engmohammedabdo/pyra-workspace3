import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';
import { evolutionClient } from '@/lib/evolution/client';
import { isSuperAdmin } from '@/lib/auth/rbac';

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
    });

    // Update conversation timestamps
    if (convId) {
      await supabase.from('pyra_whatsapp_conversations').update({
        last_message: content,
        last_message_at: new Date().toISOString(),
        last_agent_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', convId);
    }

    return apiSuccess({ message_id: response.key?.id, status: 'sent' });
  } catch (err) {
    return apiServerError(`فشل إرسال الرسالة: ${err instanceof Error ? err.message : ''}`);
  }
}
