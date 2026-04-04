import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiNotFound } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/dashboard/sales/whatsapp/conversations/[id]/labels
 * Get labels assigned to a conversation.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const { id } = await ctx.params;
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_conversation_label_assignments')
      .select('label_id, assigned_by, assigned_at, pyra_conversation_labels(id, name, name_ar, color, description)')
      .eq('conversation_id', id);

    if (error) {
      console.error('Conversation labels query error:', error);
      return apiServerError();
    }

    // Flatten the response
    const labels = (data || []).map(row => {
      const labelData = row.pyra_conversation_labels as unknown as Record<string, unknown> | null;
      return {
        ...(labelData || {}),
        assigned_by: row.assigned_by,
        assigned_at: row.assigned_at,
      };
    });

    return apiSuccess(labels);
  } catch (err) {
    console.error('[GET /conversations/[id]/labels] error:', err);
    return apiServerError();
  }
}

/**
 * POST /api/dashboard/sales/whatsapp/conversations/[id]/labels
 * Assign a label to a conversation.
 * Body: { label_id }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const { id } = await ctx.params;
    const body = await req.json();
    const { label_id } = body;

    if (!label_id) return apiValidationError('معرف التسمية مطلوب');

    const supabase = createServiceRoleClient();

    // Verify conversation exists
    const { data: conv } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (!conv) return apiNotFound('المحادثة غير موجودة');

    // Check if already assigned
    const { data: existing } = await supabase
      .from('pyra_conversation_label_assignments')
      .select('conversation_id')
      .eq('conversation_id', id)
      .eq('label_id', label_id)
      .maybeSingle();

    if (existing) {
      return apiSuccess({ already_assigned: true });
    }

    const { error } = await supabase
      .from('pyra_conversation_label_assignments')
      .insert({
        id: generateId('cla'),
        conversation_id: id,
        label_id,
        assigned_by: auth.pyraUser.username,
      });

    if (error) {
      console.error('Assign label error:', error);
      return apiServerError();
    }

    return apiSuccess({ assigned: true }, undefined, 201);
  } catch (err) {
    console.error('[POST /conversations/[id]/labels] error:', err);
    return apiServerError();
  }
}

/**
 * DELETE /api/dashboard/sales/whatsapp/conversations/[id]/labels
 * Remove a label from a conversation.
 * Body: { label_id }
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const { id } = await ctx.params;
    const body = await req.json();
    const { label_id } = body;

    if (!label_id) return apiValidationError('معرف التسمية مطلوب');

    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from('pyra_conversation_label_assignments')
      .delete()
      .eq('conversation_id', id)
      .eq('label_id', label_id);

    if (error) {
      console.error('Remove label error:', error);
      return apiServerError();
    }

    return apiSuccess({ removed: true });
  } catch (err) {
    console.error('[DELETE /conversations/[id]/labels] error:', err);
    return apiServerError();
  }
}
