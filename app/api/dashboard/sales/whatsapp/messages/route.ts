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

    // Agent can see assigned + unassigned conversations
    if (conv && conv.assigned_to !== null && conv.assigned_to !== auth.pyraUser.username) {
      return apiSuccess([]);
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
    void supabase
      .from('pyra_whatsapp_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId);
  }

  return apiSuccess(data);
}
