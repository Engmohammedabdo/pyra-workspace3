import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { deliverWebhook } from '@/lib/webhooks/delivery';

type RouteContext = { params: Promise<{ id: string }> };

// =============================================================
// POST /api/webhooks/[id]/test
// Send a test webhook delivery with sample payload. Admin only.
// =============================================================
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    // Fetch webhook
    const { data: webhook, error: fetchError } = await supabase
      .from('pyra_webhooks')
      .select('id, name, url, secret')
      .eq('id', id)
      .single();

    if (fetchError || !webhook) {
      return apiNotFound('الـ Webhook غير موجود');
    }

    const testPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test webhook from Pyra Workspace' },
    };

    // Attempt delivery
    const result = await deliverWebhook(
      webhook.id,
      webhook.url,
      webhook.secret,
      'test',
      testPayload
    );

    // Record test delivery
    const deliveryId = generateId('wd');
    await supabase.from('pyra_webhook_deliveries').insert({
      id: deliveryId,
      webhook_id: webhook.id,
      event: 'test',
      payload: testPayload,
      response_status: result.status || null,
      response_body: result.body || null,
      attempt_count: 1,
      status: result.success ? 'success' : 'failed',
      next_retry_at: null,
      error_message: result.error || null,
      delivered_at: result.success ? new Date().toISOString() : null,
    });

    return apiSuccess({
      delivery_id: deliveryId,
      success: result.success,
      status: result.status,
      error: result.error,
    });
  } catch (err) {
    console.error('POST /api/webhooks/[id]/test error:', err);
    return apiServerError();
  }
}
