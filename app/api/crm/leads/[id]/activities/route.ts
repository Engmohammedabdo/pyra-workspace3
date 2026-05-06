import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { canAccessLead } from '@/lib/auth/lead-scope';

/**
 * GET /api/crm/leads/[id]/activities
 *
 * Permission: lead_activities.view
 * Scope: canAccessLead.
 *
 * Cursor pagination per Q-UI-002:
 *   - limit: default 50, max 200
 *   - before: ISO timestamp — return only rows with created_at < before
 *
 * Optional filter:
 *   - type: a single LeadActivityType value
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiPermission('lead_activities.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(supabase, auth.pyraUser.username, auth.pyraUser.role, id);
    if (!allowed) return apiForbidden('لا تملك صلاحية الوصول لهذا الـ Lead');

    const sp = request.nextUrl.searchParams;
    const limitParam = parseInt(sp.get('limit') || '50', 10);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 200);
    const before = sp.get('before')?.trim() || null;
    const typeFilter = sp.get('type')?.trim() || null;

    let q = supabase
      .from('pyra_lead_activities')
      .select('id, lead_id, activity_type, description, metadata, created_by, created_at')
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (typeFilter) q = q.eq('activity_type', typeFilter);
    if (before) q = q.lt('created_at', before);

    const { data, error } = await q;
    if (error) {
      console.error('GET /api/crm/leads/[id]/activities error:', error.message);
      return apiServerError();
    }

    const rows = data ?? [];

    // Enrich with creator display name (one batched lookup).
    let enriched: typeof rows | (typeof rows[number] & { created_by_display_name?: string })[] = rows;
    const creatorUsernames = Array.from(new Set(rows.map((r) => r.created_by).filter((u): u is string => !!u)));
    if (creatorUsernames.length > 0) {
      const { data: users } = await supabase
        .from('pyra_users')
        .select('username, display_name')
        .in('username', creatorUsernames);
      const nameMap = new Map<string, string>();
      for (const u of users ?? []) nameMap.set(u.username, u.display_name);
      enriched = rows.map((r) => ({
        ...r,
        created_by_display_name: r.created_by ? nameMap.get(r.created_by) ?? r.created_by : null,
      }));
    }

    return apiSuccess({
      activities: enriched,
      has_more: rows.length === limit,
    });
  } catch (err) {
    console.error('GET /api/crm/leads/[id]/activities threw:', err);
    return apiServerError();
  }
}
