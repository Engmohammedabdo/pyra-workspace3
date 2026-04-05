import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/api/activity';

type Ctx = { params: Promise<{ conversationId: string }> };

/**
 * GET /api/dashboard/sales/whatsapp/csat/[conversationId]
 * Get CSAT survey for a specific conversation.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const { conversationId } = await ctx.params;
    const supabase = createServiceRoleClient();

    const { data: survey, error } = await supabase
      .from('pyra_csat_surveys')
      .select('*')
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (error) {
      console.error('[GET /csat/[conversationId]] error:', error.message);
      return apiServerError();
    }

    if (!survey) return apiNotFound('لا يوجد تقييم لهذه المحادثة');

    return apiSuccess(survey);
  } catch (err) {
    console.error('[GET /csat/[conversationId]] error:', err);
    return apiServerError();
  }
}

/**
 * PATCH /api/dashboard/sales/whatsapp/csat/[conversationId]
 * Update CSAT rating/comment for a specific conversation.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const { conversationId } = await ctx.params;
    const body = await req.json();
    const supabase = createServiceRoleClient();

    const updates: Record<string, unknown> = {};
    if (body.rating !== undefined) {
      if (body.rating < 1 || body.rating > 5) return apiValidationError('التقييم يجب أن يكون بين 1 و 5');
      updates.rating = body.rating;
    }
    if (body.comment !== undefined) updates.comment = body.comment;

    if (Object.keys(updates).length === 0) {
      return apiValidationError('لا توجد تحديثات');
    }

    const { data: survey, error } = await supabase
      .from('pyra_csat_surveys')
      .update(updates)
      .eq('conversation_id', conversationId)
      .select()
      .single();

    if (error) {
      console.error('[PATCH /csat/[conversationId]] error:', error.message);
      return apiNotFound('لا يوجد تقييم لهذه المحادثة');
    }

    // Sync csat_rating on conversation
    if (body.rating !== undefined) {
      await supabase
        .from('pyra_whatsapp_conversations')
        .update({ csat_rating: body.rating })
        .eq('id', conversationId);
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'csat_updated',
      `/dashboard/sales/whatsapp/csat/${conversationId}`,
      { conversation_id: conversationId, ...updates }
    );

    return apiSuccess(survey);
  } catch (err) {
    console.error('[PATCH /csat/[conversationId]] error:', err);
    return apiServerError();
  }
}
