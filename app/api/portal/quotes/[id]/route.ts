import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiForbidden,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/portal/quotes/[id]
 * Get a quote detail. Auto-marks as 'viewed' on first access.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await getPortalSession();
    if (!session) return apiUnauthorized();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: quote, error } = await supabase
      .from('pyra_quotes')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Portal quote fetch error:', error);
      return apiServerError();
    }
    if (!quote) return apiNotFound('عرض السعر غير موجود');

    // Verify client owns this quote
    if (quote.client_id !== session.id) {
      return apiForbidden();
    }

    // Auto-mark as viewed on first access
    if (quote.status === 'sent' && !quote.viewed_at) {
      const now = new Date().toISOString();
      await supabase
        .from('pyra_quotes')
        .update({ status: 'viewed', viewed_at: now, updated_at: now })
        .eq('id', id);
      quote.status = 'viewed';
      quote.viewed_at = now;

      // ── Log quote viewed activity ──────────────────
      void supabase.from('pyra_activity_log').insert({
        id: generateId('al'),
        action_type: 'quote_viewed',
        username: session.email || session.name,
        display_name: session.name || session.company,
        target_path: `/quotes/${id}`,
        details: {
          quote_id: id,
          quote_number: quote.quote_number,
          client_company: session.company,
          portal_client: true,
        },
        ip_address: _request.headers.get('x-forwarded-for') || 'unknown',
      });
    }

    // Get items
    const { data: items } = await supabase
      .from('pyra_quote_items')
      .select('id, sort_order, description, quantity, rate, amount')
      .eq('quote_id', id)
      .order('sort_order', { ascending: true });

    return apiSuccess({ ...quote, items: items || [] });
  } catch (err) {
    console.error('GET /api/portal/quotes/[id] error:', err);
    return apiServerError();
  }
}
