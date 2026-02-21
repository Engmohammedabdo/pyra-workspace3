import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { deliverWebhook, getNextRetryTime } from '@/lib/webhooks/delivery';

// =============================================================
// POST /api/webhooks/process-retries
// Process all pending retries where status='retrying' and
// next_retry_at <= now. Admin only.
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();

    // Fetch pending retries
    const { data: pendingDeliveries, error: fetchError } = await supabase
      .from('pyra_webhook_deliveries')
      .select(
        'id, webhook_id, event, payload, attempt_count, max_attempts, status'
      )
      .eq('status', 'retrying')
      .lte('next_retry_at', now)
      .order('next_retry_at', { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error('Process retries fetch error:', fetchError);
      return apiServerError();
    }

    if (!pendingDeliveries || pendingDeliveries.length === 0) {
      return apiSuccess({ processed: 0, succeeded: 0, failed: 0 });
    }

    // Collect unique webhook IDs
    const webhookIds = [...new Set(pendingDeliveries.map((d) => d.webhook_id))];

    // Fetch webhooks
    const { data: webhooks } = await supabase
      .from('pyra_webhooks')
      .select('id, url, secret')
      .in('id', webhookIds);

    const webhookMap = (webhooks || []).reduce(
      (acc: Record<string, { url: string; secret: string }>, w) => {
        acc[w.id] = { url: w.url, secret: w.secret };
        return acc;
      },
      {}
    );

    let succeeded = 0;
    let failedCount = 0;

    for (const delivery of pendingDeliveries) {
      const webhook = webhookMap[delivery.webhook_id];
      if (!webhook) {
        // Webhook was deleted, mark delivery as failed
        await supabase
          .from('pyra_webhook_deliveries')
          .update({
            status: 'failed',
            error_message: 'Webhook deleted',
            next_retry_at: null,
          })
          .eq('id', delivery.id);
        failedCount += 1;
        continue;
      }

      const result = await deliverWebhook(
        delivery.webhook_id,
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
        succeeded += 1;
      } else if (newAttemptCount >= maxAttempts) {
        newStatus = 'failed';
        failedCount += 1;
      } else {
        newStatus = 'retrying';
      }

      await supabase
        .from('pyra_webhook_deliveries')
        .update({
          response_status: result.status || null,
          response_body: result.body || null,
          attempt_count: newAttemptCount,
          status: newStatus,
          next_retry_at: newStatus === 'retrying'
            ? getNextRetryTime(newAttemptCount).toISOString()
            : null,
          error_message: result.error || null,
          delivered_at: result.success ? new Date().toISOString() : null,
        })
        .eq('id', delivery.id);
    }

    return apiSuccess({
      processed: pendingDeliveries.length,
      succeeded,
      failed: failedCount,
    });
  } catch (err) {
    console.error('POST /api/webhooks/process-retries error:', err);
    return apiServerError();
  }
}
