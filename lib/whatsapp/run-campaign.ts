// One place a campaign run starts — shared by the dashboard's Send button and
// the drain cron, so the two can never disagree about the gates.
//
// WHY THIS IS SHARED (2026-09-04):
//   The gates (designated line, working window, daily cap, suppression list,
//   E.164 dialling, no-WhatsApp check) are what keep a line alive. Duplicating
//   them for the cron would be the same class of defect as the sender fallback
//   this whole module exists to prevent: two code paths, one of them wrong,
//   nobody notices until a line is banned.
//
// The caller supplies auth and translates the refusal into its own shape —
// an HTTP status for the route, a skip-with-reason for the cron.

import { createServiceRoleClient } from '@/lib/supabase/server';
import { evolutionClient } from '@/lib/evolution/client';
import { chunk } from '@/lib/utils/chunk';
import { toDialableUAE } from '@/lib/utils/phone';
import { logError } from '@/lib/observability/log-error';
import {
  pickCampaignSender,
  isWithinSendWindow,
  windowFor,
  remainingQuota,
  isSuppressed,
  renderTemplate,
  splitVariants,
  pickVariant,
  startBurst,
  advancePacing,
  dubaiClock,
  type CampaignInstanceLike,
  type SenderRejection,
} from '@/lib/whatsapp/campaign-policy';

type Supa = ReturnType<typeof createServiceRoleClient>;

/** Contacts fetched per pass — a hard ceiling on one run's blast radius. */
const MAX_PER_RUN = 120;
/** PostgREST 414s on unbounded `.in()` lists (see lib/utils/chunk.ts). */
const IN_BATCH = 150;

export const SENDER_ERRORS: Record<SenderRejection, string> = {
  no_line_designated:
    'لم يتم تحديد خط الإرسال لهذه الحملة. اختر الخط قبل الإرسال — لا يوجد خط افتراضي.',
  unknown_line: 'خط الإرسال المحدد لهذه الحملة غير موجود.',
  notification_line:
    'هذا هو خط إشعارات الموظفين ولا يجوز استخدامه للحملات — حظره يوقف إشعارات النظام كلها.',
  not_connected: 'خط الإرسال غير متصل حالياً.',
  missing_api_key: 'لا يوجد مفتاح API مخزّن لهذا الخط، وأي إرسال منه سيُرفض.',
};

export type RunRefusalCode =
  | 'not_found'
  | 'already_sending'
  | 'completed'
  | 'sender'
  | 'no_window'
  | 'outside_window'
  | 'quota'
  | 'line_busy'
  | 'nothing_sendable';

export type CampaignRunResult =
  | { ok: false; code: RunRefusalCode; message: string; httpStatus: number }
  | {
      ok: true;
      instanceName: string;
      queued: number;
      skipped: number;
      invalid: number;
      quotaRemaining: number;
      finished: boolean;
    };

/** Start of the current Dubai day, as a UTC instant. */
export function dubaiDayStart(now: Date): Date {
  const { minuteOfDay } = dubaiClock(now);
  return new Date(now.getTime() - minuteOfDay * 60_000);
}

/**
 * Run one campaign's next slice: validate every gate, then kick off a paced
 * drain in the background and return immediately.
 *
 * Re-runnable by design. Contacts stay `pending` until actually sent, so a run
 * that stops early — window closed, cap reached, container restarted — leaves
 * the remainder queued and the next call resumes exactly where it left off.
 */
