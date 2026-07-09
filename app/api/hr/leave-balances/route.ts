import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { dubaiDayKey } from '@/lib/utils/format';

// ────────────────────────────────────────────────────────────────────────────
// /api/hr/leave-balances
//
// Admin-only view + adjust surface over pyra_leave_balances_v2 (the SINGLE
// source of truth for leave balances — pyra_leave_balances (v1) is
// deprecated/empty and must never be used).
//
// GET  — for a given ?year (default: current Dubai year) [+ optional
//        ?username filter], returns EVERY active employee (role IN
//        employee/sales_agent, status='active') joined with their v2
//        balance for EACH active leave type. Employees/types with no row
//        yet still appear, zero-filled — so the admin table always has a
//        stable column set (one column per active leave type).
//
// POST — upsert ONE (username, year, leave_type_id) balance row. Used by
//        the admin "تعديل" dialog (one call per leave-type row changed). i18n-exempt: comment only
//
// Both gated: leave.manage (admin-only), gate-then-service-role.
// ────────────────────────────────────────────────────────────────────────────

interface LeaveTypeRow {
  id: string;
  name_ar: string;
}

interface EmployeeRow {
  username: string;
  display_name: string;
}

interface BalanceRow {
  username: string;
  leave_type_id: string;
  total_days: number;
  used_days: number;
  carried_over: number;
}

export interface LeaveBalanceTypeEntry {
  leave_type_id: string;
  name_ar: string;
  total_days: number;
  used_days: number;
  carried_over: number;
  remaining: number;
}

export interface EmployeeLeaveBalances {
  username: string;
  display_name: string;
  balances: LeaveBalanceTypeEntry[];
}

// ──────────────────────────────────────────────────────────────────────────
// GET — admin balances table for a given year
// ──────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('leave.manage');
    if (isApiError(auth)) return auth;
    const t = await getTranslations('api');

    const supabase = createServiceRoleClient();
    const { searchParams } = new URL(request.url);

    const yearParam = searchParams.get('year');
    const year = yearParam ? Number(yearParam) : Number(dubaiDayKey().slice(0, 4));
    const usernameFilter = searchParams.get('username');

    if (!Number.isFinite(year)) {
      return apiValidationError(t('hr.leaveBalanceYearInvalid'));
    }

    // Active leave types drive the fixed column set.
    const { data: leaveTypesData, error: ltErr } = await supabase
      .from('pyra_leave_types')
      .select('id, name_ar')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (ltErr) {
      console.error('[hr/leave-balances GET] leave types fetch failed:', ltErr.message);
      return apiServerError();
    }
    const leaveTypes = (leaveTypesData ?? []) as LeaveTypeRow[];

    // Active employees (optionally scoped to one username).
    let employeesQuery = supabase
      .from('pyra_users')
      .select('username, display_name')
      .in('role', ['employee', 'sales_agent'])
      .eq('status', 'active')
      .order('display_name', { ascending: true });

    if (usernameFilter) {
      employeesQuery = employeesQuery.eq('username', usernameFilter);
    }

    const { data: employeesData, error: empErr } = await employeesQuery;
    if (empErr) {
      console.error('[hr/leave-balances GET] employees fetch failed:', empErr.message);
      return apiServerError();
    }
    const employees = (employeesData ?? []) as EmployeeRow[];

    let balanceMap = new Map<string, BalanceRow>();

    if (employees.length > 0 && leaveTypes.length > 0) {
      const typeIds = leaveTypes.map((t) => t.id);
      const usernames = employees.map((e) => e.username);

      const { data: balancesData, error: balErr } = await supabase
        .from('pyra_leave_balances_v2')
        .select('username, leave_type_id, total_days, used_days, carried_over')
        .eq('year', year)
        .in('leave_type_id', typeIds)
        .in('username', usernames);

      if (balErr) {
        console.error('[hr/leave-balances GET] balances fetch failed:', balErr.message);
        return apiServerError();
      }

      balanceMap = new Map(
        ((balancesData ?? []) as BalanceRow[]).map((b) => [
          `${b.username}:${b.leave_type_id}`,
          b,
        ]),
      );
    }

    const result: EmployeeLeaveBalances[] = employees.map((emp) => ({
      username: emp.username,
      display_name: emp.display_name,
      balances: leaveTypes.map((lt) => {
        const row = balanceMap.get(`${emp.username}:${lt.id}`);
        const total_days = row?.total_days ?? 0;
        const used_days = row?.used_days ?? 0;
        const carried_over = row?.carried_over ?? 0;
        return {
          leave_type_id: lt.id,
          name_ar: lt.name_ar,
          total_days,
          used_days,
          carried_over,
          remaining: total_days + carried_over - used_days,
        };
      }),
    }));

    return apiSuccess(result);
  } catch (err) {
    logError({ error: err, request, metadata: { source: 'hr_leave_balances_list' } });
    console.error('[hr/leave-balances GET] threw:', err);
    return apiServerError();
  }
}

