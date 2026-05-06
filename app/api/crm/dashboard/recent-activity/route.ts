import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLeadScopeFilter } from '@/lib/auth/lead-scope';

/**
 * GET /api/crm/dashboard/recent-activity
 *
 * Permission: lead_activities.view
 * Scope: scoped to leads I can see (own only for sales_agent).
 *
 * Query: ?limit=20 (default 20, max 100)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('lead_activities.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const sp = request.nextUrl.searchParams;
    const limitParam = parseInt(sp.get('limit') || '20', 10);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 20, 1), 100);

    // Step 1: which lead ids can the caller see?
    const scope = getLeadScopeFilter(auth.pyraUser.role, auth.pyraUser.username);
    let visibleIds: string[] | null = null;
    if (scope) {
      const { data: scoped } = await supabase
        .from('pyra_sales_leads')
        .select('id')
        .eq(scope.column, scope.value);
      visibleIds = (scoped ?? []).map((r) => r.id);
      if (visibleIds.length === 0) {
        return apiSuccess({ activities: [] });
      }
    }

    // Step 2: latest activities, optionally restricted to visibleIds
    let q = supabase
      .from('pyra_lead_activities')
      .select('id, lead_id, activity_type, description, metadata, created_by, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (visibleIds) q = q.in('lead_id', visibleIds);

    const { data: rows, error } = await q;
    if (error) {
      console.error('GET /api/crm/dashboard/recent-activity error:', error.message);
      return apiServerError();
    }

    // Step 3: enrich with lead name + creator display name
    const acts = rows ?? [];
    const leadIds = Array.from(new Set(acts.map((a) => a.lead_id).filter((x): x is string => !!x)));
    const usernames = Array.from(new Set(acts.map((a) => a.created_by).filter((x): x is string => !!x)));

    const [leadsRes, usersRes] = await Promise.all([
      leadIds.length
        ? supabase.from('pyra_sales_leads').select('id, name').in('id', leadIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      usernames.length
        ? supabase.from('pyra_users').select('username, display_name').in('username', usernames)
        : Promise.resolve({ data: [] as Array<{ username: string; display_name: string }> }),
    ]);

    const leadMap = new Map((leadsRes.data ?? []).map((l) => [l.id, l.name]));
    const userMap = new Map((usersRes.data ?? []).map((u) => [u.username, u.display_name]));

    const enriched = acts.map((a) => ({
      ...a,
      lead_name: a.lead_id ? leadMap.get(a.lead_id) ?? null : null,
      created_by_display_name: a.created_by ? userMap.get(a.created_by) ?? a.created_by : null,
    }));

    return apiSuccess({ activities: enriched });
  } catch (err) {
    console.error('GET /api/crm/dashboard/recent-activity threw:', err);
    return apiServerError();
  }
}
