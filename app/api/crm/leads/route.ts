import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLeadScopeFilter } from '@/lib/auth/lead-scope';
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';

const LEAD_FIELDS = [
  'id', 'name', 'phone', 'email', 'company',
  'source', 'stage_id', 'assigned_to', 'client_id',
  'priority', 'last_contact_at', 'next_follow_up',
  'converted_at', 'is_converted',
  'lead_type', 'industry', 'deal_type',
  'expected_value', 'expected_value_currency', 'billing_cycle',
  'win_probability', 'win_probability_overridden',
  'lost_reason', 'contact_person', 'contact_role',
  'company_size', 'decision_maker', 'budget_range',
  'created_by', 'created_at', 'updated_at',
].join(', ');

/**
 * GET /api/crm/leads
 *
 * Permission: leads.view
 * Scope: admin sees all; non-admin scoped to assigned_to = self.
 *
 * Query params:
 *   stage_id, priority, lead_type, source, is_converted ('true'/'false'),
 *   assigned_to (admin only — non-admin override is silently ignored),
 *   search (matches name / company / phone),
 *   limit (default 50, max 200), offset (default 0),
 *   sort: 'last_contact_desc' | 'created_desc' | 'expected_value_desc' (default last_contact_desc)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('leads.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const sp = request.nextUrl.searchParams;

    const limitParam = parseInt(sp.get('limit') || '50', 10);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 200);
    const offsetParam = parseInt(sp.get('offset') || '0', 10);
    const offset = Math.max(Number.isFinite(offsetParam) ? offsetParam : 0, 0);

    let query = supabase
      .from('pyra_sales_leads')
      .select(LEAD_FIELDS, { count: 'exact' });

    // Scope: admin → unrestricted; sales_agent → own only.
    const scopeFilter = getLeadScopeFilter(auth.pyraUser.role, auth.pyraUser.username);
    if (scopeFilter) {
      query = query.eq(scopeFilter.column, scopeFilter.value);
    } else {
      // Admin can override owner via ?assigned_to=
      const ownerParam = sp.get('assigned_to')?.trim();
      if (ownerParam) query = query.eq('assigned_to', ownerParam);
    }

    const stageId = sp.get('stage_id')?.trim();
    if (stageId) query = query.eq('stage_id', stageId);

    const priority = sp.get('priority')?.trim();
    if (priority) query = query.eq('priority', priority);

    const leadType = sp.get('lead_type')?.trim();
    if (leadType) query = query.eq('lead_type', leadType);

    const source = sp.get('source')?.trim();
    if (source) query = query.eq('source', source);

    const isConverted = sp.get('is_converted')?.trim();
    if (isConverted === 'true') query = query.eq('is_converted', true);
    else if (isConverted === 'false') query = query.eq('is_converted', false);

    const search = sp.get('search')?.trim();
    if (search) {
      const safe = escapePostgrestValue(`%${escapeLike(search)}%`);
      query = query.or(`name.ilike.${safe},company.ilike.${safe},phone.ilike.${safe}`);
    }

    const sort = sp.get('sort')?.trim() || 'last_contact_desc';
    if (sort === 'created_desc') query = query.order('created_at', { ascending: false });
    else if (sort === 'expected_value_desc') query = query.order('expected_value', { ascending: false, nullsFirst: false });
    else query = query.order('last_contact_at', { ascending: false, nullsFirst: false });

    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) {
      console.error('GET /api/crm/leads error:', error.message);
      return apiServerError();
    }

    type LeadRow = { id: string } & Record<string, unknown>;
    const leads = (data ?? []) as unknown as LeadRow[];

    // Enrich with activity_count + last_activity_type (one extra query batched).
    let enriched: Array<LeadRow & { activity_count: number; last_activity_type: string | null }> =
      leads.map((l) => ({ ...l, activity_count: 0, last_activity_type: null }));
    if (leads.length > 0) {
      const ids = leads.map((l) => l.id);
      const { data: acts } = await supabase
        .from('pyra_lead_activities')
        .select('lead_id, activity_type, created_at')
        .in('lead_id', ids)
        .order('created_at', { ascending: false });

      const counts = new Map<string, number>();
      const lastType = new Map<string, string>();
      for (const a of acts ?? []) {
        counts.set(a.lead_id, (counts.get(a.lead_id) ?? 0) + 1);
        if (!lastType.has(a.lead_id)) lastType.set(a.lead_id, a.activity_type);
      }
      enriched = leads.map((l) => ({
        ...l,
        activity_count: counts.get(l.id) ?? 0,
        last_activity_type: lastType.get(l.id) ?? null,
      }));
    }

    const total = count ?? enriched.length;
    return apiSuccess(
      { leads: enriched, total, has_more: offset + enriched.length < total },
      { total, limit, offset },
    );
  } catch (err) {
    console.error('GET /api/crm/leads threw:', err);
    return apiServerError();
  }
}
