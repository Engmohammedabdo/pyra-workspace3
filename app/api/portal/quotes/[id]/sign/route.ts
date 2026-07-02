import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { notifyQuoteSigned } from '@/lib/email/notify';
import { notify } from '@/lib/notifications/notify';
import { QUOTE_STATUS } from '@/lib/constants/statuses';
import { dubaiDayKey } from '@/lib/utils/format';

// Signature payloads are data-URIs — cap size so a client cannot persist
// megabytes of arbitrary text per quote (finance audit 2026-07-02, F-12).
const MAX_SIGNATURE_LENGTH = 500_000; // ~500 KB

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/portal/quotes/[id]/sign
 * Sign a quote with signature data.
 * Body: { signature_data: string, signed_by: string }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getPortalSession();
    if (!session) return apiUnauthorized();

    const { id } = await context.params;
    const body = await request.json();
    const { signature_data, signed_by } = body;

    if (!signature_data) return apiValidationError('التوقيع مطلوب');
    if (typeof signature_data !== 'string' || signature_data.length > MAX_SIGNATURE_LENGTH) {
      return apiValidationError('بيانات التوقيع غير صالحة أو كبيرة جداً');
    }
    if (!signed_by?.trim()) return apiValidationError('اسم الموقع مطلوب');

    const supabase = createServiceRoleClient();

    const { data: quote } = await supabase
      .from('pyra_quotes')
      .select('id, client_id, client_company, quote_number, status, expiry_date, total, currency, created_by')
      .eq('id', id)
      .maybeSingle();

    if (!quote) return apiNotFound('عرض السعر غير موجود');
    if (!quote.client_id || quote.client_id !== session.id) {
      return apiForbidden('ليس لديك صلاحية لتوقيع هذا العرض');
    }

    // Block signing expired quotes (Dubai calendar day, not UTC)
    if (quote.expiry_date && quote.expiry_date < dubaiDayKey()) {
      return apiValidationError('عرض السعر منتهي الصلاحية ولا يمكن توقيعه');
    }

    // Only sent or viewed quotes can be signed
    if (!['sent', 'viewed'].includes(quote.status)) {
      return apiValidationError(
        quote.status === 'signed'
          ? 'عرض السعر موقع بالفعل'
          : `لا يمكن توقيع عرض سعر في حالة "${quote.status}"`
      );
    }

    const now = new Date().toISOString();
    const ip = request.headers.get('x-forwarded-for') || 'unknown';

    // Conditional update — two concurrent sign requests both pass the status
    // guard above; the .in('status') filter lets exactly one win instead of
    // the second silently overwriting the first signature.
    const { data: updated, error } = await supabase
      .from('pyra_quotes')
      .update({
        status: QUOTE_STATUS.SIGNED,
        signature_data,
        signed_by: signed_by.trim(),
        signed_at: now,
        signed_ip: ip,
        updated_at: now,
      })
      .eq('id', id)
      .in('status', [QUOTE_STATUS.SENT, QUOTE_STATUS.VIEWED])
      .select('id, quote_number, status, signed_by, signed_at')
      .maybeSingle();

    if (error) {
      console.error('Quote sign error:', error);
      return apiServerError();
    }
    if (!updated) {
      return apiValidationError('عرض السعر موقع بالفعل');
    }

    // Notify via activity log
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'quote_signed',
      username: session.name,
      display_name: session.name,
      target_path: `/quotes/${id}`,
      details: { quote_number: quote.quote_number, signed_by: signed_by.trim() },
      ip_address: ip,
    });

    // Notify agent + admins via email (fire-and-forget)
    if (quote.created_by) {
      notifyQuoteSigned({
        createdBy: quote.created_by,
        quoteNumber: quote.quote_number,
        quoteId: id,
        signedBy: signed_by.trim(),
        total: quote.total || 0,
        currency: quote.currency || 'AED',
      });
    }

    // In-app notification for the creating agent. Finance audit 2026-07-02
    // (F-SIGN-NOTIF): the previous direct insert used a non-existent `link`
    // column (real name: target_path) and failed silently on EVERY signature
    // — exactly the failure class the central notify() helper eliminates.
    if (quote.created_by) {
      await notify(supabase, {
        to: quote.created_by,
        type: 'quote_signed',
        title: 'تم توقيع عرض السعر',
        message: `تم توقيع عرض السعر ${quote.quote_number} بواسطة ${signed_by.trim()}`,
        link: `/dashboard/quotes/${id}`,
        entity: { type: 'quote', id },
      });
    }

    return apiSuccess(updated);
  } catch (err) {
    console.error('POST /api/portal/quotes/[id]/sign error:', err);
    return apiServerError();
  }
}
