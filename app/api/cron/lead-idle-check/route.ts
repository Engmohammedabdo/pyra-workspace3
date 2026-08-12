import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { notify } from '@/lib/notifications/notify';
import { PIPELINE_FINAL_STAGES } from '@/lib/constants/statuses';
import { logError } from '@/lib/observability/log-error';
import { dubaiDayKey } from '@/lib/utils/format';
import { chunk } from '@/lib/utils/chunk';
import { selectIdleNudges, type IdleCandidate } from '@/lib/crm/idle-eligibility';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/cron/lead-idle-check
//
// Auth: x-api-key header → pyra_api_keys
// Permission: 'cron.lead-idle-check' (or '*' wildcard)
// Schedule: daily 05:00 Asia/Dubai (01:00 UTC) via n8n Schedule Trigger →
//   HTTP Request. The n8n node was previously mislabeled "09:00 Dubai
//   (05:00 UTC)" — its cron expression (`0 5 * * *`) runs in the n8n
//   instance's default timezone, which is Asia/Dubai, so it actually fires
//   at 05:00 Dubai / 01:00 UTC. Corrected 2026-07-25 (urgent-fixes wave).
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
    const finalStagesList = PIPELINE_FINAL_STAGES.map((s) => `"${s}"`).join(',');
    const { data: leadData, error: leadErr } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, assigned_to, expected_value, expected_value_currency, last_contact_at, stage_id')
      // is_converted IS NOT TRUE catches both false AND legacy NULL rows
      // (a bare .eq('is_converted', false) excludes NULLs).
      .not('is_converted', 'is', true)
      // Exclude final stages but KEEP null-stage leads — a bare NOT IN(...)
      // evaluates to NULL (not TRUE) for stage_id IS NULL and drops the row.
      .or(`stage_id.is.null,stage_id.not.in.(${finalStagesList})`)
      .not('assigned_to', 'is', null)
      // An archived lead is NOT idle — it is retired. Warning about one sends
      // the rep to /dashboard/crm/pipeline?filter=at_risk, a board that DOES
      // filter archived_at, so the bell links to a page where the lead cannot
      // appear. Worse, it repeats forever: the 7-day dedup keys on an
      // idle_warning activity ON THAT LEAD ID, so a duplicate-merge that moves
      // activities off the loser onto the survivor leaves the retired card
      // dedup-clean while its last_contact_at stays past the cutoff. Nulling
      // last_contact_at is no escape either — lastTouched === 0 is treated as
      // idle below.
      .is('archived_at', null);

    if (leadErr) {
      // Phase 14.1 Commit 2 — top-of-cron lead-SELECT failure means the
      // entire idle-check tick produces no warnings. Log with full context
      // for triage.
      logError({
        error: leadErr,
        request,
        metadata: { source: 'cron', job: 'lead-idle-check', stage: 'leads_select' },
      });
      console.error('[cron/lead-idle-check] leads SELECT failed:', leadErr.message);
      return apiServerError();
    }

    const ownedLeads = ((leadData ?? []) as unknown as LeadRow[]).filter((l) => l.assigned_to);
    // Only process leads owned by ACTIVE agents. A stranded lead on a departed
    // agent would otherwise generate idle_warnings + a daily grouped summary
    // delivered to a dead inbox nobody reads (that's the mechanism that kept the
    // orphaned-pipeline problem silent). The admin re-homes those via the
    // pipeline "المغادرين" filter instead.
    const { data: activeUsers, error: activeUsersErr } = await supabase
      .from('pyra_users')
      .select('username')
      .eq('status', 'active');
    if (activeUsersErr) {
      // A swallowed error here would empty activeSet, filtering out every
      // lead below — the cron would return SUCCESS with leads_checked: 0 and
      // log nothing, invisible even to the new error-digest. Fail closed.
      logError({
        error: activeUsersErr,
        request,
        metadata: { source: 'cron', job: 'lead-idle-check', stage: 'active_users_select' },
      });
      console.error('[cron/lead-idle-check] active users SELECT failed:', activeUsersErr.message);
      return apiServerError();
    }
    const activeSet = new Set((activeUsers ?? []).map((u) => u.username));
    const allLeads = ownedLeads.filter((l) => activeSet.has(l.assigned_to));
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
    // Batched: a single .in() with every lead id put ~13.5 KB in the query
    // string and PostgREST answered "URI too long" — the cron then failed
    // closed every day for 11 days (2026-07-14 → 2026-07-24) and nobody was
    // told. Batch size 150 keeps each URL well under the proxy's 8 KB header
    // buffer with room for the rest of the query.
    const LEAD_ID_BATCH = 150;
    const actRows: ActivityRow[] = [];
    for (const idBatch of chunk(leadIds, LEAD_ID_BATCH)) {
      const { data: actData, error: actErr } = await supabase
        .from('pyra_lead_activities')
        .select('lead_id, created_at')
        .in('lead_id', idBatch)
        // A call nobody answered is visible on the timeline but is NOT contact —
        // counting it here would suppress the idle warning for a lead the agent
        // has been unable to reach, which is exactly the lead that needs one.
        .neq('activity_type', 'call_attempt')
        .order('created_at', { ascending: false });
      if (actErr) {
        // A swallowed error here would leave lastActivityByLead empty, so leads
        // with a fresh note but null last_contact_at get mis-flagged idle → false
        // warnings that also poison the 7-day dedup. Fail closed instead.
        logError({
          error: actErr,
          request,
          metadata: { source: 'cron', job: 'lead-idle-check', stage: 'activities_select' },
        });
        console.error('[cron/lead-idle-check] activities SELECT failed:', actErr.message);
        return apiServerError();
      }
      actRows.push(...((actData ?? []) as unknown as ActivityRow[]));
    }

    const lastActivityByLead = new Map<string, string>();
    for (const row of actRows) {
      // Rows for a given lead all come from one batch (batches partition by
      // lead id), and each batch is DESC — but keep the max explicitly so this
      // stays correct if batching ever changes.
      const prev = lastActivityByLead.get(row.lead_id);
      if (!prev || row.created_at > prev) lastActivityByLead.set(row.lead_id, row.created_at);
    }

    // ── Filter to truly idle leads ──
    const idleLeads: LeadRow[] = [];
    const lastTouchedByLead = new Map<string, number>();
    for (const lead of allLeads) {
      const lastActivity = lastActivityByLead.get(lead.id);
      const lastTouched = Math.max(
        lastActivity ? new Date(lastActivity).getTime() : 0,
        lead.last_contact_at ? new Date(lead.last_contact_at).getTime() : 0,
      );
      // lastTouched=0 means both signals are null → never touched → idle
      if (lastTouched === 0 || lastTouched < idleCutoff) {
        idleLeads.push(lead);
        lastTouchedByLead.set(lead.id, lastTouched);
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
    // Batched for the same reason as Q2 — idleLeadIds can be just as large as
    // leadIds when the whole pipeline is stale (see the outage this fixed).
    const idleLeadIds = idleLeads.map((l) => l.id);
    const alreadyWarnedSet = new Set<string>();
    for (const idBatch of chunk(idleLeadIds, LEAD_ID_BATCH)) {
      const { data: recentWarnings, error: dedupErr } = await supabase
        .from('pyra_lead_activities')
        .select('lead_id')
        .in('lead_id', idBatch)
        .eq('activity_type', 'idle_warning')
        .gte('created_at', dedupCutoffIso);
      if (dedupErr) {
        // A swallowed error empties the dedup set → already-warned leads get a
        // duplicate idle_warning within the 7-day window. Fail closed.
        logError({
          error: dedupErr,
          request,
          metadata: { source: 'cron', job: 'lead-idle-check', stage: 'idle_dedup_select' },
        });
        console.error('[cron/lead-idle-check] idle_warning dedup SELECT failed:', dedupErr.message);
        return apiServerError();
      }
      for (const r of (recentWarnings ?? []) as Array<{ lead_id: string }>) {
        alreadyWarnedSet.add(r.lead_id);
      }
    }
    const newlyIdleLeads = idleLeads.filter((l) => !alreadyWarnedSet.has(l.id));
    const activitiesSkippedRecent = leadsIdle - newlyIdleLeads.length;

    // ── Which of these leads has ever been ANSWERED? Chunked because the
    // candidate set is unbounded and a bare .in() on it once 414'd this very
    // cron (see the chunk() helper's own doc). isConnectedCall semantics:
    // direction !== 'missed' && duration_seconds > 0 — a lead that only ever
    // got unanswered dials was never warm and must not qualify.
    const candidateLeadIds = newlyIdleLeads.map((l) => l.id);
    const connectedLeadIds = new Set<string>();
    for (const batch of chunk(candidateLeadIds, LEAD_ID_BATCH)) {
      const { data: callData, error: callErr } = await supabase
        .from('pyra_agent_calls')
        .select('lead_id')
        .in('lead_id', batch)
        .neq('direction', 'missed')
        .gt('duration_seconds', 0);
      if (callErr) {
        // Fail CLOSED for this batch: sending a nudge we cannot justify is
        // what this change exists to stop. Skipping one batch costs one day —
        // these leads simply aren't dedup-marked, so they're re-checked
        // tomorrow with a fresh query.
        logError({
          error: callErr,
          request,
          metadata: { source: 'cron', job: 'lead-idle-check', stage: 'connected_calls_select' },
        });
        console.error('[cron/lead-idle-check] connected-call lookup failed:', callErr.message);
        continue;
      }
      for (const row of (callData ?? []) as Array<{ lead_id: string | null }>) {
        if (row.lead_id) connectedLeadIds.add(row.lead_id);
      }
    }

    // ── Narrow to leads that were ever actually spoken to, capped per agent
    // per day (owner decision 2026-08-12 — see lib/crm/idle-eligibility.ts).
    // Sorted most-recently-spoken-to FIRST inside selectIdleNudges: a
    // conversation 8 days old is recoverable, one from 90 days ago is a
    // re-prospecting job, not a nudge. Only the SELECTED leads get an
    // idle_warning activity below — an unselected lead stays un-deduped and
    // is re-considered (and can win the cap) tomorrow.
    const selected = selectIdleNudges(
      newlyIdleLeads.map<IdleCandidate>((l) => ({
        leadId: l.id,
        agentUsername: l.assigned_to,
        lastTouchedMs: lastTouchedByLead.get(l.id) ?? 0,
        hasConnectedCall: connectedLeadIds.has(l.id),
      })),
    );
    const selectedIds = new Set(selected.map((c) => c.leadId));
    const selectedLeads = newlyIdleLeads.filter((l) => selectedIds.has(l.id));

    // ── INSERT idle_warning activities for the leads actually nudged today ──
    let activitiesInserted = 0;
    if (selectedLeads.length > 0) {
      const inserts = selectedLeads.map((l) => {
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

    // ── Group SELECTED leads by agent for notifications (not all newly-idle —
    // only the ones that earned a nudge above) ──
    const byAgent = new Map<string, LeadRow[]>();
    for (const l of selectedLeads) {
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

      // Not batched: agentsToCheck is bounded by the number of distinct
      // sales agents/admins in the whole system (3 active today) — nowhere
      // near the lead-id-count that caused the URI-too-long failure above.
      const { data: existingNotifs, error: notifDedupErr } = await supabase
        .from('pyra_notifications')
        .select('recipient_username')
        .in('recipient_username', agentsToCheck)
        .eq('type', 'lead_idle_warning')
        .gte('created_at', dubaiTodayUtcIso);
      if (notifDedupErr) {
        // A swallowed error empties the set → agents already notified today get
        // a duplicate grouped summary. Fail closed.
        logError({
          error: notifDedupErr,
          request,
          metadata: { source: 'cron', job: 'lead-idle-check', stage: 'notif_dedup_select' },
        });
        console.error('[cron/lead-idle-check] notif dedup SELECT failed:', notifDedupErr.message);
        return apiServerError();
      }

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
          // Dubai-day key for the grouping id — dubaiTodayUtcIso is the UTC
          // instant of Dubai-midnight ((D-1)T20:00Z), so .slice(0,10) yielded
          // the PREVIOUS UTC date. dubaiDayKey() returns the true Dubai date.
          entity: { type: 'agent_idle_summary', id: dubaiDayKey() },
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
    // Phase 14.1 Commit 2 — top-level cron failure. Per-row failures inside
    // the loop stay on console.error (transient row issues; not table-worthy).
    logError({
      error: err,
      request,
      metadata: { source: 'cron', job: 'lead-idle-check' },
    });
    console.error('POST /api/cron/lead-idle-check threw:', err);
    return apiServerError();
  }
}
