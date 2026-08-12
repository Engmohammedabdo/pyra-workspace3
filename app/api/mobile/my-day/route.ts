import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../_lib/device-auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/log-error';
import { PIPELINE_TERMINAL_STAGE_IDS } from '@/lib/constants/statuses';
import { chunk } from '@/lib/utils/chunk';
import { MAX_ATTEMPTS } from '@/lib/calls/attempt-cadence';

const FOLLOW_UP_LIMIT = 20;
const GOING_COLD_LIMIT = 20;
const NEVER_CONTACTED_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

// Hoisted: a Set built once per module, not per request.
const TERMINAL_STAGE_SET = new Set(PIPELINE_TERMINAL_STAGE_IDS);

// Same PIPELINE_TERMINAL_STAGE_IDS source as TERMINAL_STAGE_SET above,
// reshaped into a PostgREST `in.(...)` literal for the never_contacted query
// below — one constant, two consumers, so going_cold and never_contacted can
// never disagree on what "terminal" means. Construction mirrors the proven
// NULL-safe idiom in app/api/cron/lead-idle-check/route.ts's `finalStagesList`
// (`stage_id.not.in.(...)` combined with `stage_id.is.null` via `.or()` — a
// bare NOT IN(...) evaluates to NULL, not TRUE, for a NULL stage_id and
// silently drops the row).
const TERMINAL_STAGES_FILTER_LIST = PIPELINE_TERMINAL_STAGE_IDS.map((s) => `"${s}"`).join(',');

// Generous fetch cap for the going-cold CANDIDATE set fetched from the DB,
// distinct from GOING_COLD_LIMIT (the response cap). Supabase's query
// builder can only `.order()` by a real column, but this feed's spec sorts
// by `greatest(last_contact_at, created_at)` — a computed expression — so
// we fetch every matching row (bounded here) and do the precise sort in JS
// below.
//
// Set ABOVE the entire system's lead count on purpose — 921 rows measured
// 2026-07-25 via `SELECT COUNT(*) FROM pyra_sales_leads` — with headroom for
// growth, so a single agent's going-cold candidate pool can NEVER be
// truncated: there are not enough leads in the whole system to fill 2000,
// let alone one agent's slice of it. The previous cap (500) was already
// below a plausible single-agent pool size and relied on `created_at ASC`
// ordering, which could silently rank a block of old-`created_at`/
// recent-`last_contact_at` rows ahead of genuinely never-contacted leads —
// see the `.order()` comment below for the second layer of defense. If this
// cap is ever hit again, it is NOT silent — see the breach check right
// after the query executes. This codebase has been burned before by silent
// PostgREST row caps (CLAUDE.md: "CRM counts: DB not JS" — fixed 14
// instances of exactly this class of bug).
//
// `count: 'exact'` still reports the TRUE total regardless of this cap —
// same pattern (and same reasoning) as `GET /api/crm/follow-ups`, which
// documents that `.limit()`/`.range()` never affects the reported count.
const GOING_COLD_FETCH_CAP = 2000;

interface FollowUpRow {
  id: string;
  lead_id: string | null;
  due_at: string;
  title: string;
  status: string;
}

interface ColdLeadRow {
  id: string;
  name: string;
  phone: string | null;
  company: string | null;
  stage_id: string | null;
  last_contact_at: string | null;
  created_at: string;
}

