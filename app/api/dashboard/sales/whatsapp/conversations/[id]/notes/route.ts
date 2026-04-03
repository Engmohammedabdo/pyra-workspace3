import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { CONVERSATION_NOTE_FIELDS } from '@/lib/supabase/fields';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/dashboard/sales/whatsapp/conversations/[id]/notes
 * List internal notes for a conversation.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireApiPermission('sales_whatsapp.view');
  if (isApiError(auth)) return auth;

  const { id } = await ctx.params;
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('pyra_conversation_notes')
    .select(CONVERSATION_NOTE_FIELDS)
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });

  if (error) return apiServerError();

  return apiSuccess(data || []);
}

/**
 * POST /api/dashboard/sales/whatsapp/conversations/[id]/notes
 * Create an internal note (NOT sent to WhatsApp).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireApiPermission('sales_whatsapp.send');
  if (isApiError(auth)) return auth;

  const { id } = await ctx.params;
  const body = await req.json();
  const content = body.content?.trim();

  if (!content) return apiValidationError('محتوى الملاحظة مطلوب');

  const supabase = createServiceRoleClient();

  // Verify conversation exists
  const { data: conv } = await supabase
    .from('pyra_whatsapp_conversations')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (!conv) return apiNotFound('المحادثة غير موجودة');

  const { data: note, error } = await supabase
    .from('pyra_conversation_notes')
    .insert({
      id: generateId('cn'),
      conversation_id: id,
      author_username: auth.pyraUser.username,
      author_display_name: auth.pyraUser.display_name,
      content,
    })
    .select(CONVERSATION_NOTE_FIELDS)
    .single();

  if (error) return apiServerError();

  return apiSuccess(note, undefined, 201);
}
