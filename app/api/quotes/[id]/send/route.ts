import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/quotes/[id]/send
 * Mark quote as sent, create client notification.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiUnauthorized();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: quote } = await supabase
      .from('pyra_quotes')
      .select('id, quote_number, client_id, client_name, total, currency, status')
      .eq('id', id)
      .maybeSingle();

    if (!quote) return apiNotFound('عرض السعر غير موجود');

    // Only draft quotes can be sent
    if (quote.status !== 'draft') {
      return apiValidationError(
        `لا يمكن إرسال عرض سعر في حالة "${quote.status}". يجب أن يكون في حالة مسودة`
      );
    }

    const now = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from('pyra_quotes')
      .update({ status: 'sent', sent_at: now, updated_at: now })
      .eq('id', id)
      .select('id, quote_number, status, sent_at')
      .single();

    if (error) {
      console.error('Quote send error:', error);
      return apiServerError();
    }

    // Create client notification if client exists
    if (quote.client_id) {
      await supabase.from('pyra_client_notifications').insert({
        id: generateId('cn'),
        client_id: quote.client_id,
        type: 'quote_sent',
        title: 'عرض سعر جديد',
        message: `تم إرسال عرض سعر جديد: ${quote.quote_number}`,
        is_read: false,
      });
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'quote_sent',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/quotes/${id}`,
      details: { quote_number: quote.quote_number },
      ip_address: 'server',
    });

    return apiSuccess(updated);
  } catch (err) {
    console.error('POST /api/quotes/[id]/send error:', err);
    return apiServerError();
  }
}
