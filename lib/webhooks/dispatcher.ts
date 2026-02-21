import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { deliverWebhook, getNextRetryTime } from './delivery';

/**
 * Fire-and-forget: dispatch webhook event to all matching endpoints.
 */
export function dispatchWebhookEvent(eventType: string, payload: Record<string, unknown>): void {
  _dispatchAsync(eventType, payload).catch((err) => {
    console.error('[webhook] dispatch error:', err);
  });
}

async function _dispatchAsync(eventType: string, payload: Record<string, unknown>): Promise<void> {
  const supabase = createServiceRoleClient();

  // Find all enabled webhooks subscribed to this event
  const { data: webhooks } = await supabase
    .from('pyra_webhooks')
    .select('id, name, url, secret, events')
    .eq('is_enabled', true);

  if (!webhooks || webhooks.length === 0) return;

  for (const webhook of webhooks) {
    const events = (webhook.events as string[]) || [];
    if (events.length > 0 && !events.includes(eventType) && !events.includes('*')) continue;

    const deliveryId = generateId('wd');

    // Attempt delivery
    const result = await deliverWebhook(webhook.id, webhook.url, webhook.secret, eventType, {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    // Record delivery
    await supabase.from('pyra_webhook_deliveries').insert({
      id: deliveryId,
      webhook_id: webhook.id,
      event: eventType,
      payload: { event: eventType, data: payload },
      response_status: result.status || null,
      response_body: result.body || null,
      attempt_count: 1,
      status: result.success ? 'success' : 'retrying',
      next_retry_at: result.success ? null : getNextRetryTime(1).toISOString(),
      error_message: result.error || null,
      delivered_at: result.success ? new Date().toISOString() : null,
    });
  }
}