interface NeverContactedRow {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/mobile/my-day
//
// "شغل النهاردة" feed for the Android call-tracking app's Home screen.
// Auth: device key (`calls:device`) via `requireDeviceAuth`.
//
// `requireDeviceAuth` carries NO RBAC scope (no `canAccessLead` applied for
// free) — every query below filters by `agentUsername` itself. A missing
// filter here would leak the whole pipeline to any device.
//
// Three sections:
//   - follow_ups: assigned_to = me AND status IN (pending, overdue) AND
//                 due_at <= now()+1d, ordered due_at ASC, capped 20.
//   - going_cold: assigned_to = me AND archived_at IS NULL AND
//                 is_converted IS NOT TRUE (NULL-safe) AND
//                 greatest(last_contact_at, created_at) < now()-7d, ordered
//                 oldest-effective-contact first, capped 20, EXCLUDING any
//                 lead the agent has an OPEN follow-up for (status pending
//                 OR overdue) — ANY open follow-up, not just the (capped,
//                 ≤1-day-window) ones shown in follow_ups above. A lead with
//                 a follow-up due next week still has a plan and must not
//                 be reported as "going cold, no plan". The exclusion is
//                 applied in JS against the fetched candidate pool, NOT as a
//                 DB-side `.not('id','in',(...))` filter — an unbounded
//                 exclusion-by-id list has no safe chunk size and 500s the
//                 whole request once it's large enough (see the fix comment
//                 at the going_cold query below; this is the same URI-too-
//                 long failure class that killed the lead-idle-check cron
//                 for 11 days, UF-T3).
//                 Leads in a TERMINAL stage (PIPELINE_TERMINAL_STAGE_IDS —
//                 closed won, closed lost, «غير مهتم») are excluded: a lead
//                 the rep already marked not-interested must never come back
//                 as "you haven't called this person".
//   - never_contacted: assigned_to = me AND archived_at IS NULL AND
//                 last_contact_at IS NULL AND is_converted IS NOT TRUE
//                 (NULL-safe) AND phone IS NOT NULL AND stage_id NOT IN
//                 PIPELINE_TERMINAL_STAGE_IDS (NULL-safe, same constant
//                 going_cold excludes below — moving a lead to «غير مهتم» or
//                 a closed stage never sets last_contact_at, so without this
//                 a lead someone already dispositioned as dead would still
//                 tell the rep "nobody has called this — call it"), ordered
//                 created_at ASC (OLDEST first — the opposite of going_cold's
//                 ordering, and for the opposite reason: an untouched lead
//                 only decays, so
//                 the one that has waited longest is closest to being
//                 wasted, while a stale conversation is a re-prospecting
//                 job), capped 50. Measured 2026-08-12: 350 live leads have
//                 never been spoken to at all (271 cosette's, 76 youssef's),
//                 invisible to every section above because every one of them
//                 keys on a date these leads do not have.
//
// `counts` carries the TRUE total for each list (independent of the 20-row
// cap) so the app can render "20 من 34" without a second round trip.
// `never_contacted_count` is the same idea but reported alongside its list
// rather than nested in `counts`, matching the interface this feed was built
// against.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireDeviceAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { agentUsername } = auth;

    const supabase = createServiceRoleClient();
    const now = Date.now();
    const followUpCutoffIso = new Date(now + DAY_MS).toISOString();
    const coldCutoffIso = new Date(now - 7 * DAY_MS).toISOString();

    // ── Follow-ups: due today-or-sooner (incl. already-overdue), mine only ──
    const {
      data: followUpRows,
      count: followUpTotal,
      error: followUpErr,
    } = await supabase
      .from('pyra_sales_follow_ups')
      .select('id, lead_id, due_at, title, status', { count: 'exact' })
      .eq('assigned_to', agentUsername)
      .in('status', ['pending', 'overdue'])
      .lte('due_at', followUpCutoffIso)
      .order('due_at', { ascending: true })
      .limit(FOLLOW_UP_LIMIT);
    if (followUpErr) {
      logError({
        error: followUpErr,
        request,
        metadata: { action: 'mobile_my_day_follow_ups', agentUsername },
      });
      return apiServerError();
    }
    const followUps = (followUpRows ?? []) as FollowUpRow[];

