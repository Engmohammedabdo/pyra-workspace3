import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { isSuperAdmin } from '@/lib/auth/rbac';

/**
 * GET conversations — returns distinct contacts with last message and unread count.
 */
export async function GET() {
  const auth = await requireApiPermission('sales_whatsapp.view');
  if (isApiError(auth)) return auth;

  const supabase = await createServerSupabaseClient();

  // Agent scoping
  const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
  let instanceFilter: string[] | null = null;

  if (!isAdmin) {
    const { data: agentInstances } = await supabase
      .from('pyra_whatsapp_instances')
      .select('instance_name')
      .eq('agent_username', auth.pyraUser.username);
    instanceFilter = (agentInstances || []).map((i: { instance_name: string }) => i.instance_name);
    if (instanceFilter.length === 0) return apiSuccess([]);
  }

  // Fetch messages ordered by timestamp (limit to recent 5000 to avoid loading 10K+ rows)
  let query = supabase
    .from('pyra_whatsapp_messages')
    .select('id, instance_name, remote_jid, lead_id, client_id, direction, content, message_type, status, timestamp, contact_name, metadata')
    .order('timestamp', { ascending: false })
    .limit(5000);

  if (instanceFilter) {
    query = query.in('instance_name', instanceFilter);
  }

  const { data: messages, error } = await query;
  if (error) return apiServerError(error.message);

  // Group by remote_jid
  const conversationMap = new Map<string, {
    remote_jid: string;
    instance_name: string;
    lead_id: string | null;
    client_id: string | null;
    contact_name: string | null;
    phone: string | null;
    last_message: string | null;
    last_message_type: string;
    last_timestamp: string;
    unread_count: number;
    total_messages: number;
  }>();

  for (const msg of messages || []) {
    const jid = msg.remote_jid;
    if (!conversationMap.has(jid)) {
      const meta = (msg.metadata || {}) as Record<string, unknown>;
      const pushName = msg.contact_name || (meta.pushName as string) || null;

      // Extract phone: from metadata.phone (set by webhook/sync), or from JID
      let phone = (meta.phone as string) || null;
      if (!phone) {
        // Try remoteJidAlt first (real phone when JID is @lid)
        const altJid = (meta.remoteJidAlt as string) || '';
        if (altJid) {
          phone = altJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        } else if (jid.includes('@s.whatsapp.net') || jid.includes('@c.us')) {
          phone = jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        }
      }

      conversationMap.set(jid, {
        remote_jid: jid,
        instance_name: msg.instance_name,
        lead_id: msg.lead_id,
        client_id: msg.client_id,
        contact_name: pushName,
        phone,
        last_message: msg.content,
        last_message_type: msg.message_type,
        last_timestamp: msg.timestamp,
        unread_count: 0,
        total_messages: 0,
      });
    }

    const conv = conversationMap.get(jid)!;
    conv.total_messages++;
    if (msg.direction === 'incoming' && msg.status !== 'read') {
      conv.unread_count++;
    }
    // Keep lead/client association if any message has it
    if (msg.lead_id && !conv.lead_id) conv.lead_id = msg.lead_id;
    if (msg.client_id && !conv.client_id) conv.client_id = msg.client_id;
    // Keep contact name from column or metadata
    if (!conv.contact_name) {
      const name = msg.contact_name || ((msg.metadata || {}) as Record<string, unknown>).pushName as string;
      if (name) conv.contact_name = name;
    }
    // Keep phone from metadata
    if (!conv.phone) {
      const meta = (msg.metadata || {}) as Record<string, unknown>;
      const phone = (meta.phone as string) || (meta.remoteJidAlt as string)?.replace('@s.whatsapp.net', '').replace('@c.us', '') || null;
      if (phone) conv.phone = phone;
    }
  }

  // Sort by last_timestamp desc
  const conversations = Array.from(conversationMap.values())
    .sort((a, b) => new Date(b.last_timestamp).getTime() - new Date(a.last_timestamp).getTime());

  return apiSuccess(conversations);
}
