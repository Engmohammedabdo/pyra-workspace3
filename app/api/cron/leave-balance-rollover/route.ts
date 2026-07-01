import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/log-error';
import { calculateCarryOver } from '@/lib/leave/carry-over';
import { dubaiDayKey } from '@/lib/utils/format';
import { generateId } from '@/lib/utils/id';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/cron/leave-balance-rollover
//
// Auth: x-api-key header → pyra_api_keys (Phase D cron pattern, verbatim —
//       mirrors app/api/cron/follow-up-reminders/route.ts)
// Permission: 'cron.leave-balance-rollover' (or '*' wildcard)
// Schedule: yearly, Jan 1 00:00 Asia/Dubai via n8n Schedule Trigger
//
// Two-step job, both against pyra_leave_balances_v2 (the ONLY leave-balance
// source of truth — pyra_leave_balances (v1) is deprecated/empty):
//
//   1. Carry over remaining balances from fromYear (toYear - 1) into toYear
//      via the EXISTING calculateCarryOver() helper (lib/leave/carry-over.ts)
//      — reused verbatim, no duplicated math. It upserts pyra_leave_balances_v2
//      rows for toYear, capped per leave type's max_carry_over. This is the
//      same helper the manual POST /api/dashboard/leave/carry-over endpoint
//      already calls.
//
//   2. Seed any STILL-MISSING (username, toYear, leave_type_id) row for every
//      active employee (role IN employee/sales_agent, status='active') ×
//      every active leave type. calculateCarryOver() only creates a toYear
//      row when: (a) the leave type has max_carry_over > 0, AND (b) the
//      employee had a nonzero remaining fromYear balance. That leaves gaps:
//        - brand-new hires (no fromYear balance at all)
//        - employees who used up 100% of a type in fromYear (remaining = 0)
//        - non-carry-over types (e.g. unpaid leave, max_carry_over = 0)
//      Without seeding, those (employee, type) pairs would start the new
//      year with NO row — the leave-request flow / balance UI would have
//      nothing to read. Seeding is idempotent: it ONLY inserts rows that
//      don't already exist (checked via a bulk SELECT before insert) and
//      NEVER overwrites a row created in step 1 or by a prior run.
//
// Idempotency: safe to re-run for the same (fromYear, toYear) pair.
// calculateCarryOver() already upserts by (username, leave_type_id, toYear);
// the seed step only inserts what's missing after that.
// ────────────────────────────────────────────────────────────────────────────

interface LeaveTypeRow {
  id: string;
  default_days: number;
}

interface EmployeeRow {
  username: string;
}

interface ExistingBalanceRow {
  username: string;
  leave_type_id: string;
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);

    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.leave-balance-rollover') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.leave-balance-rollover', 403);
    }

    const supabase = createServiceRoleClient();

    // Current Dubai calendar year drives the rollover window — never derive
    // "today" via .toISOString() (Phase 15.1 lock: UTC day ≠ Dubai day).
    const toYear = Number(dubaiDayKey().slice(0, 4));
    const fromYear = toYear - 1;

    // ── Step 1: carry over remaining balances (existing helper, reused verbatim) ──
    const carryOverResult = await calculateCarryOver(supabase, fromYear, toYear);
    const carriedOver = carryOverResult.created + carryOverResult.updated;

    // ── Step 2: seed missing (username, toYear, leave_type_id) rows ──
    const { data: leaveTypesData, error: ltErr } = await supabase
      .from('pyra_leave_types')
      .select('id, default_days')
      .eq('is_active', true);

    if (ltErr) {
      console.error('[cron/leave-balance-rollover] leave types fetch failed:', ltErr.message);
      return apiServerError();
    }
    const leaveTypes = (leaveTypesData ?? []) as LeaveTypeRow[];

    const { data: employeesData, error: empErr } = await supabase
      .from('pyra_users')
      .select('username')
      .in('role', ['employee', 'sales_agent'])
      .eq('status', 'active');

    if (empErr) {
      console.error('[cron/leave-balance-rollover] employees fetch failed:', empErr.message);
      return apiServerError();
    }
    const employees = (employeesData ?? []) as EmployeeRow[];

    let seeded = 0;

    if (leaveTypes.length > 0 && employees.length > 0) {
      const typeIds = leaveTypes.map((t) => t.id);
      const usernames = employees.map((e) => e.username);

      const { data: existingData, error: existErr } = await supabase
        .from('pyra_leave_balances_v2')
        .select('username, leave_type_id')
        .eq('year', toYear)
        .in('leave_type_id', typeIds)
        .in('username', usernames);

      if (existErr) {
        console.error(
          '[cron/leave-balance-rollover] existing balances fetch failed:',
          existErr.message,
        );
        return apiServerError();
      }

      const existingSet = new Set(
        ((existingData ?? []) as ExistingBalanceRow[]).map(
          (b) => `${b.username}:${b.leave_type_id}`,
        ),
      );

      const toInsert: Array<{
        id: string;
        username: string;
        year: number;
        leave_type_id: string;
        total_days: number;
        used_days: number;
        carried_over: number;
      }> = [];

      for (const employee of employees) {
        for (const leaveType of leaveTypes) {
          const key = `${employee.username}:${leaveType.id}`;
          if (existingSet.has(key)) continue; // never overwrite an existing toYear row
          toInsert.push({
            id: generateId('lb'),
            username: employee.username,
            year: toYear,
            leave_type_id: leaveType.id,
            total_days: leaveType.default_days,
            used_days: 0,
            carried_over: 0,
          });
        }
      }

      if (toInsert.length > 0) {
        const { error: insertErr } = await supabase
          .from('pyra_leave_balances_v2')
          .insert(toInsert);

        if (insertErr) {
          console.error('[cron/leave-balance-rollover] seed insert failed:', insertErr.message);
          return apiServerError();
        }
        seeded = toInsert.length;
      }
    }

    return apiSuccess({ fromYear, toYear, carriedOver, seeded });
  } catch (err) {
    logError({
      error: err,
      request,
      metadata: { source: 'cron', job: 'leave-balance-rollover' },
    });
    console.error('POST /api/cron/leave-balance-rollover threw:', err);
    return apiServerError();
  }
}