    // ── True overdue count — what makes the app's third tab honest ──────
    // `followUpTotal` above merges overdue and pending into one number, so the
    // app could never split them without miscounting any rep with more than
    // the 20 rows the list returns (youssef: 108 overdue, measured
    // 2026-08-07). This is a HEAD count — no rows transferred.
    //
    // No due_at bound is needed: an `overdue` row is by definition already
    // past due, so it always satisfies the `due_at <= now+1d` filter the
    // follow-ups query uses. That is what guarantees overdue ⊆ follow_ups and
    // lets the app derive "due today" by subtraction.
    //
    // Fails SOFT: on error this reports null and the response still ships.
    // The app falls back to two tabs. Never take the screen down for a badge.
    const { count: overdueCountRaw, error: overdueErr } = await supabase
      .from('pyra_sales_follow_ups')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', agentUsername)
      .eq('status', 'overdue');
    if (overdueErr) {
      logError({
        severity: 'warning',
        error: overdueErr,
        request,
        metadata: { action: 'mobile_my_day_overdue_count', agentUsername },
      });
    }
    const overdueCount: number | null = overdueErr ? null : (overdueCountRaw ?? 0);

    // ── Going cold: mine, active (not archived/converted), 7+ days quiet ──
    // Rule: "going cold" means "a lead with NO plan". A lead the agent has
    // ANY open follow-up for already has a plan and must be excluded, even
    // when that follow-up is due later than the 1-day window `follow_ups`
    // shows above. So the exclusion set is its OWN unlimited query, NOT
    // derived from the capped `followUps` array (`.limit(20)`) — deriving it
    // from the capped list would silently cap the exclusion set at 20 lead
    // ids too, even when the agent has hundreds of open follow-ups, which
    // would leak leads-with-a-later-plan into "going cold, no plan".
    const { data: openFollowUpRows, error: openFollowUpErr } = await supabase
      .from('pyra_sales_follow_ups')
      .select('lead_id')
      .eq('assigned_to', agentUsername)
      .in('status', ['pending', 'overdue']);
    if (openFollowUpErr) {
      logError({
        error: openFollowUpErr,
        request,
        metadata: { action: 'mobile_my_day_open_follow_up_ids', agentUsername },
      });
      return apiServerError();
    }
    const excludeLeadIds = Array.from(
      new Set((openFollowUpRows ?? []).map((f) => f.lead_id).filter((x): x is string => !!x)),
    );

    // Lead ids from the CAPPED follow_ups list — used only below to batch-
    // enrich the follow_ups response with lead name/phone. NOT used for the
    // going-cold exclusion (see `excludeLeadIds` above).
    const followUpLeadIds = Array.from(
      new Set(followUps.map((f) => f.lead_id).filter((x): x is string => !!x)),
    );

    // The open-follow-up exclusion is applied in JS below (against
    // excludeLeadIds), NOT as a DB-side `.not('id','in',(...))` filter.
    // An exclusion-by-id filter has no safe chunk size: PostgREST
    // interpolates every excluded id into the request URL, so an agent
    // whose open-follow-up count grows large enough (measured: youssef had
    // 127 on 2026-07-25, ~3KB of ids — and nothing in the app COMPLETES a
    // follow-up from here, while 'call_again' outcomes only ADD to the set,
    // so it monotonically grows) eventually breaches the URL-length limit
    // and the whole my-day request 500s for that agent. That is the exact
    // failure class that killed the lead-idle-check cron for 11 days
    // (UF-T3, `.in()` over an unbounded id list). Fetching the full
    // cold-candidate pool unfiltered and excluding by id in JS sidesteps
    // the URL entirely — chunking doesn't apply here because this is an
    // EXCLUSION, not an inclusion: there's no way to fetch "everything
    // except these ids" in bounded chunks without re-introducing the same
    // giant filter.
    const { data: coldRows, count: coldTotal, error: coldErr } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, phone, company, stage_id, last_contact_at, created_at', { count: 'exact' })
      .eq('assigned_to', agentUsername)
      .is('archived_at', null)
      // IS NOT TRUE (never .eq(false)) — legacy rows have NULL is_converted
      // and a bare .eq(false) would silently drop them from this feed.
      .not('is_converted', 'is', true)
      // greatest(last_contact_at, created_at) < cutoff  ⇔  both operands are
      // individually < cutoff (the max of two values is below a bound iff
      // both are). Postgres GREATEST() ignores NULL args, so a NULL
      // last_contact_at collapses to "only created_at matters" — covered by
      // the `.is.null` branch of the .or() below.
      .lt('created_at', coldCutoffIso)
      .or(`last_contact_at.is.null,last_contact_at.lt.${coldCutoffIso}`)
      // Order by last_contact_at ASC NULLS FIRST (defensive, DB-level) —
      // NOT by created_at. Never-contacted leads (last_contact_at IS NULL)
      // are the coldest possible leads and must enter the fetched candidate
      // window FIRST. Ordering by created_at ASC let a block of leads with
      // a very old created_at but a recent-ish last_contact_at occupy the
      // whole capped window ahead of truly cold (never-contacted) leads,
      // because effective_contact = greatest(last_contact_at, created_at)
      // is always >= created_at — a created_at-ASC page is NOT a
      // effective_contact-ASC page. The JS `effectiveMs` sort below remains
      // the AUTHORITATIVE final ordering on the fetched page — it still
      // corrects the rare row where created_at > last_contact_at (e.g. a
      // call retroactively linked to a lead created after the call
      // happened, so last_contact_at predates created_at).
      .order('last_contact_at', { ascending: true, nullsFirst: true })
      .limit(GOING_COLD_FETCH_CAP);
    if (coldErr) {
      logError({
        error: coldErr,
        request,
        metadata: { action: 'mobile_my_day_going_cold', agentUsername },
      });
      return apiServerError();
    }

