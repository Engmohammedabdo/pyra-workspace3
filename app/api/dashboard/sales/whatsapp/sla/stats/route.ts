import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';

/**
 * GET /api/dashboard/sales/whatsapp/sla/stats
 * SLA compliance statistics.
 */
export async function GET(request: NextRequest) {
  const auth = await getApiAuth();
  if (!auth) return apiError('غير مصرح', 401);

  try {
    const supabase = createServiceRoleClient();
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);

    const since = new Date();
    since.setDate(since.getDate() - days);

    // Get all conversations with SLA policies in the time range
    const { data: conversations } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('id, assigned_to, sla_first_response_breached, sla_resolution_breached, first_reply_at, resolved_at, created_at, sla_first_response_due, sla_resolution_due')
      .not('sla_policy_id', 'is', null)
      .gte('created_at', since.toISOString());

    if (!conversations || conversations.length === 0) {
      return apiSuccess({
        total: 0,
        within_sla: 0,
        breached: 0,
        compliance_rate: 100,
        avg_first_response_mins: 0,
        avg_resolution_mins: 0,
        by_agent: [],
      });
    }

    const total = conversations.length;
    const breached = conversations.filter(
      c => c.sla_first_response_breached || c.sla_resolution_breached
    ).length;
    const withinSla = total - breached;
    const complianceRate = total > 0 ? Math.round((withinSla / total) * 100) : 100;

    // Average first response time (minutes) — only for conversations with first_reply_at
    const responseTimesMinutes: number[] = [];
    for (const conv of conversations) {
      if (conv.first_reply_at && conv.created_at) {
        const created = new Date(conv.created_at).getTime();
        const replied = new Date(conv.first_reply_at).getTime();
        const diffMins = Math.round((replied - created) / 60000);
        if (diffMins >= 0) responseTimesMinutes.push(diffMins);
      }
    }
    const avgFirstResponseMins = responseTimesMinutes.length > 0
      ? Math.round(responseTimesMinutes.reduce((a, b) => a + b, 0) / responseTimesMinutes.length)
      : 0;

    // Average resolution time (minutes) — only for resolved conversations
    const resolutionTimesMinutes: number[] = [];
    for (const conv of conversations) {
      if (conv.resolved_at && conv.created_at) {
        const created = new Date(conv.created_at).getTime();
        const resolved = new Date(conv.resolved_at).getTime();
        const diffMins = Math.round((resolved - created) / 60000);
        if (diffMins >= 0) resolutionTimesMinutes.push(diffMins);
      }
    }
    const avgResolutionMins = resolutionTimesMinutes.length > 0
      ? Math.round(resolutionTimesMinutes.reduce((a, b) => a + b, 0) / resolutionTimesMinutes.length)
      : 0;

    // Stats by agent
    const agentMap = new Map<string, { total: number; breached: number; within_sla: number }>();
    for (const conv of conversations) {
      const agent = conv.assigned_to || 'غير مسند';
      if (!agentMap.has(agent)) {
        agentMap.set(agent, { total: 0, breached: 0, within_sla: 0 });
      }
      const entry = agentMap.get(agent)!;
      entry.total++;
      if (conv.sla_first_response_breached || conv.sla_resolution_breached) {
        entry.breached++;
      } else {
        entry.within_sla++;
      }
    }

    const byAgent = Array.from(agentMap.entries()).map(([agent, stats]) => ({
      agent,
      ...stats,
      compliance_rate: stats.total > 0 ? Math.round((stats.within_sla / stats.total) * 100) : 100,
    }));

    return apiSuccess({
      total,
      within_sla: withinSla,
      breached,
      compliance_rate: complianceRate,
      avg_first_response_mins: avgFirstResponseMins,
      avg_resolution_mins: avgResolutionMins,
      by_agent: byAgent,
    });
  } catch (err) {
    return apiServerError(err instanceof Error ? err.message : 'خطأ في الخادم');
  }
}