export async function startCampaignRun(
  supabase: Supa,
  campaignId: string,
  opts: { now?: Date } = {},
): Promise<CampaignRunResult> {
  const now = opts.now ?? new Date();

  const { data: campaign, error: campErr } = await supabase
    .from('pyra_whatsapp_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (campErr || !campaign) {
    return { ok: false, code: 'not_found', message: 'الحملة غير موجودة', httpStatus: 404 };
  }
  if (campaign.status === 'sending') {
    return { ok: false, code: 'already_sending', message: 'الحملة قيد الإرسال بالفعل', httpStatus: 409 };
  }
  if (campaign.status === 'completed') {
    return { ok: false, code: 'completed', message: 'الحملة مكتملة', httpStatus: 409 };
  }

  // ── 1. Resolve the sending line. No fallback, ever. ──────────────────────
  const { data: instanceRows } = await supabase
    .from('pyra_whatsapp_instances')
    .select('instance_name, status, api_key, is_notification_line');

  const sender = pickCampaignSender(
    (instanceRows ?? []) as CampaignInstanceLike[],
    campaign.instance_name,
    // Never a fallback — only an explicit per-campaign opt-in (migration 065),
    // meant for small warm audiences. The default stays refusal.
    { allowNotificationLine: campaign.allow_notification_line === true },
  );
  if (!sender.ok) {
    return { ok: false, code: 'sender', message: SENDER_ERRORS[sender.reason], httpStatus: 400 };
  }

  const instanceName = sender.instance.instance_name;
  const instanceKey = sender.instance.api_key ?? undefined;

  // ── 2. Working window for this line. ─────────────────────────────────────
  const window = windowFor(instanceName);
  if (!window) {
    return {
      ok: false, code: 'no_window',
      message: `لا توجد نافذة إرسال معرّفة للخط ${instanceName}.`, httpStatus: 400,
    };
  }
  if (!isWithinSendWindow(now, window)) {
    return {
      ok: false, code: 'outside_window',
      message:
        'خارج نافذة الإرسال المخصصة لهذا الخط. الإرسال أيام العمل (الاثنين–السبت) فقط، كل خط في وقته.',
      httpStatus: 409,
    };
  }

  // ── 3. Daily quota — CAMPAIGN sends on this line, not organic traffic. ───
  // Counting every outgoing message on the line folded in the agents' own
  // manual replies: pyraai sends ~20 notifications/day, so a cap of 10 was
  // exhausted before a single campaign message.
  const dayStart = dubaiDayStart(now).toISOString();
  const { data: lineCampaigns } = await supabase
    .from('pyra_whatsapp_campaigns')
    .select('id')
    .eq('instance_name', instanceName);

  let sentToday = 0;
  for (const batch of chunk((lineCampaigns ?? []).map((c) => c.id as string), IN_BATCH)) {
    const { count } = await supabase
      .from('pyra_whatsapp_campaign_contacts')
      .select('id', { count: 'exact', head: true })
      .in('campaign_id', batch)
      .eq('status', 'sent')
      .gte('sent_at', dayStart);
    sentToday += count ?? 0;
  }

  const quota = remainingQuota(campaign.daily_cap ?? 0, sentToday);
  if (quota === 0) {
    return {
      ok: false, code: 'quota',
      message: `تم بلوغ الحد اليومي للحملات على الخط ${instanceName} (${sentToday} رسالة اليوم). أكمل غداً.`,
      httpStatus: 429,
    };
  }

  // ── 4. Pending queue, bounded by the quota. ──────────────────────────────
  const { data: contacts } = await supabase
    .from('pyra_whatsapp_campaign_contacts')
    .select('id, contact_phone, contact_name, lead_id')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .limit(Math.min(quota, MAX_PER_RUN));

  if (!contacts || contacts.length === 0) {
    await supabase
      .from('pyra_whatsapp_campaigns')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', campaignId);
    return {
      ok: true, instanceName, queued: 0, skipped: 0, invalid: 0,
      quotaRemaining: quota, finished: true,
    };
  }

  // ── 5. Global opt-out — checked across every line, not just this one. ────
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

  // ── 6. Dial E.164, then drop numbers with no WhatsApp account. ───────────
  // Evolution needs the country code: UAE local `05xxxxxxxx` returns
  // exists:false, the same number prefixed 971 returns exists:true.
  const dial = (p: string) => toDialableUAE(p);
  const dialable = allowed.filter((c) => dial(c.contact_phone as string));
  const malformed = allowed.filter((c) => !dial(c.contact_phone as string));
  for (const batch of chunk(malformed.map((c) => c.id as string), IN_BATCH)) {
    await supabase
      .from('pyra_whatsapp_campaign_contacts')
      .update({ status: 'invalid', error_message: 'رقم غير صالح' })
      .in('id', batch);
  }

  const reachable = await evolutionClient.checkNumbersOnWhatsApp(
    instanceName,
    dialable.map((c) => dial(c.contact_phone as string)),
    instanceKey,
  );
  // `null` means the check itself failed — proceed rather than stall the
  // campaign, since a transport blip is not evidence about the numbers.
  const sendable = reachable
    ? dialable.filter((c) => reachable.has(dial(c.contact_phone as string)))
    : dialable;
  const unreachable = reachable
    ? dialable.filter((c) => !reachable.has(dial(c.contact_phone as string)))
    : [];
  for (const batch of chunk(unreachable.map((c) => c.id as string), IN_BATCH)) {
    await supabase
      .from('pyra_whatsapp_campaign_contacts')
      .update({ status: 'invalid', error_message: 'لا يوجد حساب واتساب لهذا الرقم' })
      .in('id', batch);
  }

  const totalInvalid = malformed.length + unreachable.length;

  if (sendable.length === 0) {
    await supabase
      .from('pyra_whatsapp_campaigns')
      .update({ status: 'paused' })
      .eq('id', campaignId);
    return {
      ok: false, code: 'nothing_sendable',
      message: `لا يوجد رقم صالح للإرسال في هذه الدفعة (${skipped.length} مستبعد، ${totalInvalid} بلا واتساب).`,
      httpStatus: 200,
    };
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

  // ── 7. Claim the LINE, atomically. ──────────────────────────────────────
  // The daily cap is a per-line control, but it is read once as a snapshot and
  // reserves nothing. Three campaigns share `yellow`; started together they
  // would each be granted the full cap and drain the same number in parallel —
  // 3x the cap, from three uncoordinated streams. Migration 067's partial
  // unique index makes that state unrepresentable; this update is the claim.
  //
  // The .eq('status', campaign.status) is a compare-and-swap on the row we
  // read, so two triggers racing on the SAME campaign cannot both proceed.
  // The unique index covers two triggers racing on DIFFERENT campaigns of the
  // same line, surfacing as 23505 which we translate into a plain refusal.
  //
  // auto_resume is deliberately NOT written here: arming is the human Send
  // press (the route does it). If the cron armed campaigns, a stop pressed
  // moments before a tick would be silently undone by the tick itself.
  const { data: claimed, error: claimErr } = await supabase
    .from('pyra_whatsapp_campaigns')
    .update({ status: 'sending', sent_at: campaign.sent_at ?? new Date().toISOString() })
    .eq('id', campaignId)
    .eq('status', campaign.status)
    .select('id')
    .maybeSingle();

  if (claimErr || !claimed) {
    const busyLine = claimErr?.code === '23505';
    return {
      ok: false,
      code: busyLine ? 'line_busy' : 'already_sending',
      message: busyLine
        ? `الخط ${instanceName} مشغول بحملة أخرى الآن. ستبدأ هذه بعد أن تنتهي.`
        : 'الحملة قيد الإرسال بالفعل',
      httpStatus: 409,
    };
  }

  // ── 7. Paced drain, re-checking the window before every message. ─────────
  const drain = async () => {
    let sentCount = campaign.sent_count ?? 0;
    let pacing = startBurst(Math.random);
    let stoppedEarly = false;
    // Wedge guard: the row is now 'sending', and a 'sending' campaign is
    // refused at the top of this function. If anything below throws (or the
    // container restarts), the row would stay 'sending' with no way back.
    let settledCleanly = false;
    try {
      for (const contact of sendable) {
        // The stop control. It reads auto_resume as well as status because
        // "إيقاف الجدولة" only clears auto_resume — checking status alone meant
        // an operator pressed stop, got a confirmation toast, and the drain
        // kept sending for hours.
        const { data: live } = await supabase
          .from('pyra_whatsapp_campaigns')
          .select('status, auto_resume')
          .eq('id', campaignId)
          .single();
        if (live?.status !== 'sending') { stoppedEarly = true; break; }
        if (live?.auto_resume === false) { stoppedEarly = true; break; }
        if (!isWithinSendWindow(new Date(), window)) { stoppedEarly = true; break; }

        // Re-check the LINE's cap every message. The quota read before the loop
        // is a snapshot; a run legitimately spans hours, so without this a
        // drain outlives the cap it was authorised under.
        let sentOnLineToday = 0;
        for (const batch of chunk((lineCampaigns ?? []).map((lc) => lc.id as string), IN_BATCH)) {
          const { count } = await supabase
            .from('pyra_whatsapp_campaign_contacts')
            .select('id', { count: 'exact', head: true })
            .in('campaign_id', batch)
            .eq('status', 'sent')
            .gte('sent_at', dubaiDayStart(new Date()).toISOString());
          sentOnLineToday += count ?? 0;
        }
        if (remainingQuota(campaign.daily_cap ?? 0, sentOnLineToday) === 0) {
          stoppedEarly = true; break;
        }

        // Seeded per contact, so a retry re-sends the same wording and two
        // lines can never show one person two "first messages".
        const variants = splitVariants(campaign.message_template as string);
        const message = renderTemplate(
          pickVariant(variants, contact.contact_phone as string),
          {
            name: contact.contact_name as string | null,
            company: contact.lead_id ? companyByLead.get(contact.lead_id as string) : null,
          },
        );

        try {
          const number = dial(contact.contact_phone as string);
          // Typing presence first — best-effort; sendPresence swallows its own
          // errors so a presence quirk never blocks the actual message.
          await evolutionClient.sendPresence(
            instanceName, `${number}@s.whatsapp.net`, 'composing', instanceKey,
          );
          await new Promise((r) => setTimeout(r, 2000 + Math.floor(Math.random() * 3000)));

          await evolutionClient.sendText(instanceName, { number, text: message }, instanceKey);

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
            .eq('id', campaignId);
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
        .eq('campaign_id', campaignId)
        .eq('status', 'pending');

      const done = !stoppedEarly && (stillPending ?? 0) === 0;
      await supabase
        .from('pyra_whatsapp_campaigns')
        .update({
          status: done ? 'completed' : 'paused',
          sent_count: sentCount,
          ...(done ? { completed_at: new Date().toISOString() } : {}),
        })
        .eq('id', campaignId);
      settledCleanly = true;
    } finally {
      if (!settledCleanly) {
        await supabase
          .from('pyra_whatsapp_campaigns')
          .update({ status: 'paused', sent_count: sentCount })
          .eq('id', campaignId)
          .eq('status', 'sending');
      }
    }
  };

  // Long-running by design (40 messages span hours at human pacing). Contacts
  // stay `pending` until sent, so a restart costs nothing but a re-run.
  void drain().catch((err) => {
    logError({ error: err, metadata: { campaign_id: campaignId, instance_name: instanceName } });
  });

  return {
    ok: true,
    instanceName,
    queued: sendable.length,
    skipped: skipped.length,
    invalid: totalInvalid,
    quotaRemaining: quota,
    finished: false,
  };
}
