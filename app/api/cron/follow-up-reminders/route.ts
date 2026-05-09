import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { evolutionClient } from '@/lib/evolution/client';
import { notify } from '@/lib/notifications/notify';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/cron/follow-up-reminders
//
// Auth: x-api-key header → pyra_api_keys (existing /api/external/* pattern)
// Permission: 'cron.follow-up-reminders' (or '*' wildcard)
// Schedule: every 5 minutes via n8n Schedule Trigger → HTTP Request node
//
// Logic per CRM-PRD §03 lines 459-472:
//   - SELECT pending follow-ups where reminder_at <= NOW() AND
//     whatsapp_reminder_sent = false AND send_whatsapp_reminder = true
//     (uses the partial index added in migration 013)
//   - For each row: send a WhatsApp REMINDER TO THE AGENT (Q-C3-1 a) via
//     their connected instance, then flip whatsapp_reminder_sent = true,
//     then in-app notify the agent
//
// Reminder destination (Q-C3-1 a): the message goes to the AGENT's
// WhatsApp number, not the lead's. This is a "do this thing" reminder
// for the salesperson, not customer outreach. The lead's name + phone
// appear in the message body for context.
//
// Sequential await loop (Q-C3-3 e — no row cap; sequential serves as
// natural rate-limiting). v1.1 may add Promise.all batching with a
// concurrency cap if production volume grows.
//
// Idempotency:
//   The whatsapp_reminder_sent flag prevents re-fire across ticks. We
//   set it true REGARDLESS of Evolution send outcome — accepting "flag
//   set even though delivery failed" because:
//     a) The in-app notify() succeeded
//     b) Retrying a possibly-already-delivered message risks double-sends
//        during Evolution flapping
//     c) Manual recovery is available (admin can flip flag back to false
//        via pg/query if a real outage was confirmed)
//   Alternative behaviour (don't flip on send failure) would risk message
//   storms during Evolution outages — much worse outcome.
// ────────────────────────────────────────────────────────────────────────────

interface FollowUpRow {
  id: string;
  lead_id: string;
  assigned_to: string;
  due_at: string;
  reminder_at: string;
  title: string | null;
}

interface LeadRow {
  id: string;
  name: string;
  phone: string | null;
}

interface InstanceRow {
  instance_name: string;
  agent_username: string;
  phone_number: string | null;
  status: string | null;
  last_connected_at: string | null;
}

interface ProcessError {
  follow_up_id: string;
  reason: string;
}

/**
 * Normalize a phone number to digits-only with UAE country code if it
 * looks like a local number. Mirrors the helper in the WhatsApp webhook
 * (app/api/dashboard/sales/whatsapp/webhook/route.ts:30) — kept inline
 * to avoid a cross-module import.
 */
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0') && digits.length === 10) return `971${digits.slice(1)}`;
  if (digits.length < 7) return null;
  return digits;
}

