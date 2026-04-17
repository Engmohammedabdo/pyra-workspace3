import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { evolutionClient } from '@/lib/evolution/client';
import { generateId } from '@/lib/utils/id';

/**
 * GET /api/dashboard/sales/whatsapp/groups
 * List group conversations from DB
 */
export async function GET() {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();

    const { data: groups, error } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('id, remote_jid, group_subject, group_description, group_owner, group_picture_url, participant_count, group_settings, status, created_at')
      .eq('is_group', true)
      .order('group_subject', { ascending: true });

    if (error) {
      console.error('Groups list error:', error);
      return apiServerError();
    }

    return apiSuccess(groups || []);
  } catch (err) {
    console.error('GET /api/dashboard/sales/whatsapp/groups error:', err);
    return apiServerError();
  }
}

/**
 * POST /api/dashboard/sales/whatsapp/groups/sync
 * Sync all groups from Evolution API into DB
 */
export async function POST(_request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const instanceName = 'pyraai';

    // Fetch all groups from Evolution API with participants
    const groups = await evolutionClient.fetchAllGroups(instanceName, true);

    if (!groups || groups.length === 0) {
      return apiSuccess({ synced: 0, message: 'No groups found' });
    }

    let synced = 0;

    for (const group of groups) {
      if (!group.id) continue;

      // Upsert conversation
      const { data: existing } = await supabase
        .from('pyra_whatsapp_conversations')
        .select('id')
        .eq('remote_jid', group.id)
        .eq('instance_name', instanceName)
        .maybeSingle();

      const convId = existing?.id || generateId('conv');

      await supabase.from('pyra_whatsapp_conversations').upsert({
        id: convId,
        remote_jid: group.id,
        instance_name: instanceName,
        is_group: true,
        contact_name: group.subject || group.id,
        contact_phone: null,
        group_subject: group.subject || null,
        group_description: group.desc || null,
        group_owner: group.owner || null,
        group_picture_url: group.pictureUrl || null,
        participant_count: group.size || group.participants?.length || 0,
        group_settings: {
          restrict: group.restrict || false,
          announce: group.announce || false,
        },
        status: existing ? undefined : 'open',
        priority: existing ? undefined : 'normal',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'remote_jid,instance_name' });

      // Sync participants
      if (group.participants && group.participants.length > 0) {
        for (const p of group.participants) {
          const phone = p.id.replace('@s.whatsapp.net', '').replace('@lid', '');
          await supabase.from('pyra_whatsapp_group_participants').upsert({
            id: generateId('gp'),
            conversation_id: convId,
            participant_jid: p.id,
            phone,
            role: p.admin || 'member',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'conversation_id,participant_jid' });
        }
      }

      // Sync recent messages for this group
      try {
        const messages = await evolutionClient.fetchMessages(instanceName, group.id, 50);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msgArray = Array.isArray(messages) ? messages : ((messages as any)?.messages?.records || []);

        if (Array.isArray(msgArray) && msgArray.length > 0) {
          // Get existing message IDs to avoid duplicates
          const { data: existingMsgs } = await supabase
            .from('pyra_whatsapp_messages')
            .select('message_id')
            .eq('remote_jid', group.id);
          const existingIds = new Set((existingMsgs || []).map(m => m.message_id).filter(Boolean));

          const newMessages = [];
          let lastMsg = '';
          let lastMsgAt = '';

          for (const msg of msgArray) {
            const key = msg.key || {};
            const messageId = key.id;
            if (!messageId || existingIds.has(messageId)) continue;
            if (key.remoteJid !== group.id) continue;

            const fromMe = key.fromMe || false;
            const senderJid = key.participant || null;
            const senderName = msg.pushName || null;
            const msgContent = msg.message;

            // Extract text content
            let text = '';
            let messageType = 'text';
            if (msgContent?.conversation) text = msgContent.conversation;
            else if (msgContent?.extendedTextMessage?.text) text = msgContent.extendedTextMessage.text;
            else if (msgContent?.imageMessage) { messageType = 'image'; text = msgContent.imageMessage.caption || ''; }
            else if (msgContent?.videoMessage) { messageType = 'video'; text = msgContent.videoMessage.caption || ''; }
            else if (msgContent?.audioMessage) { messageType = 'audio'; }
            else if (msgContent?.documentMessage) { messageType = 'document'; text = msgContent.documentMessage.fileName || ''; }
            else if (msgContent?.stickerMessage) { messageType = 'sticker'; }

            const timestamp = msg.messageTimestamp
              ? new Date(typeof msg.messageTimestamp === 'number'
                  ? msg.messageTimestamp * 1000
                  : Number(msg.messageTimestamp) * 1000
                ).toISOString()
              : new Date().toISOString();

            newMessages.push({
              id: generateId('wm'),
              instance_name: instanceName,
              remote_jid: group.id,
              conversation_id: convId,
              message_id: messageId,
              direction: fromMe ? 'outgoing' : 'incoming',
              message_type: messageType,
              content: text || null,
              sender_jid: senderJid,
              sender_name: senderName,
              contact_name: senderName,
              status: fromMe ? 'sent' : 'received',
              timestamp,
              file_name: msgContent?.documentMessage?.fileName || null,
              metadata: { pushName: senderName, isGroup: true },
            });

            // Track last message for conversation update
            if (!lastMsgAt || timestamp > lastMsgAt) {
              lastMsgAt = timestamp;
              lastMsg = senderName ? `${senderName}: ${text || `[${messageType}]`}` : (text || `[${messageType}]`);
            }
          }

          // Batch insert messages
          if (newMessages.length > 0) {
            await supabase.from('pyra_whatsapp_messages').insert(newMessages);

            // Update conversation with last message info
            if (lastMsg && lastMsgAt) {
              await supabase.from('pyra_whatsapp_conversations').update({
                last_message: lastMsg,
                last_message_at: lastMsgAt,
                updated_at: new Date().toISOString(),
              }).eq('id', convId);
            }
          }
        }
      } catch (msgErr) {
        console.error(`[Group Sync] Failed to sync messages for ${group.subject}:`, msgErr);
        // Don't fail the whole sync — continue with next group
      }

      synced++;
    }

    return apiSuccess({ synced, total: groups.length });
  } catch (err) {
    console.error('POST /api/dashboard/sales/whatsapp/groups/sync error:', err);
    return apiServerError();
  }
}