    // Breach alarm: if the TRUE count (unaffected by `.limit()`) ever
    // exceeds the fetch cap, `coldRows` is an INCOMPLETE candidate pool —
    // never let that happen silently. `coldTotal` is now the PRE-exclusion
    // count (the exclusion filter moved to JS below), which only widens
    // this check's trigger condition relative to the old DB-side-excluded
    // count — never narrows it, so the alarm stays at least as sensitive.
    if (typeof coldTotal === 'number' && coldTotal > GOING_COLD_FETCH_CAP) {
      const breachMessage =
        `going_cold candidate pool (${coldTotal}) exceeded GOING_COLD_FETCH_CAP ` +
        `(${GOING_COLD_FETCH_CAP}) for agent ${agentUsername} — the "coldest" ` +
        `selection may be computed over a truncated pool`;
      logError({
        severity: 'warning',
        error: breachMessage,
        request,
        metadata: {
          action: 'mobile_my_day_going_cold_cap_exceeded',
          agentUsername,
          coldTotal,
          cap: GOING_COLD_FETCH_CAP,
        },
      });
      console.warn('[mobile/my-day]', breachMessage);
    }

    // Exclude any lead the agent has an open follow-up for (see
    // `excludeLeadIds` above), THEN sort "oldest effective contact first" in
    // JS (see GOING_COLD_FETCH_CAP comment above for why the sort can't be
    // a DB .order()), then slice to the response cap. Filtering here instead
    // of in the DB query is exact — not approximate — as long as `coldRows`
    // captured the FULL cold-candidate pool, which the breach alarm above
    // already guarantees is never silently violated.
    const excludeLeadIdSet = new Set(excludeLeadIds);
    const coldCandidates = ((coldRows ?? []) as ColdLeadRow[])
      .filter((lead) => !excludeLeadIdSet.has(lead.id))
      // Terminal stages are excluded HERE, not in the SQL, on purpose:
      //   1. NULL-safe by construction. PostgREST's `stage_id NOT IN (...)`
      //      evaluates to NULL for a NULL stage_id and silently DROPS the row.
      //      `stage_id` is nullable (0 such rows measured 2026-08-07, but the
      //      column permits them) and a lead with no stage is the opposite of
      //      finished — it must stay in this feed.
      //   2. The query already carries one `.or(...)` for last_contact_at, and
      //      a NULL-safe stage filter needs a second one; repeated `or=` params
      //      are not a composition this codebase has verified.
      //   3. Same idiom as the open-follow-up exclusion two lines up. The full
      //      candidate pool is already fetched, with GOING_COLD_FETCH_CAP's
      //      breach alarm guaranteeing it is complete.
      // NOT the unbounded-`.in()` failure class (UF-T3): this is a 3-element
      // constant set, never per-agent data.
      .filter((lead) => !TERMINAL_STAGE_SET.has(lead.stage_id ?? ''))
      .map((lead) => {
        const createdMs = new Date(lead.created_at).getTime();
        const lastContactMs = lead.last_contact_at ? new Date(lead.last_contact_at).getTime() : null;
        const effectiveMs = lastContactMs !== null ? Math.max(lastContactMs, createdMs) : createdMs;
        return { lead, effectiveMs };
      });
    coldCandidates.sort((a, b) => a.effectiveMs - b.effectiveMs);
    const coldSlice = coldCandidates.slice(0, GOING_COLD_LIMIT);

