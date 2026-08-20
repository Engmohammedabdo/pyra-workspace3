import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/auth/rbac';
import { dubaiDayKey } from '@/lib/utils/format';
import { resolveOutgoingAgent } from '@/lib/whatsapp/attribution';
import { computeWhatsappReport } from '@/lib/whatsapp/report';
import { logError } from '@/lib/observability/log-error';
import { chunk } from '@/lib/utils/chunk';

/** Matches the deals-at-risk / lead-idle-check / ai-insights convention. */
const ID_BATCH = 150;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Dubai-offset (UTC+4, no DST) half-open [start, end) bounds for a given
 * YYYY-MM month key. Mirrors the Phase 15.1 `dubaiDayKey`/`toDubaiIso`
 * doctrine — never derive "this month in Dubai" via `.toISOString()` UTC
 * slicing. Copied from app/api/crm/calls/report/route.ts (no shared export
 * exists for this helper).
 */
function dubaiMonthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    start: `${y}-${pad(m)}-01T00:00:00+04:00`,
    end: `${nextY}-${pad(nextM)}-01T00:00:00+04:00`,
  };
}

/**
 * GET /api/crm/whatsapp/report?month=YYYY-MM
 *
 * Permission: sales_whatsapp.view (BASE for sales_agent via ROLE_EXTRAS; admin via '*').
 * Scope: crm_reports.team_view holders (manager/admin) see ALL agents;
 * everyone else is scoped to their own credited rows.
 *
 * Mirrors app/api/crm/calls/report/route.ts: gate THEN service-role client,
 * resolve credit_agent/lead_owned server-side, hand pure rows to the
 * aggregator, batched display-name lookup, omit zero-activity agents.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const month = request.nextUrl.searchParams.get('month') || dubaiDayKey(new Date()).slice(0, 7);
    if (!MONTH_RE.test(month)) {
      const t = await getTranslations('api');
      return apiError(t('crm.monthFormatInvalid'));
    }
    const { start, end } = dubaiMonthBounds(month);

    const seeAll = hasPermission(auth.pyraUser.rolePermissions, 'crm_reports.team_view');
    const me = auth.pyraUser.username;

    const supabase = createServiceRoleClient();

    // Line holders (colour line => the credited agent).
    const { data: lines } = await supabase
      .from('pyra_whatsapp_instances')
      .select('instance_name, agent_username');
    const holderByLine: Record<string, string | null> = {};
    for (const l of lines ?? []) holderByLine[l.instance_name] = l.agent_username ?? null;

    // Messages in-month. Explicit .order + .range so the aggregation below
    // sees EVERY message in the month — same rationale as the calls report:
    // without .range the implicit PostgREST 1000-row default silently
    // truncates a busy team month, and without ORDER BY which rows survive
    // is nondeterministic.
    const { data: msgs, error: msgsError } = await supabase
      .from('pyra_whatsapp_messages')
      .select('agent_username, instance_name, direction, timestamp, conversation_id, lead_id')
      .gte('timestamp', start)
      .lt('timestamp', end)
      .order('timestamp', { ascending: true })
      .range(0, 99999);
    if (msgsError) throw msgsError;

    // Conversations + leads referenced (for credit + lead ownership). Both id
    // lists are month-scale and unbounded, so a single `.in()` can exceed the
    // proxy's header/query-string limit (the same 414 that killed the
    // lead-idle-check cron) — batch at ID_BATCH like deals-at-risk /
    // lead-idle-check / ai-insights and concatenate the pages.
    const convIds = [...new Set((msgs ?? []).map((m) => m.conversation_id).filter(Boolean))] as string[];
    const leadIds = [...new Set((msgs ?? []).map((m) => m.lead_id).filter(Boolean))] as string[];

    const convs: Array<{ id: string; instance_name: string; assigned_to: string | null; status: string }> = [];
    for (const idBatch of chunk(convIds, ID_BATCH)) {
      const { data } = await supabase
        .from('pyra_whatsapp_conversations')
        .select('id, instance_name, assigned_to, status')
        .in('id', idBatch);
      if (data) convs.push(...data);
    }

    const leads: Array<{ id: string; assigned_to: string | null }> = [];
    for (const idBatch of chunk(leadIds, ID_BATCH)) {
      const { data } = await supabase.from('pyra_sales_leads').select('id, assigned_to').in('id', idBatch);
      if (data) leads.push(...data);
    }

    const convById: Record<string, { instance_name: string; assigned_to: string | null; status: string }> = {};
    for (const c of convs) convById[c.id] = c;
    const leadOwner: Record<string, string | null> = {};
    for (const l of leads) leadOwner[l.id] = l.assigned_to ?? null;

    // Resolve credit per message and lead ownership; build pure aggregator input.
    const creditForConv = (cid: string | null): string | null => {
      if (!cid) return null;
      const c = convById[cid];
      if (!c) return null;
      return resolveOutgoingAgent({ lineHolder: holderByLine[c.instance_name], conversationAssignee: c.assigned_to });
    };
    const messagesAll = (msgs ?? []).map((m) => {
      const credit = m.agent_username ?? creditForConv(m.conversation_id);
      const owner = m.lead_id ? leadOwner[m.lead_id] ?? null : null;
      return {
        credit_agent: credit,
        direction: m.direction as 'incoming' | 'outgoing',
        timestamp: m.timestamp as string,
        conversation_id: m.conversation_id as string | null,
        lead_id: m.lead_id as string | null,
        lead_owned: !!owner && owner === credit,
      };
    });
    const conversationsAll = convs.map((c) => ({
      id: c.id,
      credit_agent: resolveOutgoingAgent({ lineHolder: holderByLine[c.instance_name], conversationAssignee: c.assigned_to }),
      status: c.status,
    }));

    // Scope BEFORE aggregating — not just the agents list afterward. The
    // aggregator's per_day tally is unconditional (every message in the
    // input, regardless of credit — see lib/whatsapp/report.ts), so handing
    // it the full-team message set would leak the whole team's daily volume
    // into a non-team_view agent's per_day chart even though `agents` was
    // filtered to just them. The calls report avoids this the same way: its
    // DB query is pre-filtered by agent_username BEFORE computeCallsReport
    // runs, never after.
    const messages = seeAll ? messagesAll : messagesAll.filter((m) => m.credit_agent === me);
    const conversations = seeAll ? conversationsAll : conversationsAll.filter((c) => c.credit_agent === me);

    const todayKey = dubaiDayKey(new Date());
    const agg = computeWhatsappReport({ messages, conversations, todayKey });

    // Display names + zero-activity omission (mirror calls). Scoping already
    // happened above, so per_agent only ever contains `me` when !seeAll.
    const usernames = Object.keys(agg.per_agent);
    const { data: users } = usernames.length
      ? await supabase.from('pyra_users').select('username, display_name').in('username', usernames)
      : { data: [] as Array<{ username: string; display_name: string }> };
    const nameByUser: Record<string, string> = {};
    for (const u of users ?? []) nameByUser[u.username] = u.display_name;

    const agents = usernames.map((u) => ({ username: u, display_name: nameByUser[u] ?? u, ...agg.per_agent[u] }));

    return apiSuccess({ month, scope: seeAll ? 'all' : 'own', agents, per_day: agg.per_day });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'whatsapp_report' } });
    return apiServerError();
  }
}
