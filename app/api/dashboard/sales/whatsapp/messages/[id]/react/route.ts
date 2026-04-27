import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { evolutionClient } from '@/lib/evolution/client';
import { logActivity } from '@/lib/api/activity';
import { isSuperAdmin } from '@/lib/auth/rbac';
import { canAccessWhatsAppMessage } from '@/lib/auth/whatsapp-scope';

/**
 * POST /api/dashboard/sales/whatsapp/messages/[id]/react
 * Send an emoji reaction to a WhatsApp message.
 *
 * Body: { reaction: string } — emoji character or empty string to remove
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission('sales_whatsapp.view');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    const body = await request.json();
    const { reaction } = body as { reaction: string };

    if (typeof reaction !== 'string') {
      return apiError('حقل reaction مطلوب');
    }

    // Scope guard: agent must own the conversation that holds this message.
    // Previously any agent could react to any customer's messages.
    const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
    const allowed = await canAccessWhatsAppMessage(
      supabase,
      auth.pyraUser.username,
      isAdmin,
      id,
    );
    if (!allowed) return apiError('الرسالة غير موجودة', 404);

    // Fetch message to get message_id, remote_jid, and sender_jid (for groups)
    const { data: msg, error: msgErr } = await supabase
      .from('pyra_whatsapp_messages')
      .select('message_id, remote_jid, conversation_id, sender_jid, direction')
      .eq('id', id)
      .maybeSingle();

    if (msgErr || !msg) {
      return apiError('الرسالة غير موجودة', 404);
    }

    if (!msg.message_id) {
      return apiError('لا يمكن التفاعل مع هذه الرسالة');
    }

    // Send reaction via Evolution API
    // For group messages, include participant in the key
    const isGroup = msg.remote_jid.endsWith('@g.us');
    const reactionKey: Record<string, string> = {
      remoteJid: msg.remote_jid,
      id: msg.message_id,
    };
    // Group incoming messages need participant field
    if (isGroup && msg.sender_jid && msg.direction === 'incoming') {
      reactionKey.participant = msg.sender_jid;
    }
    // Group outgoing messages need fromMe flag
    if (isGroup && msg.direction === 'outgoing') {
      reactionKey.fromMe = 'true';
    }

    try {
      await evolutionClient.sendReaction('pyraai', {
        remoteJid: msg.remote_jid,
        messageId: msg.message_id,
        reaction,
      });
    } catch (evoErr) {
      console.error('[React] Evolution API error:', evoErr);
      // Still update local DB even if Evolution fails
    }

    // Update reactions JSONB in database
    const { data: currentMsg } = await supabase
      .from('pyra_whatsapp_messages')
      .select('reactions')
      .eq('id', id)
      .maybeSingle();

    const reactions: Array<{ emoji: string; from: string }> = Array.isArray(currentMsg?.reactions)
      ? currentMsg.reactions
      : [];

    const agentId = auth.pyraUser.username;
    // Remove existing reaction from this user
    const filtered = reactions.filter(r => r.from !== agentId);
    // Add new reaction (empty = remove only)
    if (reaction) {
      filtered.push({ emoji: reaction, from: agentId });
    }

    await supabase
      .from('pyra_whatsapp_messages')
      .update({ reactions: filtered })
      .eq('id', id);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'whatsapp_reaction_sent',
      '/dashboard/sales/whatsapp',
      { message_id: id, reaction },
    );

    return apiSuccess({ reactions: filtered });
  } catch (err) {
    console.error('[POST /messages/[id]/react] error:', err);
    return apiServerError();
  }
}