    // ── Attempts per cold lead, scoped to the ≤20 leads this response ships —
    // EVERY dial counts, answered or not: the cadence (lib/calls/attempt-
    // cadence.ts) is about how many times we have tried this number, and an
    // unanswered dial is precisely the kind of try a rep forgets they already
    // made. Chunked for the same 414 reason as every other `.in()` on a
    // lead-id list in this codebase (see the connected-call / last-nudged
    // lookups in app/api/cron/lead-idle-check/route.ts for the identical
    // shape) — belt-and-suspenders here since GOING_COLD_LIMIT (20) never
    // exceeds one batch today, but a future limit bump must not silently
    // reopen the 414.
    const attemptsByLead = new Map<string, number>();
    const coldLeadIds = coldSlice.map(({ lead }) => lead.id);
    for (const batch of chunk(coldLeadIds, 150)) {
      const { data: attemptRows, error: attemptErr } = await supabase
        .from('pyra_agent_calls')
        .select('lead_id')
        .in('lead_id', batch);
      if (attemptErr) {
        // Best-effort like overdueCount/neverContactedErr above: a missing
        // count renders as no chip on the row, which is the pre-wave
        // behaviour. Never take the whole screen down for a badge.
        // `maxAttempts` is logged alongside so a future cadence change is
        // visible in the failure record without redeploying docs.
        logError({
          severity: 'warning',
          error: attemptErr,
          request,
          metadata: {
            action: 'mobile_my_day_attempt_counts',
            agentUsername,
            maxAttempts: MAX_ATTEMPTS,
          },
        });
        continue;
      }
      for (const row of (attemptRows ?? []) as Array<{ lead_id: string | null }>) {
        if (row.lead_id) attemptsByLead.set(row.lead_id, (attemptsByLead.get(row.lead_id) ?? 0) + 1);
      }
    }

    const goingCold = coldSlice.map(({ lead, effectiveMs }) => ({
      lead_id: lead.id,
      lead_name: lead.name,
      phone: lead.phone,
      company: lead.company,
      days_since_contact: Math.floor((now - effectiveMs) / DAY_MS),
      attempts_made: attemptsByLead.get(lead.id) ?? 0,
    }));

