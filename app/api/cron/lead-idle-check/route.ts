import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { notify } from '@/lib/notifications/notify';
import { PIPELINE_FINAL_STAGES } from '@/lib/constants/statuses';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/cron/lead-idle-check
//
// Auth: x-api-key header → pyra_api_keys
// Permission: 'cron.lead-idle-check' (or '*' wildcard)
// Schedule: daily 09:00 Asia/Dubai via n8n Schedule Trigger → HTTP Request
//
// Logic per CRM-PRD §03 lines 480-495:
//   - SELECT non-converted active-pipeline leads with assigned_to NOT NULL
//     (Q-C3-2 c — skip unassigned; admin can find them via the leads list)
//   - For each lead: compute "last activity" = max of (last lead_activities
//     row, lead.last_contact_at). If both null → treat as "never touched"
//     and idle.
//   - Filter to leads idle ≥ 7 days
//   - Per-lead activity dedup (Q-11-2): skip if an idle_warning activity
//     was already inserted for this lead in the past 7 days
//   - INSERT idle_warning activity for the remaining leads
//   - Group remaining leads by assigned_to and notify each agent ONCE per
//     Asia/Dubai day (Q-11-3) with a grouped count + total expected_value
//
// Idempotency:
//   - Activities: 7-day window — daily cron can run repeatedly without
//     spamming the timeline. Each lead gets at most one idle_warning per
//     7-day idle period.
//   - Notifications: 1 grouped notification per agent per Dubai-day. Re-
//     running the cron same day is a no-op for already-notified agents.
//
// Time-zone safety:
//   "Today" boundary uses (NOW() AT TIME ZONE 'Asia/Dubai')::date so the
//   daily idempotency works correctly regardless of DB-server timezone.
// ────────────────────────────────────────────────────────────────────────────

const IDLE_THRESHOLD_DAYS = 7;
const IDLE_DEDUP_WINDOW_DAYS = 7;

interface LeadRow {
  id: string;
  name: string;
  assigned_to: string;
  expected_value: string | number | null;
  expected_value_currency: string | null;
  last_contact_at: string | null;
  stage_id: string | null;
}

