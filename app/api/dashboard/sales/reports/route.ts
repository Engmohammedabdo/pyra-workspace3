import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET /api/dashboard/sales/reports?type=funnel|velocity|agents|aging|lost
 * Advanced sales reports with date filtering.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_leads.view');
    if (isApiError(auth)) return auth;

    const sp = request.nextUrl.searchParams;
    const reportType = sp.get('type');
    const from = sp.get('from');
    const to = sp.get('to');
    const agent = sp.get('agent');

    if (!reportType) {
      return apiValidationError('نوع التقرير مطلوب (funnel, velocity, agents, aging, lost)');
    }

    const supabase = createServiceRoleClient();

    switch (reportType) {
      case 'funnel':
        return await funnelReport(supabase, { from, to });
      case 'velocity':
        return await velocityReport(supabase, { from, to });
      case 'agents':
        return await agentsReport(supabase, { from, to, agent });
      case 'aging':
        return await agingReport(supabase);
      case 'lost':
        return await lostReport(supabase, { from, to });
      default:
        return apiValidationError('نوع التقرير غير صالح');
    }
  } catch (err) {
    console.error('GET /api/dashboard/sales/reports error:', err);
    return apiServerError();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

interface DateFilter {
  from?: string | null;
  to?: string | null;
  agent?: string | null;
}

/**
 * Funnel report — conversion by source.
 * How many leads from each source, and how many converted.
 */
async function funnelReport(supabase: SupabaseClient, { from, to }: DateFilter) {
  let query = supabase
    .from('pyra_sales_leads')
    .select('source, is_converted');

  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to + 'T23:59:59');

  const { data: leads, error } = await query;
  if (error) return apiServerError(error.message);

  const sourceLabels: Record<string, string> = {
    manual: 'يدوي', whatsapp: 'واتساب', website: 'موقع',
    referral: 'إحالة', ad: 'إعلان', social: 'سوشيال',
  };

  const grouped: Record<string, { total: number; converted: number }> = {};
  for (const lead of leads || []) {
    const src = lead.source || 'other';
    if (!grouped[src]) grouped[src] = { total: 0, converted: 0 };
    grouped[src].total++;
    if (lead.is_converted) grouped[src].converted++;
  }

  const funnel = Object.entries(grouped)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([source, data]) => ({
      source,
      sourceLabel: sourceLabels[source] || source,
      ...data,
      conversionRate: data.total > 0 ? Math.round((data.converted / data.total) * 100) : 0,
    }));

  return apiSuccess({
    funnel,
    totalLeads: (leads || []).length,
    totalConverted: (leads || []).filter((l: { is_converted: boolean }) => l.is_converted).length,
  });
}

/**
 * Velocity report — average days to convert.
 */
async function velocityReport(supabase: SupabaseClient, { from, to }: DateFilter) {
  let query = supabase
    .from('pyra_sales_leads')
    .select('created_at, converted_at')
    .eq('is_converted', true)
    .not('converted_at', 'is', null);

  if (from) query = query.gte('converted_at', from);
  if (to) query = query.lte('converted_at', to + 'T23:59:59');

  const { data: leads, error } = await query;
  if (error) return apiServerError(error.message);

  const velocities = (leads || []).map((l: { created_at: string; converted_at: string }) => {
    const days = Math.floor(
      (new Date(l.converted_at).getTime() - new Date(l.created_at).getTime()) / 86400000
    );
    return Math.max(0, days);
  });

  const avgDays = velocities.length > 0
    ? Math.round(velocities.reduce((a: number, b: number) => a + b, 0) / velocities.length)
    : 0;

  const medianDays = velocities.length > 0
    ? velocities.sort((a: number, b: number) => a - b)[Math.floor(velocities.length / 2)]
    : 0;

  // Group by month for trend
  const byMonth: Record<string, number[]> = {};
  for (let i = 0; i < (leads || []).length; i++) {
    const l = leads[i];
    const month = l.converted_at.substring(0, 7); // YYYY-MM
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(velocities[i]);
  }

  const trend = Object.entries(byMonth)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, days]) => ({
      month,
      avgDays: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
      count: days.length,
    }));

  return apiSuccess({ avgDays, medianDays, totalConverted: velocities.length, trend });
}

/**
 * Agents performance report.
 */
