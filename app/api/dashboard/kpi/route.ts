import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { hasPermission } from '@/lib/auth/rbac';

// =============================================================
// GET /api/dashboard/kpi
// List KPI targets. Query: ?username=X&period_id=X
// =============================================================
export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiPermission('evaluations.view');
    if (isApiError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const periodId = searchParams.get('period_id');
    const canManage = hasPermission(auth.pyraUser.rolePermissions, 'evaluations.manage');

    const supabase = createServiceRoleClient();

    let query = supabase
      .from('pyra_kpi_targets')
      .select('*')
      .order('created_at', { ascending: false });

    if (username) {
      query = query.eq('username', username);
    } else if (!canManage) {
      // Non-admins can only see their own KPIs
      query = query.eq('username', auth.pyraUser.username);
    }

    if (periodId) {
      query = query.eq('period_id', periodId);
    }

    const { data: kpis, error } = await query;

    if (error) return apiServerError(error.message);
    if (!kpis || kpis.length === 0) return apiSuccess([]);

    // Collect unique usernames and period IDs
    const usernames = new Set<string>();
    const periodIds = new Set<string>();
    for (const kpi of kpis) {
      usernames.add(kpi.username);
      if (kpi.period_id) periodIds.add(kpi.period_id);
    }

    // Fetch user display names
    const { data: usersData } = await supabase
      .from('pyra_users')
      .select('username, display_name')
      .in('username', Array.from(usernames));

    const userMap: Record<string, string> = {};
    for (const u of usersData || []) {
      userMap[u.username] = u.display_name;
    }

    // Fetch period info
    let periodMap: Record<string, { id: string; name: string; name_ar: string }> = {};
    if (periodIds.size > 0) {
      const { data: periodsData } = await supabase
        .from('pyra_evaluation_periods')
        .select('id, name, name_ar')
        .in('id', Array.from(periodIds));

      for (const p of periodsData || []) {
        periodMap[p.id] = p;
      }
    }

    // Enrich KPIs
    const enriched = kpis.map((kpi) => ({
      ...kpi,
      user: {
        username: kpi.username,
        display_name: userMap[kpi.username] || kpi.username,
      },
      period: kpi.period_id ? (periodMap[kpi.period_id] || null) : null,
    }));

    return apiSuccess(enriched);
  } catch (err) {
    console.error('GET /api/dashboard/kpi error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/dashboard/kpi
// Create a KPI target.
// Body: { username, period_id?, title, target_value?, unit? }
// =============================================================
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('evaluations.manage');
    if (isApiError(auth)) return auth;

    const body = await req.json().catch(() => ({}));
    const { username, period_id, title, target_value, unit } = body;

    if (!username || !title) {
      return apiValidationError('اسم المستخدم والعنوان مطلوبان');
    }

    const supabase = createServiceRoleClient();
    const id = generateId('kpi');

    const { data, error } = await supabase
      .from('pyra_kpi_targets')
      .insert({
        id,
        username,
        period_id: period_id || null,
        title,
        target_value: target_value || null,
        actual_value: 0,
        unit: unit || null,
        status: 'active',
      })
      .select()
      .single();

    if (error) return apiServerError(error.message);
    return apiSuccess(data, undefined, 201);
  } catch (err) {
    console.error('POST /api/dashboard/kpi error:', err);
    return apiServerError();
  }
}
