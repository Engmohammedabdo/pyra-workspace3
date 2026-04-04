import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { WA_CONVERSATION_FIELDS } from '@/lib/supabase/fields';
import { logActivity } from '@/lib/api/activity';
import { CONVERSATION_STATUS } from '@/lib/constants/statuses';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/dashboard/sales/whatsapp/conversations/[id]/merge
 * Merge another conversation into this one (primary).
 * Moves all messages + notes from secondary → primary, then resolves secondary.
 * Admin only.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.manage');
    if (isApiError(auth)) return auth;

    const { id: primaryId } = await ctx.params;
    const body = await req.json();
    const secondaryId = body.merge_with_id;

    if (!secondaryId) return apiValidationError('merge_with_id مطلوب');
    if (primaryId === secondaryId) return apiValidationError('لا يمكن دمج المحادثة مع نفسها');

    const supabase = createServiceRoleClient();

    // Verify both conversations exist
    const [{ data: primary }, { data: secondary }] = await Promise.all([
      supabase.from('pyra_whatsapp_conversations').select('id, contact_phone').eq('id', primaryId).maybeSingle(),
      supabase.from('pyra_whatsapp_conversations').select('id, contact_phone').eq('id', secondaryId).maybeSingle(),
    ]);

    if (!primary) return apiNotFound('المحادثة الأساسية غير موجودة');
    if (!secondary) return apiNotFound('المحادثة المطلوب دمجها غير موجودة');

    // Move all messages from secondary to primary
    const { error: msgError } = await supabase
      .from('pyra_whatsapp_messages')
      .update({ conversation_id: primaryId })
      .eq('conversation_id', secondaryId);

    if (msgError) {
      console.error('Merge messages error:', msgError);
      return apiServerError();
    }

    // Move all notes from secondary to primary
    const { error: noteError } = await supabase
      .from('pyra_conversation_notes')
      .update({ conversation_id: primaryId })
      .eq('conversation_id', secondaryId);

    if (noteError) {
      console.error('Merge notes error:', noteError);
      // Non-critical, continue
    }

    // Mark secondary as merged + resolved
    const { error: updateError } = await supabase
      .from('pyra_whatsapp_conversations')
      .update({
        merged_into_id: primaryId,
        status: CONVERSATION_STATUS.RESOLVED,
        updated_at: new Date().toISOString(),
      })
      .eq('id', secondaryId);

    if (updateError) {
      console.error('Merge update secondary error:', updateError);
      return apiServerError();
    }

    // Refresh primary conversation data
    const { data: updatedPrimary } = await supabase
      .from('pyra_whatsapp_conversations')
      .select(WA_CONVERSATION_FIELDS)
      .eq('id', primaryId)
      .single();

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'conversation_merged',
      '/dashboard/sales/whatsapp',
      { primary_id: primaryId, secondary_id: secondaryId }
    );

    return apiSuccess(updatedPrimary);

  } catch (err) {
    console.error('[POST /api/dashboard/sales/whatsapp/conversations/[id]/merge] error:', err);
    return apiServerError();
  }
}