async function agentsReport(supabase: SupabaseClient, { from, to, agent }: DateFilter) {
  let query = supabase
    .from('pyra_sales_leads')
    .select('assigned_to, is_converted, score');

  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to + 'T23:59:59');
  if (agent) query = query.eq('assigned_to', agent);

  const { data: leads, error } = await query;
  if (error) return apiServerError(error.message);

  // Also get quotes linked to these agents' leads
  let quotesQuery = supabase
    .from('pyra_quotes')
    .select('total, lead_id, created_by');
  if (from) quotesQuery = quotesQuery.gte('created_at', from);
  if (to) quotesQuery = quotesQuery.lte('created_at', to + 'T23:59:59');

  const { data: quotes } = await quotesQuery;
  const quotesByCreator: Record<string, { count: number; totalValue: number }> = {};
  for (const q of quotes || []) {
    const creator = q.created_by || '';
    if (!quotesByCreator[creator]) quotesByCreator[creator] = { count: 0, totalValue: 0 };
    quotesByCreator[creator].count++;
    quotesByCreator[creator].totalValue += q.total || 0;
  }

  const agentMap: Record<string, { leads: number; converted: number; avgScore: number; scores: number[] }> = {};
  for (const lead of leads || []) {
    const a = lead.assigned_to || 'unassigned';
    if (!agentMap[a]) agentMap[a] = { leads: 0, converted: 0, avgScore: 0, scores: [] };
    agentMap[a].leads++;
    if (lead.is_converted) agentMap[a].converted++;
    if (lead.score != null) agentMap[a].scores.push(lead.score);
  }

  const agents = Object.entries(agentMap)
    .map(([username, data]) => ({
      username,
      leads: data.leads,
      converted: data.converted,
      conversionRate: data.leads > 0 ? Math.round((data.converted / data.leads) * 100) : 0,
      avgScore: data.scores.length > 0
        ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
        : 0,
      quotes: quotesByCreator[username]?.count || 0,
      quotesValue: quotesByCreator[username]?.totalValue || 0,
    }))
    .sort((a, b) => b.converted - a.converted);

  return apiSuccess({ agents });
}

/**
 * Aging report — how long leads have been in each stage.
 */
async function agingReport(supabase: SupabaseClient) {
  const { data: leads, error } = await supabase
    .from('pyra_sales_leads')
    .select('stage_id, updated_at, created_at')
    .eq('is_converted', false);

  if (error) return apiServerError(error.message);

  const { data: stages } = await supabase
    .from('pyra_sales_pipeline_stages')
    .select('id, name_ar, sort_order')
    .order('sort_order');

  const stageMap: Record<string, string> = {};
  for (const s of stages || []) stageMap[s.id] = s.name_ar;

  const now = Date.now();
  const aging: Record<string, { count: number; totalDays: number; maxDays: number }> = {};

  for (const lead of leads || []) {
    const stageId = lead.stage_id || 'unknown';
    if (!aging[stageId]) aging[stageId] = { count: 0, totalDays: 0, maxDays: 0 };
    const days = Math.floor((now - new Date(lead.updated_at || lead.created_at).getTime()) / 86400000);
    aging[stageId].count++;
    aging[stageId].totalDays += days;
    aging[stageId].maxDays = Math.max(aging[stageId].maxDays, days);
  }

  const result = (stages || []).map((stage: { id: string; name_ar: string }) => {
    const data = aging[stage.id] || { count: 0, totalDays: 0, maxDays: 0 };
    return {
      stageId: stage.id,
      stageName: stage.name_ar,
      count: data.count,
      avgDays: data.count > 0 ? Math.round(data.totalDays / data.count) : 0,
      maxDays: data.maxDays,
    };
  });

  return apiSuccess({ stages: result });
}

/**
 * Lost leads report — leads in "lost" stage with reasons.
 */
async function lostReport(supabase: SupabaseClient, { from, to }: DateFilter) {
  // Find the "lost" stage(s)
  const { data: lostStages } = await supabase
    .from('pyra_sales_pipeline_stages')
    .select('id')
    .or('name.ilike.%lost%,name.ilike.%خسر%,name_ar.ilike.%خسر%,name_ar.ilike.%فقد%');

  const lostStageIds = (lostStages || []).map((s: { id: string }) => s.id);

  if (lostStageIds.length === 0) {
    return apiSuccess({ leads: [], totalLost: 0 });
  }

  let query = supabase
    .from('pyra_sales_leads')
    .select('id, name, company, source, assigned_to, notes, created_at, updated_at')
    .in('stage_id', lostStageIds);

  if (from) query = query.gte('updated_at', from);
  if (to) query = query.lte('updated_at', to + 'T23:59:59');

  const { data: leads, error } = await query.order('updated_at', { ascending: false });
  if (error) return apiServerError(error.message);

  // Group by source
  const sourceLabels: Record<string, string> = {
    manual: 'يدوي', whatsapp: 'واتساب', website: 'موقع',
    referral: 'إحالة', ad: 'إعلان', social: 'سوشيال',
  };

  const bySource: Record<string, number> = {};
  for (const lead of leads || []) {
    const src = sourceLabels[lead.source] || lead.source || 'أخرى';
    bySource[src] = (bySource[src] || 0) + 1;
  }

  return apiSuccess({
    leads: leads || [],
    totalLost: (leads || []).length,
    bySource: Object.entries(bySource)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({ source, count })),
  });
}
