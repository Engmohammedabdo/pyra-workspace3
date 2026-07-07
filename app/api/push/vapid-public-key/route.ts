import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { getVapidPublicKey } from '@/lib/notifications/web-push';

// GET /api/push/vapid-public-key
// Internal dashboard users only. Returns the public VAPID key; private key stays server-side.
export async function GET() {
  try {
    const auth = await requireApiPermission('notifications.view');
    if (isApiError(auth)) return auth;

    const publicKey = getVapidPublicKey();
    return apiSuccess({
      enabled: Boolean(publicKey),
      publicKey,
    });
  } catch (err) {
    console.error('[GET /api/push/vapid-public-key] error:', err);
    return apiServerError();
  }
}
