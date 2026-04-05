import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET /api/dashboard/sales/whatsapp/csat/stats
 * CSAT analytics: average rating, trend over time, per-agent breakdown.
 * Query params: from, to, agent
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const { searchParams } = req.nextUrl;
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const agent = searchParams.get('agent');

    const supabase = createServiceRoleClient();

    // Fetch all matching surveys
    let query = supabase
      .from('pyra_csat_surveys')
      .select('id, rating, agent_username, created_at, submitted_at')
      .not('rating', 'is', null);

    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);
    if (agent) query = query.eq('agent_username', agent);

    const { data: surveys, error } = await query;
    if (error) {
      console.error('[GET /csat/stats] error:', error.message);
      return apiServerError();
    }

    const ratings = (surveys || []).map(s => s.rating).filter((r): r is number => r !== null);
    const total = ratings.length;
    const average = total > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / total) * 10) / 10
      : 0;

    // Distribution
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of ratings) {
      if (r >= 1 && r <= 5) distribution[r]++;
    }

    // Per-agent breakdown
    const agentMap: Record<string, { total: number; sum: number; count: number }> = {};
    for (const s of (surveys || [])) {
      const ag = s.agent_username || 'unassigned';
      if (!agentMap[ag]) agentMap[ag] = { total: 0, sum: 0, count: 0 };
      agentMap[ag].total++;
      if (s.rating) {
        agentMap[ag].sum += s.rating;
        agentMap[ag].count++;
      }
    }

    const byAgent = Object.entries(agentMap).map(([agentName, stats]) => ({
      agent: agentName,
      average: stats.count > 0 ? Math.round((stats.sum / stats.count) * 10) / 10 : 0,
      count: stats.total,
    })).sort((a, b) => b.average - a.average);

    // Trend over time — group by date
    const trendMap: Record<string, { sum: number; count: number }> = {};
    for (const s of (surveys || [])) {
      if (!s.created_at || !s.rating) continue;
      const date = s.created_at.slice(0, 10); // YYYY-MM-DD
      if (!trendMap[date]) trendMap[date] = { sum: 0, count: 0 };
      trendMap[date].sum += s.rating;
      trendMap[date].count++;
    }

    const trend = Object.entries(trendMap)
      .map(([date, stats]) => ({
        date,
        average: Math.round((stats.sum / stats.count) * 10) / 10,
        count: stats.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return apiSuccess({
      average,
      total,
      distribution,
      byAgent,
      trend,
    });
  } catch (err) {
    console.error('[GET /csat/stats] error:', err);
    return apiServerError();
  }
}