interface ActivityRow {
  lead_id: string;
  created_at: string;
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);

    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.lead-idle-check') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.lead-idle-check', 403);
    }

    const supabase = createServiceRoleClient();
    const now = Date.now();
    const idleThresholdMs = IDLE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
    const idleCutoff = now - idleThresholdMs;
    const dedupCutoffIso = new Date(now - IDLE_DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // ── Q1: Active-pipeline non-converted leads with assigned_to ──
    const { data: leadData, error: leadErr } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, assigned_to, expected_value, expected_value_currency, last_contact_at, stage_id')
      .eq('is_converted', false)
      .not('stage_id', 'in', `(${PIPELINE_FINAL_STAGES.map((s) => `"${s}"`).join(',')})`)
      .not('assigned_to', 'is', null);

    if (leadErr) {
      console.error('[cron/lead-idle-check] leads SELECT failed:', leadErr.message);
      return apiServerError();
    }

    const allLeads = ((leadData ?? []) as unknown as LeadRow[]).filter((l) => l.assigned_to);
    const leadsChecked = allLeads.length;
    if (leadsChecked === 0) {
      return apiSuccess({
        leads_checked: 0,
        leads_idle: 0,
        activities_inserted: 0,
        activities_skipped_recent: 0,
        agents_notified: 0,
        agents_already_notified_today: 0,
      });
    }

    const leadIds = allLeads.map((l) => l.id);

    // ── Q2: Most-recent activity per lead (across all activity types) ──
    const { data: actData } = await supabase
      .from('pyra_lead_activities')
      .select('lead_id, created_at')
      .in('lead_id', leadIds)
      .order('created_at', { ascending: false });

    const lastActivityByLead = new Map<string, string>();
    for (const row of ((actData ?? []) as unknown as ActivityRow[])) {
      // First row per lead is the most recent (we ordered DESC)
      if (!lastActivityByLead.has(row.lead_id)) {
        lastActivityByLead.set(row.lead_id, row.created_at);
      }
    }

    // ── Filter to truly idle leads ──
    const idleLeads: LeadRow[] = [];
    for (const lead of allLeads) {
      const lastActivity = lastActivityByLead.get(lead.id);
      const lastTouched = Math.max(
        lastActivity ? new Date(lastActivity).getTime() : 0,
        lead.last_contact_at ? new Date(lead.last_contact_at).getTime() : 0,
      );
      // lastTouched=0 means both signals are null → never touched → idle
      if (lastTouched === 0 || lastTouched < idleCutoff) {
        idleLeads.push(lead);
      }
    }
    const leadsIdle = idleLeads.length;

    if (leadsIdle === 0) {
      return apiSuccess({
        leads_checked: leadsChecked,
        leads_idle: 0,
        activities_inserted: 0,
        activities_skipped_recent: 0,
        agents_notified: 0,
        agents_already_notified_today: 0,
      });
    }

    // ── Q3: Per-lead 7-day idle_warning dedup (Q-11-2) ──
    const idleLeadIds = idleLeads.map((l) => l.id);
    const { data: recentWarnings } = await supabase
      .from('pyra_lead_activities')
      .select('lead_id')
      .in('lead_id', idleLeadIds)
      .eq('activity_type', 'idle_warning')
      .gte('created_at', dedupCutoffIso);

    const alreadyWarnedSet = new Set(
      ((recentWarnings ?? []) as Array<{ lead_id: string }>).map((r) => r.lead_id),
    );
    const newlyIdleLeads = idleLeads.filter((l) => !alreadyWarnedSet.has(l.id));
    const activitiesSkippedRecent = leadsIdle - newlyIdleLeads.length;

    // ── INSERT idle_warning activities for newly-idle leads ──
    let activitiesInserted = 0;
    if (newlyIdleLeads.length > 0) {
      const inserts = newlyIdleLeads.map((l) => {
        const lastActivity = lastActivityByLead.get(l.id);
        const lastTouchedIso = lastActivity ?? l.last_contact_at;
        const daysIdle = lastTouchedIso
          ? Math.floor((now - new Date(lastTouchedIso).getTime()) / (24 * 60 * 60 * 1000))
          : null;
        return {
          id: generateId('la'),
          lead_id: l.id,
          activity_type: 'idle_warning' as const,
          description: daysIdle != null
            ? `لا يوجد نشاط منذ ${daysIdle} يوم`
            : 'لا يوجد نشاط منذ إنشاء العميل المحتمل',
          metadata: {
            days_idle: daysIdle,
            expected_value: Number(l.expected_value) || 0,
            expected_value_currency: l.expected_value_currency || 'AED',
            last_touched_at: lastTouchedIso,
          },
          created_by: null, // system-generated
        };
      });
      const { error: insErr } = await supabase
        .from('pyra_lead_activities')
        .insert(inserts);
      if (insErr) {
        console.error('[cron/lead-idle-check] activity insert failed:', insErr.message);
        // Don't bail — still try notifications below; activities are best-effort.
      } else {
        activitiesInserted = inserts.length;
      }
    }

    // ── Group newly-idle leads by agent for notifications ──
    const byAgent = new Map<string, LeadRow[]>();
    for (const l of newlyIdleLeads) {
      const arr = byAgent.get(l.assigned_to) ?? [];
      arr.push(l);
      byAgent.set(l.assigned_to, arr);
    }

    // ── Q4: Per-agent daily idempotency (Q-11-3) ──
    // "Today" = current Asia/Dubai date. We pull all 'lead_idle_warning'
    // notifications created since the last Dubai-midnight; if any exist
    // for an agent, skip them.
    const agentsToCheck = Array.from(byAgent.keys());
    let agentsAlreadyNotifiedToday = 0;
    let agentsNotified = 0;

    if (agentsToCheck.length > 0) {
      // Compute today's Dubai-midnight as an ISO string for the lower-bound
      // filter. This keeps the timezone math entirely in JS (no postgres
      // timezone-conversion roundtrip).
      const dubaiToday = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' }),
      );
      dubaiToday.setHours(0, 0, 0, 0);
      // Convert that "Dubai midnight" back to a UTC ISO (accounting for
      // the +4h offset). We treat the constructed local-Date as if it
      // represented Dubai-time wall-clock and produce the equivalent UTC.
      const dubaiOffsetMs = 4 * 60 * 60 * 1000; // Asia/Dubai is UTC+4 (no DST)
      const dubaiTodayUtcIso = new Date(dubaiToday.getTime() - dubaiOffsetMs).toISOString();

      const { data: existingNotifs } = await supabase
        .from('pyra_notifications')
        .select('recipient_username')
        .in('recipient_username', agentsToCheck)
        .eq('type', 'lead_idle_warning')
        .gte('created_at', dubaiTodayUtcIso);

      const alreadyNotifiedSet = new Set(
        ((existingNotifs ?? []) as Array<{ recipient_username: string }>).map(
          (r) => r.recipient_username,
        ),
      );

      for (const [agent, leads] of byAgent) {
        if (alreadyNotifiedSet.has(agent)) {
          agentsAlreadyNotifiedToday++;
          continue;
        }
        const totalValue = leads.reduce((acc, l) => acc + (Number(l.expected_value) || 0), 0);
        const count = leads.length;
        const titleNoun = count === 1 ? 'صفقة' : 'صفقات';
        const message = totalValue > 0
          ? `${count} ${titleNoun} بدون نشاط منذ ٧+ أيام (إجمالي القيمة المتوقعة: ${Math.round(totalValue).toLocaleString('en-US')} درهم)`
          : `${count} ${titleNoun} بدون نشاط منذ ٧+ أيام`;
        await notify(supabase, {
          to: agent,
          type: 'lead_idle_warning',
          title: `${count} ${titleNoun} تحتاج متابعة`,
          message,
          link: '/dashboard/crm/pipeline?filter=at_risk',
          entity: { type: 'agent_idle_summary', id: dubaiTodayUtcIso.slice(0, 10) },
          from: { username: 'system' },
        });
        agentsNotified++;
      }
    }

    return apiSuccess({
      leads_checked: leadsChecked,
      leads_idle: leadsIdle,
      activities_inserted: activitiesInserted,
      activities_skipped_recent: activitiesSkippedRecent,
      agents_notified: agentsNotified,
      agents_already_notified_today: agentsAlreadyNotifiedToday,
    });
  } catch (err) {
    console.error('POST /api/cron/lead-idle-check threw:', err);
    return apiServerError();
  }
}
