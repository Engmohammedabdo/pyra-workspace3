import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isSuperAdmin } from '@/lib/auth/rbac';
import { WA_CONVERSATION_FIELDS } from '@/lib/supabase/fields';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/dashboard/sales/whatsapp/conversations/[id]
 * Get single conversation with notes count.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
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
}

/**
 * PATCH /api/dashboard/sales/whatsapp/conversations/[id]
 * Update conversation status, priority, is_pinned.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
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

  const { data, error } = await supabase
    .from('pyra_whatsapp_conversations')
    .update(updates)
    .eq('id', id)
    .select(WA_CONVERSATION_FIELDS)
    .single();

  if (error) return apiServerError();

  return apiSuccess(data);
}
