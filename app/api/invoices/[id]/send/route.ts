import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { INVOICE_FIELDS } from '@/lib/supabase/fields';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/invoices/[id]/send
 * Mark a draft invoice as "sent" and notify the client.
 * Admin only.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: invoice } = await supabase
      .from('pyra_invoices')
      .select('id, status, invoice_number, client_id, client_name')
      .eq('id', id)
      .maybeSingle();

    if (!invoice) return apiNotFound('الفاتورة غير موجودة');
    if (invoice.status !== 'draft') {
      return apiValidationError('يمكن إرسال المسودات فقط');
    }

    const { data: updated, error } = await supabase
      .from('pyra_invoices')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(INVOICE_FIELDS)
      .single();

    if (error) {
      console.error('Invoice send error:', error);
      return apiServerError();
    }

    // Create client notification
    if (invoice.client_id) {
      const { error: nErr } = await supabase
        .from('pyra_client_notifications')
        .insert({
          id: generateId('cn'),
          client_id: invoice.client_id,
          type: 'invoice_sent',
          title: 'فاتورة جديدة',
          message: `تم إرسال فاتورة ${invoice.invoice_number} إليك`,
          is_read: false,
        });
      if (nErr) console.error('Invoice notification error:', nErr);
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'invoice_sent',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/dashboard/invoices/${id}`,
      details: { invoice_number: invoice.invoice_number, client_name: invoice.client_name },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(updated);
  } catch (err) {
    console.error('POST /api/invoices/[id]/send error:', err);
    return apiServerError();
  }
}
