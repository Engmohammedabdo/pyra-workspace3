import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { WA_MESSAGE_FIELDS } from '@/lib/supabase/fields';
import { isSuperAdmin } from '@/lib/auth/rbac';

/**
 * GET /api/dashboard/sales/whatsapp/messages
 * Fetch messages for a conversation (by conversation_id or remote_jid).
 *
 * Shared Inbox scoping:
 * - Admin: can see any conversation
 * - Agent: must be assigned to the conversation
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const sp = request.nextUrl.searchParams;

    const conversationId = sp.get('conversation_id');
    const remoteJid = sp.get('remote_jid');
    const limit = Math.min(parseInt(sp.get('limit') || '100'), 200);
    const offset = parseInt(sp.get('offset') || '0');
    const search = sp.get('search')?.trim();

    const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);

    // Scoping: verify agent can access this conversation
    if (!isAdmin && conversationId) {
      const { data: conv } = await supabase
        .from('pyra_whatsapp_conversations')
        .select('assigned_to')
        .eq('id', conversationId)
        .maybeSingle();

      // Agent can ONLY see conversations assigned to them
      if (conv && conv.assigned_to !== auth.pyraUser.username) {
        return apiSuccess([]);
      }
    }

    // Scoping: verify agent can access via remoteJid (prevent bypass)
    if (!isAdmin && remoteJid && !conversationId) {
      const { data: conv } = await supabase
        .from('pyra_whatsapp_conversations')
        .select('assigned_to')
        .eq('remote_jid', remoteJid)
        .maybeSingle();

      if (conv && conv.assigned_to !== auth.pyraUser.username) {
        return apiSuccess([]); // Agent not assigned — return empty
      }
    }

    let query = supabase
      .from('pyra_whatsapp_messages')
      .select(WA_MESSAGE_FIELDS)
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by conversation_id (preferred) or remote_jid (legacy)
    if (conversationId) {
      query = query.eq('conversation_id', conversationId);
    } else if (remoteJid) {
      query = query.eq('remote_jid', remoteJid);
    }

    if (search) {
      query = query.ilike('content', `%${search}%`);
    }

    const { data, error } = await query;
    if (error) return apiServerError(error.message);

    // Mark conversation as read when agent opens messages
    if (conversationId) {
      await supabase
        .from('pyra_whatsapp_conversations')
        .update({ unread_count: 0 })
        .eq('id', conversationId);

      // Sync read status back to WhatsApp (customer sees blue ticks)
      let jidToMark = remoteJid;
      if (!jidToMark) {
        const { data: conv } = await supabase
          .from('pyra_whatsapp_conversations')
          .select('remote_jid')
          .eq('id', conversationId)
          .maybeSingle();
        jidToMark = conv?.remote_jid || null;
      }

      if (jidToMark) {
        import('@/lib/evolution/client').then(({ evolutionClient }) => {
          evolutionClient.markChatRead('pyraai', jidToMark!).catch(() => {});
        }).catch(() => {});
      }
    }

    return apiSuccess(data);

  } catch (err) {
    console.error('[GET /api/dashboard/sales/whatsapp/messages] error:', err);
    return apiServerError();
  }
}
