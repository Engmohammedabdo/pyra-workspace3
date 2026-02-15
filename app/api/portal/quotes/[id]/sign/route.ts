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
    if (!signed_by?.trim()) return apiValidationError('اسم الموقع مطلوب');

    const supabase = createServiceRoleClient();

    const { data: quote } = await supabase
      .from('pyra_quotes')
      .select('id, client_id, quote_number, status')
      .eq('id', id)
      .maybeSingle();

    if (!quote) return apiNotFound('عرض السعر غير موجود');
    if (quote.client_id !== session.id) return apiForbidden();

    if (quote.status === 'signed') {
      return apiValidationError('عرض السعر موقع بالفعل');
    }

    const now = new Date().toISOString();
    const ip = request.headers.get('x-forwarded-for') || 'unknown';

    const { data: updated, error } = await supabase
      .from('pyra_quotes')
      .update({
        status: 'signed',
        signature_data,
        signed_by: signed_by.trim(),
        signed_at: now,
        signed_ip: ip,
        updated_at: now,
      })
      .eq('id', id)
      .select('id, quote_number, status, signed_by, signed_at')
      .single();

    if (error) {
      console.error('Quote sign error:', error);
      return apiServerError();
    }

    // Notify via activity log
    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'quote_signed',
      username: session.name,
      display_name: session.name,
      target_path: `/quotes/${id}`,
      details: { quote_number: quote.quote_number, signed_by: signed_by.trim() },
      ip_address: ip,
    });

    return apiSuccess(updated);
  } catch (err) {
    console.error('POST /api/portal/quotes/[id]/sign error:', err);
    return apiServerError();
  }
}
