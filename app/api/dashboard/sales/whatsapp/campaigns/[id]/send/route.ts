import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError, apiNotFound } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { evolutionClient } from '@/lib/evolution/client';
import { chunk } from '@/lib/utils/chunk';
import {
  pickCampaignSender,
  isWithinSendWindow,
  windowFor,
  remainingQuota,
  isSuppressed,
  renderTemplate,
  startBurst,
  advancePacing,
  dubaiClock,
  type CampaignInstanceLike,
  type SenderRejection,
} from '@/lib/whatsapp/campaign-policy';

/**
 * POST /api/dashboard/sales/whatsapp/campaigns/[id]/send
 *
 * Drain as much of a campaign's queue as today's window and quota allow.
 *
 * Re-runnable BY DESIGN. Contacts stay `pending` until they are actually
 * sent, so a run that stops early — window closed, cap reached, container
 * restarted — leaves the remainder queued and the next call picks up exactly
 * where it left off. The campaign only reaches `completed` when nothing is
 * pending; otherwise it returns to `paused`.
 *
 * What changed and why (2026-09-03):
 *   The previous version resolved its sender with an UNORDERED
 *   `.eq('status','connected').limit(1)` and a literal `?? 'pyraai'` fallback
 *   — the notification line. A cold broadcast from that number risks banning
 *   the one line every internal employee notification is sent from. It then
 *   sent one message per second, forever: no daily cap, no working-hours
 *   window, no opt-out check, and a fixed interval that is the clearest
 *   machine fingerprint a sender can emit.
 *
 *   Every rule below now lives in lib/whatsapp/campaign-policy.ts, pure and
 *   unit-tested; this handler only performs the I/O.
 */

/** Contacts fetched per pass — a hard ceiling on one run's blast radius. */
const MAX_PER_RUN = 120;
/** PostgREST 414s on unbounded `.in()` lists (see lib/utils/chunk.ts). */
const IN_BATCH = 150;

const SENDER_ERRORS: Record<SenderRejection, string> = {
  no_line_designated:
    'لم يتم تحديد خط الإرسال لهذه الحملة. اختر الخط قبل الإرسال — لا يوجد خط افتراضي.',
  unknown_line: 'خط الإرسال المحدد لهذه الحملة غير موجود.',
  notification_line:
    'هذا هو خط إشعارات الموظفين ولا يجوز استخدامه للحملات — حظره يوقف إشعارات النظام كلها.',
  not_connected: 'خط الإرسال غير متصل حالياً.',
  missing_api_key: 'لا يوجد مفتاح API مخزّن لهذا الخط، وأي إرسال منه سيُرفض.',
};

