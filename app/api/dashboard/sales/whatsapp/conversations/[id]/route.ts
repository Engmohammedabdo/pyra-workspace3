import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isSuperAdmin } from '@/lib/auth/rbac';
import { WA_CONVERSATION_FIELDS } from '@/lib/supabase/fields';
import { logActivity } from '@/lib/api/activity';
import { CONVERSATION_STATUS } from '@/lib/constants/statuses';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/dashboard/sales/whatsapp/conversations/[id]
 * Get single conversation with notes count.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const { id } = await ctx.params;
    const supabase = createServiceRoleClient();

    const { data: conv, error } = await supabase
      .from('pyra_whatsapp_conversations')
      .select(WA_CONVERSATION_FIELDS)
      .eq('id', id)
      .maybeSingle();

    if (error) return apiServerError();
    if (!conv) return apiNotFound('المحادثة غير موجودة');

    // Agent scoping: must be assigned or admin
    const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
    if (!isAdmin && conv.assigned_to !== auth.pyraUser.username && conv.assigned_to !== null) {
      return apiNotFound('المحادثة غير موجودة');
    }

    // Notes count
    const { count } = await supabase
      .from('pyra_conversation_notes')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', id);

    return apiSuccess({ ...conv, notes_count: count || 0 });

  } catch (err) {
    console.error('[GET /api/dashboard/sales/whatsapp/conversations/[id]] error:', err);
    return apiServerError();
  }
}

/**
 * PATCH /api/dashboard/sales/whatsapp/conversations/[id]
 * Update conversation status, priority, is_pinned.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const { id } = await ctx.params;
    const body = await req.json();
    const supabase = createServiceRoleClient();

    const { data: conv } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('id, assigned_to, status')
      .eq('id', id)
      .maybeSingle();

    if (!conv) return apiNotFound('المحادثة غير موجودة');

    // Agent can only update conversations assigned to them
    const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
    if (!isAdmin && conv.assigned_to !== auth.pyraUser.username) {
      return apiValidationError('لا يمكنك تعديل هذه المحادثة');
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.status !== undefined) updates.status = body.status;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.is_pinned !== undefined) updates.is_pinned = body.is_pinned;
    if (body.is_muted !== undefined) updates.is_muted = body.is_muted;
    if (body.snoozed_until !== undefined) updates.snoozed_until = body.snoozed_until;
    if (body.team_id !== undefined) updates.team_id = body.team_id;
    if (body.contact_name !== undefined) updates.contact_name = body.contact_name;
    if (body.custom_attributes !== undefined) updates.custom_attributes = body.custom_attributes;
    if (body.lead_id !== undefined) updates.lead_id = body.lead_id;

    // Set resolved_at when status changes to resolved
    const isResolving = body.status === CONVERSATION_STATUS.RESOLVED && conv.status !== CONVERSATION_STATUS.RESOLVED;
    if (isResolving) {
      updates.resolved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('pyra_whatsapp_conversations')
      .update(updates)
      .eq('id', id)
      .select(WA_CONVERSATION_FIELDS)
      .single();

    if (error) return apiServerError();

    logActivity(auth.pyraUser.username, auth.pyraUser.display_name, 'conversation_updated', '/dashboard/sales/whatsapp', { conversation_id: id });

    // Send CSAT survey message when resolving
    if (isResolving) {
      sendCsatSurvey(supabase, data).catch(err =>
        console.error('[CSAT] Failed to send survey:', err)
      );
    }

    return apiSuccess(data);

  } catch (err) {
    console.error('[PATCH /api/dashboard/sales/whatsapp/conversations/[id]] error:', err);
    return apiServerError();
  }
}

/**
 * Send CSAT survey WhatsApp message after resolving a conversation.
 * Only sends if whatsapp_csat_enabled setting is true.
 */
async function sendCsatSurvey(
  supabase: ReturnType<typeof createServiceRoleClient>,
  conversation: Record<string, unknown>
) {
  // Check if CSAT is enabled
  const { data: setting } = await supabase
    .from('pyra_settings')
    .select('value')
    .eq('key', 'whatsapp_csat_enabled')
    .maybeSingle();

  const isEnabled = setting?.value?.enabled === true;
  if (!isEnabled) return;

  const phone = conversation.contact_phone as string | null;
  if (!phone) return;

  const { evolutionClient } = await import('@/lib/evolution/client');

  const csatMessage = [
    '\u0634\u0643\u0631\u0627\u064b \u0644\u062a\u0648\u0627\u0635\u0644\u0643 \u0645\u0639\u0646\u0627! \ud83d\ude4f',
    '\u0643\u064a\u0641 \u062a\u0642\u064a\u0651\u0645 \u062a\u062c\u0631\u0628\u062a\u0643\u061f',
    '1\ufe0f\u20e3 \u0633\u064a\u0621 \u062c\u062f\u0627\u064b',
    '2\ufe0f\u20e3 \u0633\u064a\u0621',
    '3\ufe0f\u20e3 \u0645\u062a\u0648\u0633\u0637',
    '4\ufe0f\u20e3 \u062c\u064a\u062f',
    '5\ufe0f\u20e3 \u0645\u0645\u062a\u0627\u0632',
  ].join('\n');

  try {
    await evolutionClient.sendText('pyraai', {
      number: phone,
      text: csatMessage,
    });
    console.log('[CSAT] Survey sent to', phone);
  } catch (err) {
    console.error('[CSAT] Failed to send survey message:', err);
  }
}
