import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { resolveUserScope } from '@/lib/auth/scope';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { sendQuoteSentEmail } from '@/lib/email/notify';
import { QUOTE_STATUS } from '@/lib/constants/statuses';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/quotes/[id]/send
 * Mark quote as sent, create client notification.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('quotes.edit');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);
    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: quote } = await supabase
      .from('pyra_quotes')
      .select('id, quote_number, client_id, client_name, client_email, total, currency, status')
      .eq('id', id)
      .maybeSingle();

    if (!quote) return apiNotFound('عرض السعر غير موجود');

    // Q3: Scope check — non-admins can only send quotes for their own clients
    if (!scope.isAdmin && !scope.clientIds.includes(quote.client_id)) {
      return apiForbidden('لا يمكنك إرسال عرض سعر لعميل غير مسند إليك');
    }

    // Only draft quotes can be sent
    if (quote.status !== QUOTE_STATUS.DRAFT) {
      return apiValidationError(
        `لا يمكن إرسال عرض سعر في حالة "${quote.status}". يجب أن يكون في حالة مسودة`
      );
    }

    const now = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from('pyra_quotes')
      .update({ status: QUOTE_STATUS.SENT, sent_at: now, updated_at: now })
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

    // Send email to client + capture the honest result (Group 3 — flip-and-warn).
    // The quote is ALREADY marked 'sent' above regardless of email outcome; we
    // report whether the email actually fired so the UI tells the truth instead
    // of always claiming "تم الإرسال".
    //   - no_email      → client row/quote has no email address
    //   - not_delivered → SMTP send failed OR SMTP not configured
    let email: { sent: boolean; reason?: 'no_email' | 'not_delivered'; to?: string };
    if (!quote.client_email) {
      email = { sent: false, reason: 'no_email' };
    } else {
      const ok = await sendQuoteSentEmail({
        clientEmail: quote.client_email,
        clientName: quote.client_name || '',
        quoteNumber: quote.quote_number,
        total: quote.total,
        currency: quote.currency || 'AED',
      });
      email = ok
        ? { sent: true, to: quote.client_email }
        : { sent: false, reason: 'not_delivered' };
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'quote_sent',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/quotes/${id}`,
      details: { quote_number: quote.quote_number },
      ip_address: 'server',
    });

    return apiSuccess({ ...updated, email });
  } catch (err) {
    console.error('POST /api/quotes/[id]/send error:', err);
    return apiServerError();
  }
}
