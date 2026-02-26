import { NextRequest } from 'next/server';
import { getExternalAuth, hasPermission } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { INVOICE_FIELDS } from '@/lib/supabase/fields';
import { dispatchWebhookEvent } from '@/lib/webhooks/dispatcher';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/external/invoices/[id]/send
 * Mark a draft invoice as "sent" via External API.
 * Auth: API key with 'invoices:send' permission
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    if (!hasPermission(ctx, 'invoices:send')) return apiError('لا تملك صلاحية إرسال الفواتير', 403);

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: invoice } = await supabase
      .from('pyra_invoices')
      .select('id, status, invoice_number, client_id, client_name')
      .eq('id', id)
      .maybeSingle();

    if (!invoice) return apiError('الفاتورة غير موجودة', 404);
    if (invoice.status !== 'draft') {
      return apiError('يمكن إرسال المسودات فقط', 422);
    }

    const { data: updated, error } = await supabase
      .from('pyra_invoices')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(INVOICE_FIELDS)
      .single();

    if (error) throw error;

    // Create client notification
    if (invoice.client_id) {
      await supabase.from('pyra_client_notifications').insert({
        id: generateId('cn'),
        client_id: invoice.client_id,
        type: 'invoice_sent',
        title: 'فاتورة جديدة',
        message: `تم إرسال فاتورة ${invoice.invoice_number} إليك`,
        is_read: false,
      });
    }

    // Activity log
    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'invoice_sent',
      username: 'api',
      display_name: ctx.apiKey.name,
      target_path: `/dashboard/invoices/${id}`,
      details: { invoice_number: invoice.invoice_number, client_name: invoice.client_name },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    dispatchWebhookEvent('invoice_sent', { invoice_id: id, invoice_number: invoice.invoice_number, client_name: invoice.client_name });

    return apiSuccess(updated);
  } catch {
    return apiServerError();
  }
}
