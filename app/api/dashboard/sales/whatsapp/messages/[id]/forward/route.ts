import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/api/activity';
import { evolutionClient } from '@/lib/evolution/client';

/**
 * POST /api/dashboard/sales/whatsapp/messages/[id]/forward
 * Forward a message to another WhatsApp contact.
 * Body: { to_number: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const { id: messageId } = await params;
    const body = await request.json();
    const { to_number } = body;

    if (!to_number || typeof to_number !== 'string') {
      return apiValidationError('رقم الهاتف مطلوب');
    }

    const supabase = createServiceRoleClient();

    // Fetch the message to get message_id and instance_name
    const { data: msg, error: msgErr } = await supabase
      .from('pyra_whatsapp_messages')
      .select('message_id, instance_name')
      .eq('id', messageId)
      .single();

    if (msgErr || !msg || !msg.message_id) {
      return apiNotFound('الرسالة غير موجودة');
    }

    const instanceName = msg.instance_name || 'pyraai';

    await evolutionClient.forwardMessage(instanceName, {
      number: to_number.replace(/\D/g, ''),
      messageId: msg.message_id,
    });

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'whatsapp_message_forwarded',
      `/dashboard/sales/chat`,
      { message_id: messageId, to_number },
    );

    return apiSuccess({ forwarded: true });
  } catch (err) {
    console.error('POST forward error:', err);
    return apiServerError();
  }
}
