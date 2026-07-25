import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../_lib/device-auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/log-error';

const FOLLOW_UP_LIMIT = 20;
const GOING_COLD_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

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
  last_contact_at: string | null;
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
// Two sections:
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
//                 be reported as "going cold, no plan".
//
// `counts` carries the TRUE total for each list (independent of the 20-row
// cap) so the app can render "20 من 34" without a second round trip.
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

    let coldQuery = supabase
      .from('pyra_sales_leads')
      .select('id, name, phone, company, last_contact_at, created_at', { count: 'exact' })
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

    if (excludeLeadIds.length > 0) {
      // Server-generated ids (generateId/nanoid alphabet — no delimiter
      // chars), not user input; quoted anyway for defensiveness.
      const idList = excludeLeadIds.map((id) => `"${id}"`).join(',');
      coldQuery = coldQuery.not('id', 'in', `(${idList})`);
    }

    const { data: coldRows, count: coldTotal, error: coldErr } = await coldQuery;
    if (coldErr) {
      logError({
        error: coldErr,
        request,
        metadata: { action: 'mobile_my_day_going_cold', agentUsername },
      });
      return apiServerError();
    }

    // Breach alarm: if the TRUE count (unaffected by `.limit()`) ever
    // exceeds the fetch cap, the "coldest 20" selection below is computed
    // over an INCOMPLETE candidate pool — never let that happen silently.
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

    // Precise "oldest effective contact first" sort in JS (see
    // GOING_COLD_FETCH_CAP comment above for why this can't be a DB .order()),
    // then slice to the response cap.
    const coldCandidates = ((coldRows ?? []) as ColdLeadRow[]).map((lead) => {
      const createdMs = new Date(lead.created_at).getTime();
      const lastContactMs = lead.last_contact_at ? new Date(lead.last_contact_at).getTime() : null;
      const effectiveMs = lastContactMs !== null ? Math.max(lastContactMs, createdMs) : createdMs;
      return { lead, effectiveMs };
    });
    coldCandidates.sort((a, b) => a.effectiveMs - b.effectiveMs);
    const goingCold = coldCandidates.slice(0, GOING_COLD_LIMIT).map(({ lead, effectiveMs }) => ({
      lead_id: lead.id,
      lead_name: lead.name,
      phone: lead.phone,
      company: lead.company,
      days_since_contact: Math.floor((now - effectiveMs) / DAY_MS),
    }));

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
      counts: {
        follow_ups: followUpTotal ?? followUpItems.length,
        going_cold: coldTotal ?? goingCold.length,
      },
    });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_my_day' } });
    return apiServerError();
  }
}
