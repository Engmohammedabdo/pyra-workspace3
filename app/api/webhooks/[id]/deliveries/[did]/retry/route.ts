import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiError,
  apiForbidden,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { deliverWebhook, getNextRetryTime } from '@/lib/webhooks/delivery';

type RouteContext = { params: Promise<{ id: string; did: string }> };

// =============================================================
// POST /api/webhooks/[id]/deliveries/[did]/retry
// Retry a failed delivery. Admin only.
// Must be status=failed or retrying, attempt < max_attempts.
// =============================================================
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id, did } = await context.params;
    const supabase = createServiceRoleClient();

    // Fetch webhook
    const { data: webhook, error: whError } = await supabase
      .from('pyra_webhooks')
      .select('id, url, secret')
      .eq('id', id)
      .single();

    if (whError || !webhook) {
      return apiNotFound('الـ Webhook غير موجود');
    }

    // Fetch delivery
    const { data: delivery, error: dlError } = await supabase
      .from('pyra_webhook_deliveries')
      .select('id, webhook_id, event, payload, attempt_count, max_attempts, status')
      .eq('id', did)
      .eq('webhook_id', id)
      .single();

    if (dlError || !delivery) {
      return apiNotFound('التسليم غير موجود');
    }

    // Check if retryable
    if (delivery.status !== 'failed' && delivery.status !== 'retrying') {
      return apiError('لا يمكن إعادة المحاولة — الحالة ليست فاشلة أو قيد الإعادة', 400);
    }

    if (delivery.attempt_count >= (delivery.max_attempts || 3)) {
      return apiError('تم الوصول للحد الأقصى من المحاولات', 400);
    }

    // Attempt delivery
    const result = await deliverWebhook(
      webhook.id,
      webhook.url,
      webhook.secret,
      delivery.event,
      delivery.payload as Record<string, unknown>
    );

    const newAttemptCount = delivery.attempt_count + 1;
    const maxAttempts = delivery.max_attempts || 3;
    let newStatus: string;

    if (result.success) {
      newStatus = 'success';
    } else if (newAttemptCount >= maxAttempts) {
      newStatus = 'failed';
    } else {
      newStatus = 'retrying';
    }

    // Update delivery record
    const { data: updated, error: updateError } = await supabase
      .from('pyra_webhook_deliveries')
      .update({
        response_status: result.status || null,
        response_body: result.body || null,
        attempt_count: newAttemptCount,
        status: newStatus,
        next_retry_at: newStatus === 'retrying' ? getNextRetryTime(newAttemptCount).toISOString() : null,
        error_message: result.error || null,
        delivered_at: result.success ? new Date().toISOString() : null,
      })
      .eq('id', did)
      .select(
        'id, webhook_id, event, payload, response_status, response_body, attempt_count, max_attempts, status, next_retry_at, error_message, delivered_at, created_at'
      )
      .single();

    if (updateError) {
      console.error('Delivery retry update error:', updateError);
      return apiServerError();
    }

    return apiSuccess(updated);
  } catch (err) {
    console.error('POST /api/webhooks/[id]/deliveries/[did]/retry error:', err);
    return apiServerError();
  }
}