/** Start of the current Dubai day, as a UTC instant. */
function dubaiDayStart(now: Date): Date {
  const { minuteOfDay } = dubaiClock(now);
  return new Date(now.getTime() - minuteOfDay * 60_000);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const { data: campaign, error: campErr } = await supabase
      .from('pyra_whatsapp_campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (campErr || !campaign) return apiNotFound('الحملة غير موجودة');
    if (campaign.status === 'sending') return apiError('الحملة قيد الإرسال بالفعل', 409);
    if (campaign.status === 'completed') return apiError('الحملة مكتملة', 409);

    // ── 1. Resolve the sending line. No fallback, ever. ────────────────────
    const { data: instanceRows } = await supabase
      .from('pyra_whatsapp_instances')
      .select('instance_name, status, api_key, is_notification_line');

    const sender = pickCampaignSender(
      (instanceRows ?? []) as CampaignInstanceLike[],
      campaign.instance_name,
    );
    if (!sender.ok) return apiError(SENDER_ERRORS[sender.reason], 400);

    const instanceName = sender.instance.instance_name;
    const instanceKey = sender.instance.api_key ?? undefined;

    // ── 2. Working window for this line. ──────────────────────────────────
    const now = new Date();
    const window = windowFor(instanceName);
    if (!window) {
      return apiError(`لا توجد نافذة إرسال معرّفة للخط ${instanceName}.`, 400);
    }
    if (!isWithinSendWindow(now, window)) {
      return apiError(
        'خارج نافذة الإرسال المخصصة لهذا الخط. الإرسال متاح أيام الأحد إلى الخميس فقط، كل خط في وقته.',
        409,
      );
    }

    // ── 3. Daily quota — measured on the LINE, not on this campaign. ──────
    // Several campaigns can share a line, and the line's organic replies count
    // toward how much WhatsApp sees it sending. Capping per-campaign would let
    // three campaigns quietly triple the real load on one number.
    const dayStart = dubaiDayStart(now).toISOString();
    const { data: convoRows } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('id')
      .eq('instance_name', instanceName);

    let sentToday = 0;
    for (const batch of chunk((convoRows ?? []).map((c) => c.id as string), IN_BATCH)) {
      const { count } = await supabase
        .from('pyra_whatsapp_messages')
        .select('id', { count: 'exact', head: true })
        .in('conversation_id', batch)
        .eq('direction', 'outgoing')
        .gte('created_at', dayStart);
      sentToday += count ?? 0;
    }

    const quota = remainingQuota(campaign.daily_cap ?? 0, sentToday);
    if (quota === 0) {
      return apiError(
        `تم بلوغ الحد اليومي للخط ${instanceName} (${sentToday} رسالة اليوم). أكمل غداً.`,
        429,
      );
    }

    // ── 4. Pending queue, bounded by the quota. ───────────────────────────
    const { data: contacts } = await supabase
      .from('pyra_whatsapp_campaign_contacts')
      .select('id, contact_phone, contact_name, lead_id')
      .eq('campaign_id', id)
      .eq('status', 'pending')
      .limit(Math.min(quota, MAX_PER_RUN));

    if (!contacts || contacts.length === 0) {
      await supabase
        .from('pyra_whatsapp_campaigns')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id);
      return apiSuccess({ sent: 0, completed: true });
    }

    // ── 5. Global opt-out — checked across every line, not just this one. ──
    const { data: suppressed } = await supabase
      .from('pyra_whatsapp_suppressions')
      .select('phone_key');
    const suppressionIndex = new Set((suppressed ?? []).map((s) => s.phone_key as string));

    const allowed: typeof contacts = [];
    const skipped: string[] = [];
    for (const c of contacts) {
      if (isSuppressed(suppressionIndex, c.contact_phone)) skipped.push(c.id as string);
      else allowed.push(c);
    }
    for (const batch of chunk(skipped, IN_BATCH)) {
      await supabase
        .from('pyra_whatsapp_campaign_contacts')
        .update({ status: 'skipped', error_message: 'قائمة الاستبعاد' })
        .in('id', batch);
    }

    // ── 6. Drop numbers that have no WhatsApp account at all. ─────────────
    const digits = (p: string) => p.replace(/\D/g, '');
    const reachable = await evolutionClient.checkNumbersOnWhatsApp(
      instanceName,
      allowed.map((c) => digits(c.contact_phone as string)),
      instanceKey,
    );
    // `null` means the check itself failed — proceed rather than stall the
    // campaign, since a transport blip is not evidence about the numbers.
    const sendable = reachable
      ? allowed.filter((c) => reachable.has(digits(c.contact_phone as string)))
      : allowed;
    const unreachable = reachable
      ? allowed.filter((c) => !reachable.has(digits(c.contact_phone as string)))
      : [];
    for (const batch of chunk(unreachable.map((c) => c.id as string), IN_BATCH)) {
      await supabase
        .from('pyra_whatsapp_campaign_contacts')
        .update({ status: 'invalid', error_message: 'لا يوجد حساب واتساب لهذا الرقم' })
        .in('id', batch);
    }

    if (sendable.length === 0) {
      await supabase.from('pyra_whatsapp_campaigns').update({ status: 'paused' }).eq('id', id);
      return apiSuccess({
        sent: 0,
        skipped: skipped.length,
        invalid: unreachable.length,
        completed: false,
      });
    }

    // Company names for the {{company}} placeholder.
    const leadIds = sendable.map((c) => c.lead_id as string | null).filter(Boolean) as string[];
    const companyByLead = new Map<string, string>();
    for (const batch of chunk(leadIds, IN_BATCH)) {
      const { data: leads } = await supabase
        .from('pyra_sales_leads')
        .select('id, company')
        .in('id', batch);
      for (const l of leads ?? []) {
        if (l.company) companyByLead.set(l.id as string, l.company as string);
      }
    }

    await supabase
      .from('pyra_whatsapp_campaigns')
      .update({ status: 'sending', sent_at: campaign.sent_at ?? new Date().toISOString() })
      .eq('id', id);

    // ── 7. Send with human pacing, re-checking the window each message. ───
    const drain = async () => {
      let sentCount = campaign.sent_count ?? 0;
      let pacing = startBurst(Math.random);
      let stoppedEarly = false;

      for (const contact of sendable) {
        // An operator setting the campaign to `paused` is the stop button.
        const { data: live } = await supabase
          .from('pyra_whatsapp_campaigns')
          .select('status')
          .eq('id', id)
          .single();
        if (live?.status !== 'sending') { stoppedEarly = true; break; }

        if (!isWithinSendWindow(new Date(), window)) { stoppedEarly = true; break; }

        const message = renderTemplate(campaign.message_template as string, {
          name: contact.contact_name as string | null,
          company: contact.lead_id ? companyByLead.get(contact.lead_id as string) : null,
        });

        try {
          // Typing presence first — an account someone types from looks
          // different from an account messages are pumped through.
          const remoteJid = `${digits(contact.contact_phone as string)}@s.whatsapp.net`;
          await evolutionClient.sendPresence(instanceName, remoteJid, 'composing', instanceKey);
          await new Promise((r) => setTimeout(r, 2000 + Math.floor(Math.random() * 3000)));

          await evolutionClient.sendText(
            instanceName,
            { number: digits(contact.contact_phone as string), text: message },
            instanceKey,
          );

          sentCount++;
          await supabase
            .from('pyra_whatsapp_campaign_contacts')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', contact.id);

          // Pin the line to the lead: every later message to this person must
          // come from this same number.
          if (contact.lead_id) {
            await supabase
              .from('pyra_sales_leads')
              .update({ whatsapp_instance: instanceName })
              .eq('id', contact.lead_id)
              .is('whatsapp_instance', null);
          }

          await supabase
            .from('pyra_whatsapp_campaigns')
            .update({ sent_count: sentCount })
            .eq('id', id);
        } catch (err) {
          await supabase
            .from('pyra_whatsapp_campaign_contacts')
            .update({
              status: 'failed',
              error_message: err instanceof Error ? err.message : 'Unknown error',
            })
            .eq('id', contact.id);
        }

        const step = advancePacing(pacing, Math.random);
        pacing = step.state;
        await new Promise((r) => setTimeout(r, step.delayMs));
      }

      const { count: stillPending } = await supabase
        .from('pyra_whatsapp_campaign_contacts')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', id)
        .eq('status', 'pending');

      const done = !stoppedEarly && (stillPending ?? 0) === 0;
      await supabase
        .from('pyra_whatsapp_campaigns')
        .update({
          status: done ? 'completed' : 'paused',
          sent_count: sentCount,
          ...(done ? { completed_at: new Date().toISOString() } : {}),
        })
        .eq('id', id);
    };

    // Long-running by design (a 40-message run spans hours at human pacing).
    // Contacts stay `pending` until sent, so a restart costs nothing but a
    // re-run — the queue is the source of truth, not this promise.
    void drain().catch((err) => {
      logError({
        error: err,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { campaign_id: id, instance_name: instanceName },
      });
    });

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'campaign_send_started',
      `/dashboard/sales/whatsapp-campaigns/${id}`,
      {
        campaign_id: id,
        instance_name: instanceName,
        queued: sendable.length,
        skipped_suppressed: skipped.length,
        skipped_no_whatsapp: unreachable.length,
        daily_quota_remaining: quota,
      },
    );

    return apiSuccess({
      started: true,
      instance_name: instanceName,
      queued: sendable.length,
      skipped: skipped.length,
      invalid: unreachable.length,
      quota_remaining: quota,
    });
  } catch (err) {
    return apiServerError(undefined, err, request);
  }
}
