import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { isValidPushEndpoint } from '@/lib/notifications/push-endpoint';

interface PushSubscriptionBody {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

function parseSubscription(body: unknown): PushSubscriptionBody | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as PushSubscriptionBody;
  if (!value.endpoint || !value.keys?.p256dh || !value.keys?.auth) return null;
  return value;
}

function expirationToIso(value: number | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// POST /api/push/subscriptions
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('notifications.view');
    if (isApiError(auth)) return auth;

    const subscription = parseSubscription(await request.json());
    if (!subscription) return apiValidationError('Invalid push subscription');

    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();
    const endpoint = subscription.endpoint!.trim();
    if (!isValidPushEndpoint(endpoint)) {
      return apiValidationError('Invalid push endpoint');
    }

    const { data: existing, error: lookupError } = await supabase
      .from('pyra_push_subscriptions')
      .select('id')
      .eq('endpoint', endpoint)
      .maybeSingle();

    if (lookupError) return apiServerError(lookupError.message);

    const payload = {
      username: auth.pyraUser.username,
      endpoint,
      p256dh: subscription.keys!.p256dh!.trim(),
      auth: subscription.keys!.auth!.trim(),
      user_agent: request.headers.get('user-agent'),
      expiration_time: expirationToIso(subscription.expirationTime),
      last_seen_at: now,
      disabled_at: null,
    };

    const query = existing
      ? supabase
          .from('pyra_push_subscriptions')
          .update(payload)
          .eq('id', existing.id)
      : supabase
          .from('pyra_push_subscriptions')
          .insert({ id: generateId('ps'), ...payload });

    const { error } = await query;
    if (error) return apiServerError(error.message);

    return apiSuccess({ enabled: true });
  } catch (err) {
    console.error('[POST /api/push/subscriptions] error:', err);
    return apiServerError();
  }
}

// DELETE /api/push/subscriptions
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiPermission('notifications.view');
    if (isApiError(auth)) return auth;

    const body = await request.json().catch(() => ({}));
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';
    if (!endpoint) return apiValidationError('endpoint is required');

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from('pyra_push_subscriptions')
      .update({ disabled_at: new Date().toISOString() })
      .eq('username', auth.pyraUser.username)
      .eq('endpoint', endpoint);

    if (error) return apiServerError(error.message);
    return apiSuccess({ disabled: true });
  } catch (err) {
    console.error('[DELETE /api/push/subscriptions] error:', err);
    return apiServerError();
  }
}
