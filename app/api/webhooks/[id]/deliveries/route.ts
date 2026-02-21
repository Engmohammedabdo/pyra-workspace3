import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

type RouteContext = { params: Promise<{ id: string }> };

// =============================================================
// GET /api/webhooks/[id]/deliveries
// List deliveries for a webhook with pagination.
// Query params: page, pageSize, status
// Admin only.
// =============================================================
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    // Verify webhook exists
    const { data: webhook, error: fetchError } = await supabase
      .from('pyra_webhooks')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !webhook) {
      return apiNotFound('الـ Webhook غير موجود');
    }

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') || '20')));
    const statusFilter = sp.get('status');
    const offset = (page - 1) * pageSize;

    // Build query
    let query = supabase
      .from('pyra_webhook_deliveries')
      .select(
        'id, webhook_id, event, payload, response_status, response_body, attempt_count, max_attempts, status, next_retry_at, error_message, delivered_at, created_at',
        { count: 'exact' }
      )
      .eq('webhook_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (statusFilter && ['success', 'failed', 'retrying'].includes(statusFilter)) {
      query = query.eq('status', statusFilter);
    }

    const { data: deliveries, count, error } = await query;

    if (error) {
      console.error('Webhook deliveries list error:', error);
      return apiServerError();
    }

    return apiSuccess(deliveries || [], {
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('GET /api/webhooks/[id]/deliveries error:', err);
    return apiServerError();
  }
}
