import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/api/activity';
import { startCampaignRun } from '@/lib/whatsapp/run-campaign';

/**
 * POST /api/dashboard/sales/whatsapp/campaigns/[id]/send
 *
 * Start (or resume) a campaign's next slice. Every gate — designated line,
 * working window, daily cap, suppression list, E.164 dialling, no-WhatsApp
 * check — lives in lib/whatsapp/run-campaign.ts, shared with the drain cron so
 * the button and the schedule can never disagree about what is safe to send.
 *
 * This press also ARMS the campaign: `auto_resume` flips true, and from then
 * on the cron continues it on later days without another press. Starting
 * outreach is a human decision; continuing it is bookkeeping.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const result = await startCampaignRun(supabase, id);

    // Arming is the HUMAN press, and only on a run that actually started.
    // Deliberately not inside startCampaignRun: the cron calls that too, so
    // arming there would let a tick silently undo a stop pressed moments
    // earlier — and would arm campaigns that never cleared a gate.
    if (result.ok && !result.finished) {
      await supabase
        .from('pyra_whatsapp_campaigns')
        .update({ auto_resume: true })
        .eq('id', id);
    }

    if (!result.ok) {
      // `nothing_sendable` is a 200-status outcome, not a failure: the batch
      // was fully suppressed or unreachable and the queue moved on.
      if (result.httpStatus === 200) {
        return apiSuccess({ started: false, reason: result.code, message: result.message });
      }
      return apiError(result.message, result.httpStatus);
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'campaign_send_started',
      `/dashboard/sales/whatsapp-campaigns/${id}`,
      {
        campaign_id: id,
        instance_name: result.instanceName,
        queued: result.queued,
        skipped_suppressed: result.skipped,
        skipped_no_whatsapp: result.invalid,
        daily_quota_remaining: result.quotaRemaining,
      },
    );

    return apiSuccess({
      started: !result.finished,
      completed: result.finished,
      instance_name: result.instanceName,
      queued: result.queued,
      skipped: result.skipped,
      invalid: result.invalid,
      quota_remaining: result.quotaRemaining,
    });
  } catch (err) {
    return apiServerError(undefined, err, request);
  }
}
