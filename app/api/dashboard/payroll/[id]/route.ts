import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiValidationError, apiError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { PAYROLL_RPC_STATUS } from '@/lib/constants/payroll';
import { logError } from '@/lib/observability/log-error';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { notifyBatch } from '@/lib/notifications/notify';

type RouteParams = { params: Promise<{ id: string }> };

interface PayrollRpcRow {
  status: string;
  changed: boolean;
  run_data: Record<string, unknown> | null;
  items_data?: Array<Record<string, unknown>> | null;
}

function firstRpcRow(rows: unknown): PayrollRpcRow | null {
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row && typeof row === 'object' ? row as PayrollRpcRow : null;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiPermission('payroll.manage');
    if (isApiError(auth)) return auth;
    const t = await getTranslations('api');
    const { id } = await params;
    const supabase = createServiceRoleClient();

    const { data: run, error: runError } = await supabase
      .from('pyra_payroll_runs')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (runError) return apiServerError();
    if (!run) return apiNotFound(t('payroll.runNotFound'));

    const { data: items, error: itemsError } = await supabase
      .from('pyra_payroll_items')
      .select('*')
      .eq('payroll_id', id)
      .order('username', { ascending: true });
    if (itemsError) return apiServerError();

    const usernames = (items || []).map((item: { username: string }) => item.username);
    let usersMap: Record<string, { display_name: string; department: string | null }> = {};
    if (usernames.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from('pyra_users')
        .select('username, display_name, department')
        .in('username', usernames);
      if (usersError) return apiServerError();
      usersMap = Object.fromEntries((users || []).map((user) => [
        user.username,
        { display_name: user.display_name, department: user.department },
      ]));
    }

    return apiSuccess({
      ...run,
      items: (items || []).map((item: Record<string, unknown>) => ({
        ...item,
        display_name: usersMap[item.username as string]?.display_name || item.username,
        department: usersMap[item.username as string]?.department || null,
      })),
    });
  } catch (error) {
    logError({ error, request: req, metadata: { route: 'payroll/[id]', method: 'GET' } });
    return apiServerError();
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiPermission('payroll.manage');
    if (isApiError(auth)) return auth;
    const t = await getTranslations('api');
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : '';
    const notes = typeof body.notes === 'string' ? body.notes : null;
    if (!['approve', 'pay'].includes(action)) {
      return apiValidationError(t('payroll.actionMustBeApproveOrPay'));
    }

    const supabase = createServiceRoleClient();
    const { data: run, error: runError } = await supabase
      .from('pyra_payroll_runs')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (runError) return apiServerError();
    if (!run) return apiNotFound(t('payroll.runNotFound'));

    let result: PayrollRpcRow | null = null;
    let expenseCount = 0;

    if (action === 'approve') {
      const { data: payrollItems, error: itemsError } = await supabase
        .from('pyra_payroll_items')
        .select('username, net_pay')
        .eq('payroll_id', id);
      if (itemsError) return apiServerError();

      const usernames = (payrollItems || []).map((item) => item.username);
      const { data: users, error: usersError } = usernames.length > 0
        ? await supabase.from('pyra_users').select('username, display_name').in('username', usernames)
        : { data: [], error: null };
      if (usersError) return apiServerError();
      const nameMap = Object.fromEntries((users || []).map((user) => [user.username, user.display_name]));

      const monthStart = `${run.year}-${String(run.month).padStart(2, '0')}-01`;
      const monthEnd = `${run.year}-${String(run.month).padStart(2, '0')}-${String(new Date(run.year, run.month, 0).getDate()).padStart(2, '0')}`;
      const { data: timesheets, error: timesheetsError } = usernames.length > 0
        ? await supabase
          .from('pyra_timesheets')
          .select('username, project_id, hours')
          .in('username', usernames)
          .gte('date', monthStart)
          .lte('date', monthEnd)
          .not('project_id', 'is', null)
        : { data: [], error: null };
      if (timesheetsError) return apiServerError();

      const projectHours: Record<string, Record<string, number>> = {};
      for (const timesheet of timesheets || []) {
        if (!timesheet.project_id) continue;
        projectHours[timesheet.username] ??= {};
        projectHours[timesheet.username][timesheet.project_id] =
          (projectHours[timesheet.username][timesheet.project_id] || 0) + Number(timesheet.hours);
      }

      const expenses = (payrollItems || []).map((item) => {
        const primaryProject = Object.entries(projectHours[item.username] || {})
          .sort((first, second) => second[1] - first[1])[0]?.[0] || null;
        return {
          id: generateId('exp'),
          username: item.username,
          description: `راتب شهر ${run.month}/${run.year} — ${nameMap[item.username] || item.username}`, // i18n-exempt: stored payroll expense description
          amount: item.net_pay,
          currency: run.currency || 'AED',
          project_id: primaryProject,
          expense_date: monthEnd,
          vendor: nameMap[item.username] || item.username,
        };
      });
      expenseCount = expenses.length;

      const { data: rpcRows, error: rpcError } = await supabase
        .rpc('pyra_approve_payroll_run', {
          p_payroll_id: id,
          p_expected_calculated_at: run.calculated_at,
          p_approved_by: auth.pyraUser.username,
          p_notes: notes,
          p_expenses: expenses,
        });
      if (rpcError) {
        logError({ error: rpcError, request: req, metadata: { route: 'payroll/[id]', step: 'atomic-approve' } });
        return apiServerError();
      }
      result = firstRpcRow(rpcRows);
    } else {
      const { data: rpcRows, error: rpcError } = await supabase
        .rpc('pyra_pay_payroll_run', { p_payroll_id: id, p_notes: notes });
      if (rpcError) {
        logError({ error: rpcError, request: req, metadata: { route: 'payroll/[id]', step: 'atomic-pay' } });
        return apiServerError();
      }
      result = firstRpcRow(rpcRows);
    }

    if (!result) return apiServerError();
    if (result.status === PAYROLL_RPC_STATUS.NOT_FOUND) return apiNotFound(t('payroll.runNotFound'));
    if (result.status === PAYROLL_RPC_STATUS.INVALID_PAYLOAD) {
      return apiError(t('payroll.atomicInvalidPayload'), 422);
    }
    if ([
      PAYROLL_RPC_STATUS.INVALID_STATUS,
      PAYROLL_RPC_STATUS.STALE_CALCULATION,
      PAYROLL_RPC_STATUS.BLOCKED_INPUT,
      PAYROLL_RPC_STATUS.INTEGRITY_CONFLICT,
    ].includes(result.status as never)) {
      return apiError(t('payroll.atomicConflict'), 409);
    }
    const expectedSuccess = action === 'approve'
      ? [PAYROLL_RPC_STATUS.OK, PAYROLL_RPC_STATUS.ALREADY_APPROVED]
      : [PAYROLL_RPC_STATUS.OK, PAYROLL_RPC_STATUS.ALREADY_PAID];
    if (!expectedSuccess.includes(result.status as never) || !result.run_data) return apiServerError();

    if (result.changed) {
      logActivity(
        auth.pyraUser.username,
        auth.pyraUser.display_name,
        `${ENTITY_TYPES.PAYROLL}_${ACTIVITY_ACTIONS.UPDATE}`,
        '/dashboard/payroll',
        {
          payroll_id: id,
          new_status: action === 'approve' ? 'approved' : 'paid',
          expenses_created: action === 'approve' ? expenseCount : undefined,
          source: 'payroll_status_changed',
        },
        req.headers.get('x-forwarded-for') || 'unknown',
      );
    }

    if (action === 'pay' && result.changed) {
      const paidRun = result.run_data as { month?: number; year?: number };
      try {
        await notifyBatch(
          supabase,
          (result.items_data || [])
            .filter((item) => !!item.username)
            .map((item) => ({
              to: item.username as string,
              type: 'payroll_paid',
              title: 'تم صرف راتبك', // i18n-exempt: persisted notification
              message: `راتب شهر ${paidRun.month}/${paidRun.year}: ${item.net_pay} ${item.currency || 'AED'} — كشف الراتب جاهز`, // i18n-exempt: persisted notification
              link: '/dashboard/my-payslips',
              entity: { type: 'payroll', id },
              from: { username: 'system' },
            })),
        );
      } catch (notificationError) {
        logError({ error: notificationError, request: req, metadata: { route: 'payroll/[id]', step: 'paid-notifications' } });
      }
    }

    return apiSuccess(result.run_data, { idempotent: !result.changed });
  } catch (error) {
    logError({ error, request: req, metadata: { route: 'payroll/[id]', method: 'PATCH' } });
    return apiServerError();
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiPermission('payroll.manage');
    if (isApiError(auth)) return auth;
    const t = await getTranslations('api');
    const { id } = await params;
    const supabase = createServiceRoleClient();

    const { data: rpcRows, error: rpcError } = await supabase
      .rpc('pyra_delete_draft_payroll_run', { p_payroll_id: id });
    if (rpcError) {
      logError({ error: rpcError, request: req, metadata: { route: 'payroll/[id]', step: 'atomic-delete' } });
      return apiServerError();
    }
    const result = firstRpcRow(rpcRows);
    if (!result) return apiServerError();
    if (result.status === PAYROLL_RPC_STATUS.NOT_FOUND) return apiNotFound(t('payroll.runNotFound'));
    if (result.status === PAYROLL_RPC_STATUS.INVALID_STATUS) {
      const status = typeof result.run_data?.status === 'string' ? result.run_data.status : '';
      return apiError(t('payroll.cannotDeleteNonDraft', { status }), 409);
    }
    if (result.status !== PAYROLL_RPC_STATUS.OK || !result.run_data) return apiServerError();

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.PAYROLL}_${ACTIVITY_ACTIONS.DELETE}`,
      '/dashboard/payroll',
      {
        payroll_id: id,
        month: result.run_data.month,
        year: result.run_data.year,
        source: 'payroll_deleted',
      },
      req.headers.get('x-forwarded-for') || 'unknown',
    );
    return apiSuccess({ deleted: true });
  } catch (error) {
    logError({ error, request: req, metadata: { route: 'payroll/[id]', method: 'DELETE' } });
    return apiServerError();
  }
}
