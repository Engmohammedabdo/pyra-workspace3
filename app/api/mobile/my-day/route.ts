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
// we fetch every matching row (bounded here, far above any single agent's
// realistic going-cold portfolio) and do the precise sort in JS below.
// `count: 'exact'` still reports the TRUE total regardless of this cap —
// same pattern (and same reasoning) as `GET /api/crm/follow-ups`, which
// documents that `.limit()`/`.range()` never affects the reported count.
const GOING_COLD_FETCH_CAP = 500;

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
//                 lead already surfaced in follow_ups (already actionable
//                 there).
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
    // Excludes leads already surfaced above — they're already actionable
    // via follow_ups, no need to double-list them here.
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
      .order('created_at', { ascending: true })
      .limit(GOING_COLD_FETCH_CAP);

    if (followUpLeadIds.length > 0) {
      // Server-generated ids (generateId/nanoid alphabet — no delimiter
      // chars), not user input; quoted anyway for defensiveness.
      const idList = followUpLeadIds.map((id) => `"${id}"`).join(',');
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
