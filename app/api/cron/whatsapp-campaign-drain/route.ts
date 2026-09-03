import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/log-error';
import { startCampaignRun } from '@/lib/whatsapp/run-campaign';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/cron/whatsapp-campaign-drain
//
// Auth: x-api-key header → pyra_api_keys (the /api/external/* pattern)
// Permission: 'cron.whatsapp-campaign-drain' (or '*')
// Schedule: every 15 minutes via n8n Schedule Trigger → HTTP Request node
//
// WHY THIS EXISTS
//   A campaign paces itself to a daily cap inside a two-to-three hour window,
//   so a 250-contact list takes about seven runs on seven different days. The
//   Send button was the only thing that could start a run, which put ~50
//   manual presses between the owner and a finished campaign — each one inside
//   a window they had to remember. That is not a workflow anyone sustains, and
//   a campaign stalled because nobody was at a laptop looks exactly like one
//   that is broken.
//
// WHAT IT WILL AND WILL NOT DO
//   It only ever RESUMES a campaign a human already started (auto_resume=true,
//   set by the Send button). It never starts one. Beginning outreach to
//   hundreds of strangers is a human decision; continuing that same campaign
//   tomorrow, to the same audience, under the same cap and window, is
//   bookkeeping. Taking a campaign off the schedule is a human decision too —
//   the dashboard's stop control clears auto_resume and this cron skips it.
//
// SAFETY
//   Every gate lives in startCampaignRun(), shared byte-for-byte with the
//   button: designated line (never the notification line without an explicit
//   per-campaign opt-in), working window, daily cap counted on campaign sends,
//   global suppression list, E.164 dialling, and the no-WhatsApp pre-check.
//   Duplicating any of that here would be the same class of defect as the
//   sender fallback this system exists to prevent.
//
//   A campaign already 'sending' is refused by startCampaignRun, so overlapping
//   ticks cannot double-send: at most one drain per campaign is ever in flight.
//   Refusals (outside window, cap reached) are the NORMAL case on most ticks
//   and are counted, not logged as errors.
// ────────────────────────────────────────────────────────────────────────────

/**
 * A drain that has sent nothing for this long is not paced — it is dead: the
 * container was redeployed or killed mid-run, and `finally` does not survive
 * SIGTERM. The row stays 'sending', which this cron skips and no UI control
 * can clear, so the campaign is stranded forever. Comfortably longer than the
 * worst legitimate silence (a 20-minute break plus a 3-minute gap).
 */
const STALE_SENDING_MINUTES = 45;

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);

    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.whatsapp-campaign-drain') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.whatsapp-campaign-drain', 403);
    }

    const supabase = createServiceRoleClient();
    const now = new Date();

    // ── Recover runs wedged by a redeploy ────────────────────────────────
    // Coolify redeploys on every push and a drain legitimately spans hours, so
    // being killed mid-run is routine, not exotic. `finally` does not run on
    // SIGTERM, leaving status='sending' with nothing able to clear it.
    const staleBefore = new Date(now.getTime() - STALE_SENDING_MINUTES * 60_000).toISOString();
    const { data: stuck } = await supabase
      .from('pyra_whatsapp_campaigns')
      .select('id, segment_key')
      .eq('status', 'sending');

    const recovered: string[] = [];
    for (const c of stuck ?? []) {
      const { data: lastSent } = await supabase
        .from('pyra_whatsapp_campaign_contacts')
        .select('sent_at')
        .eq('campaign_id', c.id)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      // No send yet in this run → fall back to when the run was claimed.
      const lastActivity = (lastSent?.sent_at as string | null) ?? null;
      if (lastActivity && lastActivity > staleBefore) continue; // genuinely alive
      if (!lastActivity) {
        const { data: camp } = await supabase
          .from('pyra_whatsapp_campaigns')
          .select('sent_at')
          .eq('id', c.id)
          .maybeSingle();
        if ((camp?.sent_at as string | null) && (camp!.sent_at as string) > staleBefore) continue;
      }
      await supabase
        .from('pyra_whatsapp_campaigns')
        .update({ status: 'paused' })
        .eq('id', c.id)
        .eq('status', 'sending');
      recovered.push((c.segment_key as string) ?? (c.id as string));
    }

    // ── Armed campaigns with work left ───────────────────────────────────
    // 'paused' ONLY. A 'draft' campaign has never been started by a human, and
    // starting outreach is a human decision — the PATCH control can set
    // auto_resume on a draft, and the cron must not treat that as consent.
    const { data: candidates, error } = await supabase
      .from('pyra_whatsapp_campaigns')
      .select('id, segment_key, instance_name, status')
      .eq('auto_resume', true)
      .eq('status', 'paused')
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!candidates || candidates.length === 0) {
      return apiSuccess({ checked: 0, started: 0, recovered, skipped: [] });
    }

    const started: Array<{ campaign: string; instance: string; queued: number }> = [];
    const skipped: Array<{ campaign: string; reason: string }> = [];

    // At most ONE campaign per line per tick. Three campaigns share `yellow`;
    // starting them together would grant each the full daily cap against one
    // number. Migration 067's unique index makes that impossible at the DB
    // level — this keeps the cron from relying on a constraint violation as
    // control flow, and keeps the refusal out of the error log.
    const linesUsedThisTick = new Set<string>();

    for (const c of candidates) {
      const line = (c.instance_name as string) ?? '';
      if (linesUsedThisTick.has(line)) {
        skipped.push({ campaign: c.segment_key ?? c.id, reason: 'line_busy' });
        continue;
      }

      // Only spend a run on a campaign that still has pending contacts.
      const { count: pending } = await supabase
        .from('pyra_whatsapp_campaign_contacts')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', c.id)
        .eq('status', 'pending');

      if ((pending ?? 0) === 0) {
        skipped.push({ campaign: c.segment_key ?? c.id, reason: 'no_pending' });
        continue;
      }

      try {
        const result = await startCampaignRun(supabase, c.id as string);
        if (result.ok && !result.finished) {
          linesUsedThisTick.add(line);
          started.push({
            campaign: c.segment_key ?? c.id,
            instance: result.instanceName,
            queued: result.queued,
          });
        } else if (result.ok) {
          skipped.push({ campaign: c.segment_key ?? c.id, reason: 'completed' });
        } else {
          // outside_window / quota are the expected everyday outcome.
          skipped.push({ campaign: c.segment_key ?? c.id, reason: result.code });
        }
      } catch (err) {
        logError({
          error: err,
          request,
          metadata: { cron: 'whatsapp-campaign-drain', campaign_id: c.id },
        });
        skipped.push({ campaign: c.segment_key ?? c.id, reason: 'error' });
      }
    }

    return apiSuccess({
      checked: candidates.length,
      started: started.length,
      started_detail: started,
      recovered,
      skipped,
    });
  } catch (err) {
    logError({ error: err, request, metadata: { cron: 'whatsapp-campaign-drain' } });
    return apiServerError(undefined, err, request);
  }
}
