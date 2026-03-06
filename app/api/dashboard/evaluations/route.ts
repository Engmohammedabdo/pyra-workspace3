import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { hasPermission } from '@/lib/auth/rbac';

// =============================================================
// GET /api/dashboard/evaluations
// List evaluations with employee/evaluator display names.
// Query: ?period_id=X&employee=X
// Admins see all; employees see only their own evaluations.
// =============================================================
export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiPermission('evaluations.view');
    if (isApiError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const periodId = searchParams.get('period_id');
    const employee = searchParams.get('employee');

    const supabase = createServiceRoleClient();
    const canManage = hasPermission(auth.pyraUser.rolePermissions, 'evaluations.manage');

    let query = supabase
      .from('pyra_evaluations')
      .select('*')
      .order('created_at', { ascending: false });

    // Filter by period
    if (periodId) {
      query = query.eq('period_id', periodId);
    }

    // Filter by employee
    if (employee) {
      query = query.eq('employee_username', employee);
    }

    // Non-admins can only see evaluations where they are employee or evaluator
    if (!canManage) {
      query = query.or(
        `employee_username.eq.${auth.pyraUser.username},evaluator_username.eq.${auth.pyraUser.username}`
      );
    }

    const { data: evaluations, error } = await query;

    if (error) return apiServerError(error.message);
    if (!evaluations || evaluations.length === 0) return apiSuccess([]);

    // Collect unique usernames and period IDs to resolve
    const usernames = new Set<string>();
    const periodIds = new Set<string>();
    for (const ev of evaluations) {
      usernames.add(ev.employee_username);
      usernames.add(ev.evaluator_username);
      periodIds.add(ev.period_id);
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
    const { data: periodsData } = await supabase
      .from('pyra_evaluation_periods')
      .select('id, name, name_ar, status')
      .in('id', Array.from(periodIds));

    const periodMap: Record<string, { id: string; name: string; name_ar: string; status: string }> = {};
    for (const p of periodsData || []) {
      periodMap[p.id] = p;
    }

    // Enrich evaluations with display names and period info
    const enriched = evaluations.map((ev) => ({
      ...ev,
      employee: {
        username: ev.employee_username,
        display_name: userMap[ev.employee_username] || ev.employee_username,
      },
      evaluator: {
        username: ev.evaluator_username,
        display_name: userMap[ev.evaluator_username] || ev.evaluator_username,
      },
      period: periodMap[ev.period_id] || null,
    }));

    return apiSuccess(enriched);
  } catch (err) {
    console.error('GET /api/dashboard/evaluations error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/dashboard/evaluations
// Create a new evaluation.
// Body: { period_id, employee_username, evaluator_username, evaluation_type? }
// =============================================================
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('evaluations.manage');
    if (isApiError(auth)) return auth;

    const body = await req.json().catch(() => ({}));
    const { period_id, employee_username, evaluator_username, evaluation_type } = body;

    if (!period_id || !employee_username || !evaluator_username) {
      return apiValidationError('الحقول المطلوبة: فترة التقييم، الموظف، المقيّم');
    }

    const supabase = createServiceRoleClient();

    // Verify period exists
    const { data: period } = await supabase
      .from('pyra_evaluation_periods')
      .select('id, status')
      .eq('id', period_id)
      .single();

    if (!period) {
      return apiValidationError('فترة التقييم غير موجودة');
    }

    const id = generateId('ev');

    const { data, error } = await supabase
      .from('pyra_evaluations')
      .insert({
        id,
        period_id,
        employee_username,
        evaluator_username,
        evaluation_type: evaluation_type || 'manager',
        status: 'draft',
      })
      .select()
      .single();

    if (error) return apiServerError(error.message);

    // Activity log
    const { error: logErr } = await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'evaluation_created',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: '/dashboard/evaluations',
      details: { evaluation_id: id, employee_username, evaluation_type: evaluation_type || 'manager' },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });
    if (logErr) console.error('Activity log error:', logErr);

    return apiSuccess(data, undefined, 201);
  } catch (err) {
    console.error('POST /api/dashboard/evaluations error:', err);
    return apiServerError();
  }
}
