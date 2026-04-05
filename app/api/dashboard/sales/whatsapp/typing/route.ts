import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { evolutionClient } from '@/lib/evolution/client';

/**
 * POST /api/dashboard/sales/whatsapp/typing
 * Send typing indicator to a WhatsApp contact.
 *
 * Body: { conversation_id: string, is_typing: boolean }
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiPermission('sales_whatsapp.view');
  if (isApiError(auth)) return auth;

  try {
    const body = await request.json();
    const { conversation_id, is_typing } = body as {
      conversation_id: string;
      is_typing: boolean;
    };

    if (!conversation_id) {
      return apiError('conversation_id مطلوب');
    }

    const supabase = createServiceRoleClient();

    // Look up conversation's remote_jid
    const { data: conv } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('remote_jid')
      .eq('id', conversation_id)
      .maybeSingle();

    if (!conv?.remote_jid) {
      return apiError('المحادثة غير موجودة', 404);
    }

    // Send presence to WhatsApp
    await evolutionClient.sendPresence(
      'pyraai',
      conv.remote_jid,
      is_typing ? 'composing' : 'paused',
    );

    return apiSuccess({ ok: true });
  } catch (err) {
    console.error('[POST /typing] error:', err);
    return apiServerError();
  }
}
