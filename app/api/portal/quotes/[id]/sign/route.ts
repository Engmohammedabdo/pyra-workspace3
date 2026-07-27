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
import { dubaiDayKey } from '@/lib/utils/format';
import { signQuote, MAX_SIGNATURE_LENGTH } from '@/lib/quotes/sign-quote';
import { logError } from '@/lib/observability/log-error';

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

    const signedByTrimmed = signed_by.trim();
    const ip = request.headers.get('x-forwarded-for') || 'unknown';

    // The one shared core (lib/quotes/sign-quote.ts) owns the expiry guard,
    // the status guard and the race-safe conditional update — the public
    // sign endpoint (Task 6) reuses the exact same guards via this call.
    const result = await signQuote(supabase, {
      quoteId: id,
      signatureData: signature_data,
      signedBy: signedByTrimmed,
      signedIp: ip,
      userAgent: request.headers.get('user-agent'),
      source: 'portal',
      linkId: null,
      todayKey: dubaiDayKey(),
    });

    if (!result.ok) {
      switch (result.reason) {
        case 'quote_expired':
          // Block signing expired quotes (Dubai calendar day, not UTC)
          return apiValidationError('عرض السعر منتهي الصلاحية ولا يمكن توقيعه');
        case 'already_signed':
        case 'race':
          // 'race' = a concurrent request won the conditional update first —
          // same friendly message as an already-signed quote, not an error.
          return apiValidationError('عرض السعر موقع بالفعل');
        case 'wrong_status':
          return apiValidationError(`لا يمكن توقيع عرض سعر في حالة "${quote.status}"`);
        case 'signature_too_large':
          // Unreachable in practice — the length check above already rejects
          // this before signQuote() is ever called. Kept for defense in depth.
          return apiValidationError('بيانات التوقيع غير صالحة أو كبيرة جداً');
        case 'db_error':
        default:
          // Log the real Supabase error (e.g. the append-only signature
          // trigger from migrations 054/055 raising) — `result.reason` is
          // just the literal string 'db_error' and tells an operator nothing.
          logError({
            error: result.error,
            request,
            metadata: { route: 'portal-quotes-sign', quoteId: id },
          });
          return apiServerError();
      }
    }

    const signed = result.quote;
    const responsePayload = {
      id: signed.id,
      quote_number: signed.quote_number,
      status: signed.status,
      signed_by: signed.signed_by,
      signed_at: signed.signed_at,
    };

    // Notify via activity log
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'quote_signed',
      username: session.name,
      display_name: session.name,
      target_path: `/quotes/${id}`,
      details: { quote_number: quote.quote_number, signed_by: signedByTrimmed },
      ip_address: ip,
    });

    // Notify agent + admins via email (fire-and-forget)
    if (quote.created_by) {
      notifyQuoteSigned({
        createdBy: quote.created_by,
        quoteNumber: quote.quote_number,
        quoteId: id,
        signedBy: signedByTrimmed,
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
        message: `تم توقيع عرض السعر ${quote.quote_number} بواسطة ${signedByTrimmed}`,
        link: `/dashboard/quotes/${id}`,
        entity: { type: 'quote', id },
      });
    }

    return apiSuccess(responsePayload);
  } catch (err) {
    console.error('POST /api/portal/quotes/[id]/sign error:', err);
    return apiServerError();
  }
}