    // ── Never contacted: the cheapest sales in the company ────────────────
    // Measured 2026-08-12: 350 live leads have never been spoken to at all —
    // 271 of cosette's and 76 of youssef's — and 180 of them arrived in the
    // last 30 days. They are invisible today because every existing section
    // keys on a date that does not exist for them.
    //
    // Oldest FIRST, unlike the going-cold list: an untouched lead only decays,
    // and the one that has waited longest is the one closest to being wasted.
    //
    // `count: 'exact'` alongside the 50-row `.limit()` — same idiom as
    // follow_ups/going_cold above — so `never_contacted_count` is the TRUE
    // total (e.g. cosette's real 271), not silently capped to the 50 rows
    // the list itself returns.
    const {
      data: neverContactedRows,
      count: neverContactedTotal,
      error: neverContactedErr,
    } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, phone, created_at', { count: 'exact' })
      .eq('assigned_to', agentUsername)
      .is('archived_at', null)
      .is('last_contact_at', null)
      .not('is_converted', 'is', true)
      .not('phone', 'is', null)
      // Terminal-stage exclusion (PIPELINE_TERMINAL_STAGE_IDS — the SAME
      // constant going_cold excludes above, so the two tabs can never
      // disagree on what "dead" means). Moving a lead to a terminal stage
      // never sets last_contact_at, so without this filter a lead someone
      // already marked «غير مهتم»/closed — but never called — kept showing
      // up here telling the rep to call a dead lead. NULL-safe via `.or()`,
      // same construction as lead-idle-check's `finalStagesList` filter: a
      // bare `stage_id NOT IN (...)` evaluates to NULL (not TRUE) for a NULL
      // stage_id and would silently drop the row, so a lead with no stage
      // must stay reachable via the explicit `.is.null` branch.
      .or(`stage_id.is.null,stage_id.not.in.(${TERMINAL_STAGES_FILTER_LIST})`)
      .order('created_at', { ascending: true })
      .limit(NEVER_CONTACTED_LIMIT);
    if (neverContactedErr) {
      // Fails SOFT: on error this reports null and the response still ships,
      // matching the overdueCount idiom (lines 170-177). The app falls back to
      // fewer tabs. Never take the screen down for one list. Null distinguishes
      // "unknown" from "confirmed zero" — the difference between "we couldn't
      // count" and "there are genuinely none".
      logError({
        severity: 'warning',
        error: neverContactedErr,
        request,
        metadata: { action: 'mobile_my_day_never_contacted', agentUsername },
      });
    }
    const neverContactedItems = ((neverContactedRows ?? []) as NeverContactedRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      created_at: r.created_at,
    }));
    // null on error (not 0) — the distinction between "unknown" and
    // "confirmed zero" is load-bearing for this count. Null means the query
    // failed; matching the overdueCount pattern (line 178). The app's
    // fourTabs logic (MyDayView.kt line 35) treats null the same as 0 for
    // tab visibility, but the semantic is different: null is "I don't know",
    // not "everyone has been called".
    const neverContactedCount: number | null = neverContactedErr
      ? null
      : (neverContactedTotal ?? neverContactedItems.length);

    // ── Enrich follow-ups with lead name/phone via ONE batched query ──
    // (going_cold needed none — pyra_sales_leads already carries
    // name/phone/company directly, it IS the primary table above.)
    let leadMap = new Map<string, { name: string; phone: string | null }>();
    if (followUpLeadIds.length > 0) {
      const { data: leadRows, error: leadErr } = await supabase
        .from('pyra_sales_leads')
        .select('id, name, phone')
        .in('id', followUpLeadIds);
      if (leadErr) {
        logError({
          error: leadErr,
          request,
          metadata: { action: 'mobile_my_day_lead_enrich', agentUsername },
        });
        return apiServerError();
      }
      leadMap = new Map(
        (leadRows ?? []).map((l) => [l.id as string, { name: l.name as string, phone: l.phone as string | null }]),
      );
    }

    const followUpItems = followUps.map((f) => {
      const lead = f.lead_id ? leadMap.get(f.lead_id) : undefined;
      return {
        id: f.id,
        lead_id: f.lead_id,
        lead_name: lead?.name ?? null,
        phone: lead?.phone ?? null,
        title: f.title,
        due_at: f.due_at,
        status: f.status as 'overdue' | 'pending',
      };
    });

    return apiSuccess({
      follow_ups: followUpItems,
      going_cold: goingCold,
      never_contacted: neverContactedItems,
      never_contacted_count: neverContactedCount,
      counts: {
        follow_ups: followUpTotal ?? followUpItems.length,
        // `coldTotal` (the DB `count: 'exact'`) can no longer be used here —
        // it's now PRE-exclusion (see the fetch above), so it would count
        // leads that already have an open follow-up. `coldCandidates.length`
        // is the POST-exclusion count and is exact — not approximate — as
        // long as `coldRows` captured the full candidate pool (guaranteed by
        // the breach alarm above, which fires loudly the one day it isn't).
        going_cold: coldCandidates.length,
        // null = the count query failed; the app renders two tabs instead of
        // three rather than showing a wrong number.
        overdue: overdueCount,
      },
    });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_my_day' } });
    return apiServerError();
  }
}
