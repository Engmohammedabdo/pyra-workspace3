import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { pullInstanceMessages, listPullableInstances } from '@/lib/whatsapp/pull-messages';

export const maxDuration = 60;

/**
 * POST /api/dashboard/sales/whatsapp/poll
 *
 * Foreground refresh for the chat page (called on mount + every 15s while the
 * page is open). The actual pulling lives in lib/whatsapp/pull-messages so this
 * route and /api/cron/whatsapp-sync can never drift apart.
 *
 * Now covers EVERY registered instance, not the hardcoded 'pyraai'. That
 * hardcode is why a newly connected line (`selver`, 2026-08-06) stayed
 * invisible in the inbox even though it was connected and syncing on
 * Evolution's side.
 *
 * One slow instance must not blank the whole inbox, so each is pulled
 * independently and failures are reported per-instance instead of failing the
 * request.
 */
export async function POST(_req: NextRequest) {
  const auth = await requireApiPermission('sales_whatsapp.view');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();

  try {
    const instances = await listPullableInstances(supabase);

    const results = await Promise.all(
      instances.map(async (inst) => {
        try {
          return await pullInstanceMessages({
            supabase,
            instanceName: inst.instance_name,
            ownPhone: inst.phone_number,
          });
        } catch (err) {
          console.error(`[wa-poll] ${inst.instance_name} failed:`, err);
          return {
            instance: inst.instance_name,
            synced: 0,
            conversations_updated: 0,
            total_fetched: 0,
            error: err instanceof Error ? err.message : 'unknown',
          };
        }
      }),
    );

    return apiSuccess({
      synced: results.reduce((n, r) => n + r.synced, 0),
      conversations_updated: results.reduce((n, r) => n + r.conversations_updated, 0),
      total_fetched: results.reduce((n, r) => n + r.total_fetched, 0),
      per_instance: results,
    });
  } catch (err) {
    console.error('Poll error:', err);
    return apiServerError(`Poll failed: ${err instanceof Error ? err.message : ''}`);
  }
}
