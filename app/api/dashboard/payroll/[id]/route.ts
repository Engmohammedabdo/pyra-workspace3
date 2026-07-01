import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiValidationError, apiError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { PAYROLL_STATUS, EXPENSE_STATUS } from '@/lib/constants/statuses';
import { logError } from '@/lib/observability/log-error';
import { markPaymentsPaidAndPropagate } from '@/lib/payroll/payment-lifecycle';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { notifyBatch } from '@/lib/notifications/notify';

type RouteParams = { params: Promise<{ id: string }> };

// =============================================================
// GET /api/dashboard/payroll/[id]
// Get a single payroll run with all its items (joined with user info).
// Gap #3 authz fix: full-run detail (all employees' items/salaries) requires
// payroll.manage (admin/HR), NOT payroll.view (BASE_EMPLOYEE). Employees use
// /api/dashboard/payroll/[id]/payslip (self-scoped) for their own payslip.
// =============================================================
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiPermission('payroll.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;

    const supabase = createServiceRoleClient(); // pyra_payroll_* service-role-only (Gap #3 Tier-2)

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
    logError({ error: err, request: req, metadata: { route: 'payroll/[id]', method: 'GET' } });
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
      if (run.status !== PAYROLL_STATUS.CALCULATED) {
        return apiError('لا يمكن اعتماد مسير رواتب غير محسوب', 400);
      }

      const { data, error } = await supabase
        .from('pyra_payroll_runs')
        .update({
          status: PAYROLL_STATUS.APPROVED,
          approved_by: auth.pyraUser.username,
          approved_at: new Date().toISOString(),
          notes: notes || run.notes,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) return apiServerError(error.message);

      // ── Create expense records for each payroll item ──────────────
      // This makes payroll visible in the finance dashboard & reports
      const { data: payrollItems } = await supabase
        .from('pyra_payroll_items')
        .select('username, net_pay')
        .eq('payroll_id', id);

      if (payrollItems && payrollItems.length > 0) {
        // Fetch display names for all employees
        const unames = payrollItems.map((pi: { username: string }) => pi.username);
        const { data: users } = await supabase
          .from('pyra_users')
          .select('username, display_name')
          .in('username', unames);
        const nameMap: Record<string, string> = {};
        if (users) {
          for (const u of users) nameMap[u.username] = u.display_name;
        }

        // Find primary project per employee (most timesheet hours that month)
        const monthStart = `${run.year}-${String(run.month).padStart(2, '0')}-01`;
        const monthEnd = `${run.year}-${String(run.month).padStart(2, '0')}-${new Date(run.year, run.month, 0).getDate()}`;
        const { data: timesheets } = await supabase
          .from('pyra_timesheets')
          .select('username, project_id, hours')
          .in('username', unames)
          .gte('date', monthStart)
          .lte('date', monthEnd)
          .not('project_id', 'is', null);

        const userProjectHours: Record<string, Record<string, number>> = {};
        if (timesheets) {
          for (const ts of timesheets) {
            if (!ts.project_id) continue;
            if (!userProjectHours[ts.username]) userProjectHours[ts.username] = {};
            userProjectHours[ts.username][ts.project_id] = (userProjectHours[ts.username][ts.project_id] || 0) + Number(ts.hours);
          }
        }

        // Last day of month for expense_date
        const expenseDate = monthEnd;

        const expenseRecords = payrollItems.map((item: { username: string; net_pay: number }) => {
          // Find primary project (most hours)
          let projectId: string | null = null;
          const projects = userProjectHours[item.username];
          if (projects) {
            const sorted = Object.entries(projects).sort((a, b) => b[1] - a[1]);
            if (sorted.length > 0) projectId = sorted[0][0];
          }

          return {
            id: generateId('exp'),
            description: `راتب شهر ${run.month}/${run.year} — ${nameMap[item.username] || item.username}`,
            amount: item.net_pay,
            currency: run.currency || 'AED',
            category_id: 'ec_salaries',
            project_id: projectId,
            expense_date: expenseDate,
            vendor: nameMap[item.username] || item.username,
            status: EXPENSE_STATUS.APPROVED,
            payroll_run_id: id,
            created_by: auth.pyraUser.username,
          };
        });

        // Defensive: ensure the salaries expense category exists (referenced as category_id above)
        await supabase
          .from('pyra_expense_categories')
          .upsert({ id: 'ec_salaries', name: 'Salaries', name_ar: 'الرواتب' }, { onConflict: 'id' });
        // Delete any existing payroll expenses for this run (re-approval case)
        await supabase.from('pyra_expenses').delete().eq('payroll_run_id', id);
        // Insert new expense records
        const { error: expErr } = await supabase.from('pyra_expenses').insert(expenseRecords);
        if (expErr) logError({ error: expErr, request: req, metadata: { route: 'payroll/approve', step: 'expense-insert', payroll_id: id } });
      }
      // ─────────────────────────────────────────────────────────────

      // Activity log
      logActivity(
        auth.pyraUser.username,
        auth.pyraUser.display_name,
        `${ENTITY_TYPES.PAYROLL}_${ACTIVITY_ACTIONS.UPDATE}`,
        '/dashboard/payroll',
        { payroll_id: id, new_status: 'approved', expenses_created: payrollItems?.length || 0, source: 'payroll_status_changed' },
        req.headers.get('x-forwarded-for') || 'unknown',
      );

      return apiSuccess(data);
    }

    if (action === 'pay') {
      if (run.status !== PAYROLL_STATUS.APPROVED) {
        return apiError('لا يمكن صرف مسير رواتب غير معتمد', 400);
      }

      const { data, error } = await supabase
        .from('pyra_payroll_runs')
        .update({
          status: PAYROLL_STATUS.PAID,
          paid_at: new Date().toISOString(),
          notes: notes || run.notes,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) return apiServerError(error.message);

      // Also update all payroll items to 'paid' — return the rows so we can send
      // payslip-ready notifications without a second SELECT.
      const { data: paidItems, error: paidItemsErr } = await supabase
        .from('pyra_payroll_items')
        .update({ status: PAYROLL_STATUS.PAID })
        .eq('payroll_id', id)
        .select('username, net_pay, currency');
      if (paidItemsErr) {
        logError({ error: paidItemsErr, request: req, metadata: { route: 'payroll/[id]', method: 'PATCH', step: 'items-paid', payroll_id: id } });
        console.error('[payroll/pay] items update failed:', paidItemsErr.message);
      }

      // Settle the employee_payments consumed by this run + their source tasks
      const { data: consumed } = await supabase
        .from('pyra_employee_payments')
        .select('id')
        .eq('payroll_id', id);
      await markPaymentsPaidAndPropagate(supabase, (consumed || []).map((p: { id: string }) => p.id));

      // Activity log
      logActivity(
        auth.pyraUser.username,
        auth.pyraUser.display_name,
        `${ENTITY_TYPES.PAYROLL}_${ACTIVITY_ACTIONS.UPDATE}`,
        '/dashboard/payroll',
        { payroll_id: id, new_status: 'paid', source: 'payroll_status_changed' },
        req.headers.get('x-forwarded-for') || 'unknown',
      );

      // Notify each employee that their payslip is ready. System-sent so an admin
      // who is also on this run still receives their own payslip notification
      // (notify() skips self-notifications when from === to).
      const monthLabel = `${run.month}/${run.year}`;
      await notifyBatch(
        supabase,
        (paidItems || [])
          .filter((it: { username?: string | null }) => !!it.username)
          .map((it: { username: string; net_pay: number; currency: string | null }) => ({
            to: it.username,
            type: 'payroll_paid',
            title: 'تم صرف راتبك',
            message: `راتب شهر ${monthLabel}: ${it.net_pay} ${it.currency || 'AED'} — كشف الراتب جاهز`,
            link: '/dashboard/my-payslips',
            entity: { type: 'payroll', id },
            from: { username: 'system' },
          })),
      );

      return apiSuccess(data);
    }

    return apiError('إجراء غير معروف', 400);
  } catch (err) {
    logError({ error: err, request: req, metadata: { route: 'payroll/[id]', method: 'PATCH' } });
    console.error('PATCH /api/dashboard/payroll/[id] error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/dashboard/payroll/[id]
// Delete a draft payroll run and clean up related data.
// Only allowed when the run is in 'draft' status.
// =============================================================
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiPermission('payroll.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // Fetch the run to validate status
    const { data: run, error: runError } = await supabase
      .from('pyra_payroll_runs')
      .select('id, status, month, year')
      .eq('id', id)
      .single();

    if (runError || !run) return apiNotFound('مسير الرواتب غير موجود');

    if (run.status !== PAYROLL_STATUS.DRAFT) {
      return apiError(`لا يمكن حذف مسير بحالة "${run.status}"، يمكن حذف المسيرات المسودة فقط`, 400);
    }

    // 1. Unlink any employee_payments FIRST (preserve the payment records; only
    //    detach them from this run) — do this before deleting the run so the links
    //    are cleared explicitly and we can surface an error.
    const { error: unlinkError } = await supabase
      .from('pyra_employee_payments')
      .update({ payroll_id: null })
      .eq('payroll_id', id);

    if (unlinkError) {
      logError({ error: unlinkError, request: req, metadata: { route: 'payroll/delete', step: 'unlink-payments', payroll_id: id } });
      return apiServerError(unlinkError.message);
    }

    // 2. Delete all payroll items for this run
    const { error: itemsDeleteError } = await supabase
      .from('pyra_payroll_items')
      .delete()
      .eq('payroll_id', id);

    if (itemsDeleteError) {
      logError({ error: itemsDeleteError, request: req, metadata: { route: 'payroll/delete', step: 'delete-items', payroll_id: id } });
      return apiServerError(itemsDeleteError.message);
    }

    // 3. Delete the run itself
    const { error: runDeleteError } = await supabase
      .from('pyra_payroll_runs')
      .delete()
      .eq('id', id);

    if (runDeleteError) {
      logError({ error: runDeleteError, request: req, metadata: { route: 'payroll/delete', step: 'delete-run', payroll_id: id } });
      return apiServerError(runDeleteError.message);
    }

    // Activity log
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.PAYROLL}_${ACTIVITY_ACTIONS.DELETE}`,
      '/dashboard/payroll',
      { payroll_id: id, month: run.month, year: run.year, source: 'payroll_deleted' },
      req.headers.get('x-forwarded-for') || 'unknown',
    );

    return apiSuccess({ deleted: true });
  } catch (err) {
    logError({ error: err, request: req, metadata: { route: 'payroll/[id]', method: 'DELETE' } });
    console.error('DELETE /api/dashboard/payroll/[id] error:', err);
    return apiServerError();
  }
}