/** Format a UTC ISO timestamp to a human-readable Dubai-time string. */
function formatDubaiTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ar-EG', {
      timeZone: 'Asia/Dubai',
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function buildReminderMessage(args: {
  leadName: string;
  leadPhone: string | null;
  followUpTitle: string | null;
  dueAt: string;
  leadId: string;
}): string {
  const title = args.followUpTitle || 'متابعة';
  const phoneLine = args.leadPhone ? `\nهاتف: +${args.leadPhone}` : '';
  return [
    `🔔 تذكير: ${title}`,
    `العميل: ${args.leadName}${phoneLine}`,
    `موعد الاستحقاق: ${formatDubaiTime(args.dueAt)}`,
    '',
    `افتح صفحة العميل المحتمل:`,
    `https://workspace.pyramedia.cloud/dashboard/crm/leads/${args.leadId}`,
  ].join('\n');
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);

    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.follow-up-reminders') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.follow-up-reminders', 403);
    }

    const supabase = createServiceRoleClient();
    const nowIso = new Date().toISOString();

    // ── SELECT pending follow-ups (uses partial index from migration 013) ──
    const { data: dueRows, error: dueErr } = await supabase
      .from('pyra_sales_follow_ups')
      .select('id, lead_id, assigned_to, due_at, reminder_at, title')
      .eq('status', 'pending')
      .eq('whatsapp_reminder_sent', false)
      .eq('send_whatsapp_reminder', true)
      .lte('reminder_at', nowIso)
      .order('reminder_at', { ascending: true });

    if (dueErr) {
      console.error('[cron/follow-up-reminders] SELECT failed:', dueErr.message);
      return apiServerError();
    }

    const rows = ((dueRows ?? []) as unknown as FollowUpRow[]).filter(
      (r) => r.lead_id && r.assigned_to,
    );

    let sent = 0;
    let skippedNoInstance = 0;
    let skippedNoPhone = 0;
    const errors: ProcessError[] = [];

    // ── Sequential per-row processing ──
    for (const row of rows) {
      try {
        // Lead lookup (name + phone for the message body)
        const { data: leadData } = await supabase
          .from('pyra_sales_leads')
          .select('id, name, phone')
          .eq('id', row.lead_id)
          .maybeSingle();
        const lead = leadData as LeadRow | null;
        if (!lead) {
          errors.push({ follow_up_id: row.id, reason: 'lead not found' });
          // Still flip the flag — the row is orphaned and re-trying every
          // 5 minutes won't help. notify() to agent below would also
          // dangle the link, but at least surfaces the issue.
        }

        // Agent's connected WA instance lookup (Q-11-1)
        const { data: instData } = await supabase
          .from('pyra_whatsapp_instances')
          .select('instance_name, agent_username, phone_number, status, last_connected_at')
          .eq('agent_username', row.assigned_to)
          .eq('status', 'connected')
          .order('last_connected_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        const instance = instData as InstanceRow | null;

        const agentNumber = normalizePhone(instance?.phone_number ?? null);

        // ── Send WhatsApp to agent's number via their instance ──
        if (instance && agentNumber) {
          const messageText = buildReminderMessage({
            leadName: lead?.name ?? '—',
            leadPhone: normalizePhone(lead?.phone ?? null),
            followUpTitle: row.title,
            dueAt: row.due_at,
            leadId: row.lead_id,
          });
          try {
            await evolutionClient.sendText(instance.instance_name, {
              number: agentNumber,
              text: messageText,
            });
            sent++;
          } catch (sendErr) {
            const reason = sendErr instanceof Error ? sendErr.message : String(sendErr);
            console.error(
              `[cron/follow-up-reminders] Evolution send failed for follow_up=${row.id}:`,
              reason,
            );
            errors.push({ follow_up_id: row.id, reason: `evolution send failed: ${reason}` });
            // Per the idempotency trade-off documented at file top: STILL
            // flip whatsapp_reminder_sent=true below to avoid storm risk.
          }
        } else if (!instance) {
          skippedNoInstance++;
          console.warn(
            `[cron/follow-up-reminders] follow-up ${row.id} skipped — no connected WA instance for agent ${row.assigned_to}, falling back to in-app only`,
          );
        } else {
          // instance exists but no usable phone_number on it
          skippedNoPhone++;
          console.warn(
            `[cron/follow-up-reminders] follow-up ${row.id} skipped — instance ${instance.instance_name} has no phone_number, falling back to in-app only`,
          );
        }

        // ── Flip whatsapp_reminder_sent regardless of send outcome ──
        const { error: updateErr } = await supabase
          .from('pyra_sales_follow_ups')
          .update({ whatsapp_reminder_sent: true })
          .eq('id', row.id);
        if (updateErr) {
          console.error(
            `[cron/follow-up-reminders] failed to flip flag for follow_up=${row.id}:`,
            updateErr.message,
          );
        }

        // ── Always in-app notify the agent ──
        await notify(supabase, {
          to: row.assigned_to,
          type: 'follow_up_due',
          title: 'متابعة مستحقة',
          message: row.title || 'متابعة',
          link: lead ? `/dashboard/crm/leads/${row.lead_id}` : undefined,
          entity: { type: 'follow_up', id: row.id },
          from: { username: 'system' },
        });
      } catch (rowErr) {
        const reason = rowErr instanceof Error ? rowErr.message : String(rowErr);
        console.error(`[cron/follow-up-reminders] row=${row.id} threw:`, reason);
        errors.push({ follow_up_id: row.id, reason });
      }
    }

    return apiSuccess({
      processed: rows.length,
      sent,
      skipped_no_instance: skippedNoInstance,
      skipped_no_phone: skippedNoPhone,
      errors,
    });
  } catch (err) {
    console.error('POST /api/cron/follow-up-reminders threw:', err);
    return apiServerError();
  }
}