// ──────────────────────────────────────────────────────────────────────────
// POST — adjust/upsert one (username, year, leave_type_id) balance
// ──────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('leave.manage');
    if (isApiError(auth)) return auth;
    const t = await getTranslations('api');

    const supabase = createServiceRoleClient();
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return apiValidationError(t('hr.bodyInvalid'));
    }

    const { username, year, leave_type_id, total_days, used_days, carried_over } = body as Record<
      string,
      unknown
    >;

    if (typeof username !== 'string' || !username.trim()) {
      return apiValidationError(t('common.usernameRequired'));
    }
    if (typeof leave_type_id !== 'string' || !leave_type_id.trim()) {
      return apiValidationError(t('hr.leaveTypeIdRequired'));
    }
    if (typeof year !== 'number' || !Number.isFinite(year)) {
      return apiValidationError(t('hr.yearRequired'));
    }
    for (const [key, value] of [
      ['total_days', total_days],
      ['used_days', used_days],
      ['carried_over', carried_over],
    ] as const) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        return apiValidationError(t('hr.fieldMustBeNonNegativeInteger', { field: key }));
      }
    }

    const totalDaysNum = total_days as number;
    const usedDaysNum = used_days as number;
    const carriedOverNum = carried_over as number;

    const { data: existing, error: existErr } = await supabase
      .from('pyra_leave_balances_v2')
      .select('id')
      .eq('username', username)
      .eq('year', year)
      .eq('leave_type_id', leave_type_id)
      .maybeSingle();

    if (existErr) {
      console.error('[hr/leave-balances POST] lookup failed:', existErr.message);
      return apiServerError();
    }

    let updatedRow: BalanceRow & { id: string };

    if (existing) {
      const { data: updated, error: updateErr } = await supabase
        .from('pyra_leave_balances_v2')
        .update({
          total_days: totalDaysNum,
          used_days: usedDaysNum,
          carried_over: carriedOverNum,
        })
        .eq('id', existing.id)
        .select('id, username, leave_type_id, total_days, used_days, carried_over')
        .single();

      if (updateErr || !updated) {
        console.error('[hr/leave-balances POST] update failed:', updateErr?.message);
        return apiServerError(t('hr.balanceUpdateFailed'));
      }
      updatedRow = updated;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('pyra_leave_balances_v2')
        .insert({
          id: generateId('lb'),
          username,
          year,
          leave_type_id,
          total_days: totalDaysNum,
          used_days: usedDaysNum,
          carried_over: carriedOverNum,
        })
        .select('id, username, leave_type_id, total_days, used_days, carried_over')
        .single();

      if (insertErr || !inserted) {
        console.error('[hr/leave-balances POST] insert failed:', insertErr?.message);
        return apiServerError(t('hr.balanceInsertFailed'));
      }
      updatedRow = inserted;
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.LEAVE}_${ACTIVITY_ACTIONS.UPDATE}`,
      '/dashboard/hr/leave-balances',
      {
        source: 'leave_balance_adjusted',
        username,
        year,
        leave_type_id,
      },
      request.headers.get('x-forwarded-for') ?? undefined,
    );

    return apiSuccess({
      ...updatedRow,
      year,
      remaining: updatedRow.total_days + updatedRow.carried_over - updatedRow.used_days,
    });
  } catch (err) {
    logError({ error: err, request, metadata: { source: 'hr_leave_balances_adjust' } });
    console.error('[hr/leave-balances POST] threw:', err);
    return apiServerError();
  }
}
