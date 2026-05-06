import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET /api/crm/follow-ups
 *
 * Permission: follow_ups.view
 * Scope: own follow-ups (assigned_to = me) unless admin.
 *
 * Query params:
 *   status     - 'pending' (default) | 'completed' | 'overdue' | 'cancelled' | 'all'
 *   lead_id    - filter to a single lead
 *   due_before - ISO datetime
 *   due_after  - ISO datetime
 *   limit      - default 100, max 500
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('follow_ups.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const sp = request.nextUrl.searchParams;

    const limitParam = parseInt(sp.get('limit') || '100', 10);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 100, 1), 500);
    const status = sp.get('status')?.trim() || 'pending';
    const leadId = sp.get('lead_id')?.trim();
    const dueBefore = sp.get('due_before')?.trim();
    const dueAfter = sp.get('due_after')?.trim();

    let q = supabase
      .from('pyra_sales_follow_ups')
      .select('id, lead_id, assigned_to, due_at, title, notes, status, completed_at, created_by, created_at, quote_id', { count: 'exact' })
      .order('due_at', { ascending: true })
      .limit(limit);

    if (auth.pyraUser.role !== 'admin') {
      q = q.eq('assigned_to', auth.pyraUser.username);
    }

    if (status !== 'all') q = q.eq('status', status);
    if (leadId) q = q.eq('lead_id', leadId);
    if (dueBefore) q = q.lt('due_at', dueBefore);
    if (dueAfter) q = q.gte('due_at', dueAfter);

    const { data, count, error } = await q;
    if (error) {
      console.error('GET /api/crm/follow-ups error:', error.message);
      return apiServerError();
    }

    const rows = data ?? [];

    // Enrich with lead name and assignee display_name
    const leadIds = Array.from(new Set(rows.map((r) => r.lead_id).filter((x): x is string => !!x)));
    const usernames = Array.from(new Set(rows.map((r) => r.assigned_to).filter((x): x is string => !!x)));

    const [leadsRes, usersRes] = await Promise.all([
      leadIds.length
        ? supabase.from('pyra_sales_leads').select('id, name, phone, company').in('id', leadIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; phone: string | null; company: string | null }> }),
      usernames.length
        ? supabase.from('pyra_users').select('username, display_name').in('username', usernames)
        : Promise.resolve({ data: [] as Array<{ username: string; display_name: string }> }),
    ]);

    const leadMap = new Map((leadsRes.data ?? []).map((l) => [l.id, l]));
    const userMap = new Map((usersRes.data ?? []).map((u) => [u.username, u.display_name]));

    const enriched = rows.map((r) => ({
      ...r,
      lead_name: r.lead_id ? leadMap.get(r.lead_id)?.name ?? null : null,
      lead_phone: r.lead_id ? leadMap.get(r.lead_id)?.phone ?? null : null,
      lead_company: r.lead_id ? leadMap.get(r.lead_id)?.company ?? null : null,
      assigned_display_name: r.assigned_to ? userMap.get(r.assigned_to) ?? r.assigned_to : null,
    }));

    return apiSuccess({ follow_ups: enriched, total: count ?? enriched.length });
  } catch (err) {
    console.error('GET /api/crm/follow-ups threw:', err);
    return apiServerError();
  }
}
