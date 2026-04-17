import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError, apiError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { evolutionClient } from '@/lib/evolution/client';
import { generateId } from '@/lib/utils/id';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/dashboard/sales/whatsapp/groups/[id]/participants
 * List group participants
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    // Verify group exists
    const { data: group } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('id, remote_jid')
      .eq('id', id)
      .eq('is_group', true)
      .maybeSingle();

    if (!group) return apiNotFound('المجموعة غير موجودة');

    const { data: participants, error } = await supabase
      .from('pyra_whatsapp_group_participants')
      .select('*')
      .eq('conversation_id', id)
      .order('role', { ascending: true })
      .order('phone', { ascending: true });

    if (error) return apiServerError();

    return apiSuccess(participants || []);
  } catch (err) {
    console.error('GET participants error:', err);
    return apiServerError();
  }
}

/**
 * POST /api/dashboard/sales/whatsapp/groups/[id]/participants
 * Add/remove/promote/demote group participants
 * Body: { action: 'add'|'remove'|'promote'|'demote', participants: string[] }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const { id } = await context.params;
    const body = await request.json();
    const { action, participants } = body;

    if (!action || !participants || !Array.isArray(participants) || participants.length === 0) {
      return apiError('action and participants[] are required');
    }

    if (!['add', 'remove', 'promote', 'demote'].includes(action)) {
      return apiError('Invalid action. Use: add, remove, promote, demote');
    }

    const supabase = createServiceRoleClient();

    const { data: group } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('id, remote_jid, instance_name')
      .eq('id', id)
      .eq('is_group', true)
      .maybeSingle();

    if (!group) return apiNotFound('المجموعة غير موجودة');

    const instanceName = group.instance_name || 'pyraai';

    // Call Evolution API
    await evolutionClient.updateGroupParticipants(
      instanceName,
      group.remote_jid,
      action,
      participants
    );

    // Update local DB
    if (action === 'add') {
      for (const phone of participants) {
        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        await supabase.from('pyra_whatsapp_group_participants').upsert({
          id: generateId('gp'),
          conversation_id: id,
          participant_jid: jid,
          phone: phone.replace('@s.whatsapp.net', ''),
          role: 'member',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'conversation_id,participant_jid' });
      }
    } else if (action === 'remove') {
      const jids = participants.map(p => p.includes('@') ? p : `${p}@s.whatsapp.net`);
      await supabase.from('pyra_whatsapp_group_participants')
        .delete()
        .eq('conversation_id', id)
        .in('participant_jid', jids);
    } else if (action === 'promote') {
      const jids = participants.map(p => p.includes('@') ? p : `${p}@s.whatsapp.net`);
      await supabase.from('pyra_whatsapp_group_participants')
        .update({ role: 'admin', updated_at: new Date().toISOString() })
        .eq('conversation_id', id)
        .in('participant_jid', jids);
    } else if (action === 'demote') {
      const jids = participants.map(p => p.includes('@') ? p : `${p}@s.whatsapp.net`);
      await supabase.from('pyra_whatsapp_group_participants')
        .update({ role: 'member', updated_at: new Date().toISOString() })
        .eq('conversation_id', id)
        .in('participant_jid', jids);
    }

    // Update participant count
    const { count } = await supabase
      .from('pyra_whatsapp_group_participants')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', id);

    await supabase.from('pyra_whatsapp_conversations').update({
      participant_count: count || 0,
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    return apiSuccess({ action, affected: participants.length });
  } catch (err) {
    console.error('POST participants error:', err);
    return apiServerError();
  }
}
