import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiValidationError, apiError } from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

type RouteParams = { params: Promise<{ id: string }> };

// =============================================================
// GET /api/dashboard/payroll/[id]
// Get a single payroll run with all its items (joined with user info).
// =============================================================
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiPermission('payroll.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;

    const supabase = await createServerSupabaseClient();

    // Fetch the payroll run
    const { data: run, error: runError } = await supabase
      .from('pyra_payroll_runs')
      .select('*')
      .eq('id', id)
      .single();

    if (runError || !run) return apiNotFound('مسير الرواتب غير موجود');

    // Fetch items for this payroll run
    const { data: items, error: itemsError } = await supabase
      .from('pyra_payroll_items')
      .select('*')
      .eq('payroll_id', id)
      .order('username', { ascending: true });

    if (itemsError) return apiServerError(itemsError.message);

    // Fetch user display info for all usernames
    const usernames = (items || []).map((item: { username: string }) => item.username);
    let usersMap: Record<string, { display_name: string; department: string | null }> = {};

    if (usernames.length > 0) {
      const { data: users } = await supabase
        .from('pyra_users')
        .select('username, display_name, department')
        .in('username', usernames);

      if (users) {
        usersMap = Object.fromEntries(
          users.map((u: { username: string; display_name: string; department: string | null }) => [
            u.username,
            { display_name: u.display_name, department: u.department },
          ])
        );
      }
    }

    // Merge user info into items
    const enrichedItems = (items || []).map((item: Record<string, unknown>) => ({
      ...item,
      display_name: usersMap[item.username as string]?.display_name || item.username,
      department: usersMap[item.username as string]?.department || null,
    }));

    return apiSuccess({ ...run, items: enrichedItems });
  } catch (err) {
    console.error('GET /api/dashboard/payroll/[id] error:', err);
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/dashboard/payroll/[id]
// Update payroll run status (approve or pay).
// Body: { action: 'approve' | 'pay', notes? }
// =============================================================
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiPermission('payroll.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { action, notes } = body;

    if (!action || !['approve', 'pay'].includes(action)) {
      return apiValidationError('الإجراء يجب أن يكون approve أو pay');
    }

    const supabase = createServiceRoleClient();

    // Fetch current run
    const { data: run, error: runError } = await supabase
      .from('pyra_payroll_runs')
      .select('*')
      .eq('id', id)
      .single();

    if (runError || !run) return apiNotFound('مسير الرواتب غير موجود');

    if (action === 'approve') {
      if (run.status !== 'calculated') {
        return apiError('لا يمكن اعتماد مسير رواتب غير محسوب', 400);
      }

      const { data, error } = await supabase
        .from('pyra_payroll_runs')
        .update({
          status: 'approved',
          approved_by: auth.pyraUser.username,
          approved_at: new Date().toISOString(),
          notes: notes || run.notes,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) return apiServerError(error.message);
      return apiSuccess(data);
    }

    if (action === 'pay') {
      if (run.status !== 'approved') {
        return apiError('لا يمكن صرف مسير رواتب غير معتمد', 400);
      }

      const { data, error } = await supabase
        .from('pyra_payroll_runs')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          notes: notes || run.notes,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) return apiServerError(error.message);

      // Also update all payroll items to 'paid'
      await supabase
        .from('pyra_payroll_items')
        .update({ status: 'paid' })
        .eq('payroll_id', id);

      return apiSuccess(data);
    }

    return apiError('إجراء غير معروف', 400);
  } catch (err) {
    console.error('PATCH /api/dashboard/payroll/[id] error:', err);
    return apiServerError();
  }
}
