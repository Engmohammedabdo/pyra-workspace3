import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { WA_MESSAGE_FIELDS } from '@/lib/supabase/fields';
import { isSuperAdmin } from '@/lib/auth/rbac';

export async function GET(request: NextRequest) {
  const auth = await requireApiPermission('sales_whatsapp.view');
  if (isApiError(auth)) return auth;

  const supabase = await createServerSupabaseClient();
  const { searchParams } = new URL(request.url);
  const remoteJid = searchParams.get('remote_jid');
  const leadId = searchParams.get('lead_id');
  const instanceName = searchParams.get('instance_name');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
  const offset = parseInt(searchParams.get('offset') || '0');

  let query = supabase
    .from('pyra_whatsapp_messages')
    .select(WA_MESSAGE_FIELDS)
    .order('timestamp', { ascending: false })
    .range(offset, offset + limit - 1);

  // Agent scoping: only show messages from agent's instance
  const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
  if (!isAdmin) {
    const { data: agentInstances } = await supabase
      .from('pyra_whatsapp_instances')
      .select('instance_name')
      .eq('agent_username', auth.pyraUser.username);
    const instanceNames = (agentInstances || []).map((i: { instance_name: string }) => i.instance_name);
    if (instanceNames.length > 0) {
      query = query.in('instance_name', instanceNames);
    } else {
      return apiSuccess([]);
    }
  }

  if (remoteJid) query = query.eq('remote_jid', remoteJid);
  if (leadId) query = query.eq('lead_id', leadId);
  if (instanceName) query = query.eq('instance_name', instanceName);

  const { data, error } = await query;
  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}
