import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { listPullableInstances, pullInstanceMessages, type PullResult } from '@/lib/whatsapp/pull-messages';
import { logError } from '@/lib/observability/log-error';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/cron/whatsapp-sync
//
// Auth: x-api-key header → pyra_api_keys (Phase 11 external-cron pattern)
// Permission: 'cron.whatsapp-sync' (or '*' wildcard)
// Schedule: every few minutes via n8n (wired post-deploy — not part of this
// change)
//
// SINGLE RESPONSIBILITY: pull every auto_sync WhatsApp line's recent messages
// via pullInstanceMessages(), the same body the chat page's 15s browser poll
// uses (lib/whatsapp/pull-messages.ts). This cron exists so analytics /
// last_contact / lead matching stay fresh even when nobody has the chat page
// open — the browser poll alone leaves long gaps.
//
// Idempotency: pullInstanceMessages dedups on message_id, so overlap between
// this cron and the browser poll (or overlapping cron ticks) is harmless.
//
// One bad line must never abort the sweep — each instance pull is wrapped in
// its own try/catch so a single Evolution outage doesn't blank every other
// line's sync for that tick.
// ────────────────────────────────────────────────────────────────────────────

interface InstanceResult extends PullResult {
  error?: true;
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);

    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.whatsapp-sync') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.whatsapp-sync', 403);
    }

    const supabase = createServiceRoleClient();
    const instances = await listPullableInstances(supabase);

    const results: InstanceResult[] = [];
    for (const inst of instances) {
      try {
        const r = await pullInstanceMessages({
          supabase,
          instanceName: inst.instance_name,
          ownPhone: inst.phone_number,
        });
        results.push(r);
      } catch (err) {
        // One bad line must never abort the sweep — log and keep going.
        logError({
          severity: 'warning',
          error: err,
          request,
          metadata: { source: 'cron', job: 'whatsapp-sync', instance: inst.instance_name },
        });
        console.error(`[cron/whatsapp-sync] pull failed for ${inst.instance_name}:`, err);
        results.push({
          instance: inst.instance_name,
          synced: 0,
          conversations_updated: 0,
          total_fetched: 0,
          error: true,
        });
      }
    }

    return apiSuccess({ instances: results });
  } catch (err) {
    // Top-level failure (e.g. listPullableInstances itself threw).
    logError({ error: err, request, metadata: { source: 'cron', job: 'whatsapp-sync' } });
    console.error('POST /api/cron/whatsapp-sync threw:', err);
    return apiServerError();
  }
}
