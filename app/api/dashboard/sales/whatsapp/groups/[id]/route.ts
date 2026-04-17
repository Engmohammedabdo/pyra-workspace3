import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { evolutionClient } from '@/lib/evolution/client';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/dashboard/sales/whatsapp/groups/[id]
 * Get group info + participants
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: group, error } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('*')
      .eq('id', id)
      .eq('is_group', true)
      .maybeSingle();

    if (error || !group) return apiNotFound('المجموعة غير موجودة');

    // Fetch participants
    const { data: participants } = await supabase
      .from('pyra_whatsapp_group_participants')
      .select('*')
      .eq('conversation_id', id)
      .order('role', { ascending: true });

    return apiSuccess({ ...group, participants: participants || [] });
  } catch (err) {
    console.error('GET /api/dashboard/sales/whatsapp/groups/[id] error:', err);
    return apiServerError();
  }
}

/**
 * PATCH /api/dashboard/sales/whatsapp/groups/[id]
 * Update group subject/description via Evolution API
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const { id } = await context.params;
    const body = await request.json();
    const { subject, description } = body;
    const supabase = createServiceRoleClient();

    const { data: group } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('remote_jid, instance_name')
      .eq('id', id)
      .eq('is_group', true)
      .maybeSingle();

    if (!group) return apiNotFound('المجموعة غير موجودة');

    const instanceName = group.instance_name || 'pyraai';
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (subject !== undefined) {
      await evolutionClient.updateGroupSubject(instanceName, group.remote_jid, subject);
      updates.group_subject = subject;
      updates.contact_name = subject;
    }

    if (description !== undefined) {
      await evolutionClient.updateGroupDescription(instanceName, group.remote_jid, description);
      updates.group_description = description;
    }

    await supabase.from('pyra_whatsapp_conversations').update(updates).eq('id', id);

    return apiSuccess({ updated: true });
  } catch (err) {
    console.error('PATCH /api/dashboard/sales/whatsapp/groups/[id] error:', err);
    return apiServerError();
  }
}
