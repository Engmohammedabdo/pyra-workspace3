import { signPayload } from './signature';

/**
 * Send webhook HTTP request with HMAC signature.
 * Returns { success, status, body, error }
 */
export async function deliverWebhook(
  webhookId: string,
  url: string,
  secret: string,
  event: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; status?: number; body?: string; error?: string }> {
  const payloadStr = JSON.stringify(payload);
  const signature = signPayload(payloadStr, secret);
  const timestamp = Date.now().toString();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Pyra-Signature': signature,
        'X-Pyra-Timestamp': timestamp,
        'X-Pyra-Event': event,
        'X-Pyra-Webhook-Id': webhookId,
        'User-Agent': 'Pyra-Workspace/1.0',
      },
      body: payloadStr,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseBody = await response.text().catch(() => '');
    const success = response.status >= 200 && response.status < 300;

    return {
      success,
      status: response.status,
      body: responseBody.slice(0, 500),
      error: success ? undefined : `HTTP ${response.status}`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

/**
 * Calculate next retry time with exponential backoff.
 * Attempts: 1min, 5min, 15min
 */
export function getNextRetryTime(attemptCount: number): Date {
  const delays = [60, 300, 900]; // seconds
  const delay = delays[Math.min(attemptCount - 1, delays.length - 1)] || 900;
  return new Date(Date.now() + delay * 1000);
}
