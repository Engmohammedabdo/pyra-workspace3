import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, apiValidationError, apiServerError } from '@/lib/api/response';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { generateId } from '@/lib/utils/id';
import { lockAccount } from '@/lib/hr/lock-account';
import { buildHandover, executeHandover, type HandoverDecisions } from '@/lib/hr/handover';
import { computeFinalSettlement, deriveDeductibleAbsenceDays } from '@/lib/hr/final-settlement';
import { isOnTimeClockIn } from '@/lib/hr/attendance-policy';
import { dubaiDayKey } from '@/lib/utils/format';

type RouteParams = { params: Promise<{ username: string }> };

type SettlementUser = {
  salary: number | null;
  salary_currency: string | null;
  hire_date: string | null;
  work_schedule_id: string | null;
  username: string;
};

// Derive the settlement inputs (deductible-absence days) from attendance + schedule,
// capped at lastWorkingDay. Shared by GET (preview) and POST (record) so the number
// the admin confirms is the number that gets recorded.
async function computeSettlement(
  supabase: ReturnType<typeof createServiceRoleClient>,
  user: SettlementUser,
  lastWorkingDay: string,
) {
  const salary = Number(user.salary ?? 0);
  const currency = user.salary_currency ?? 'AED';
  const hireDate = (user.hire_date ?? lastWorkingDay).slice(0, 10);

  // Schedule (fall back to the Pyramedia default if unset — Mon–Sat, 11:00).
  let workDays = [1, 2, 3, 4, 5, 6];
  let startHHMM = '11:00';
  if (user.work_schedule_id) {
    const { data: sched } = await supabase
      .from('pyra_work_schedules')
      .select('work_days, start_time')
      .eq('id', user.work_schedule_id)
      .maybeSingle();
    if (sched?.work_days) workDays = sched.work_days as number[];
    if (sched?.start_time) startHHMM = String(sched.start_time).slice(0, 5);
  }

  // Attendance between hire and last working day → on-time date set.
  const { data: att } = await supabase
    .from('pyra_attendance')
    .select('date, clock_in')
    .eq('username', user.username)
    .gte('date', hireDate)
    .lte('date', lastWorkingDay);
  const rows = (att ?? []) as { date: string; clock_in: string | null }[];
  const onTimeDates = rows
    .filter((r) => r.clock_in && isOnTimeClockIn(r.clock_in, startHHMM))
    .map((r) => r.date.slice(0, 10));
  const firstAttendanceDateKey = rows.length
    ? rows.map((r) => r.date.slice(0, 10)).sort()[0]
    : null;

  const deductibleAbsenceDays = deriveDeductibleAbsenceDays({
    hireDateKey: hireDate,
    lastWorkingDayKey: lastWorkingDay,
    workDays,
    startHHMM,
    onTimeDates,
    firstAttendanceDateKey,
  });

  return computeFinalSettlement({
    salary,
    currency,
    hireDate,
    lastWorkingDay,
    deductibleAbsenceDays,
  });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireApiPermission('hr.manage');
  if (isApiError(auth)) return auth;
  try {
    const { username } = await params;
    const supabase = createServiceRoleClient();
    const { data: user, error } = await supabase
      .from('pyra_users')
      .select('username, display_name, status, salary, salary_currency, hire_date, work_schedule_id')
      .eq('username', username)
      .maybeSingle();
    if (error) {
      logError({ error, request, metadata: { fn: 'GET exit', username } });
      return apiServerError();
    }
    if (!user) return apiError('المستخدم غير موجود', 404); // i18n-exempt: handled by client catalog
    if (user.status !== 'active') return apiValidationError('الموظف غير نشط بالفعل'); // i18n-exempt

    const lastWorkingDay = dubaiDayKey(new Date()); // preview uses "today"; POST uses the admin's chosen date
    const handover = await buildHandover(supabase, username);
    const settlement_preview = await computeSettlement(supabase, user, lastWorkingDay);
    return apiSuccess({
      employee: {
        username: user.username,
        display_name: user.display_name,
        salary: user.salary,
        currency: user.salary_currency,
        hire_date: user.hire_date,
      },
      handover,
      settlement_preview,
    });
  } catch (err) {
    logError({ error: err, request, metadata: { fn: 'GET exit' } });
    return apiServerError();
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireApiPermission('hr.manage');
  if (isApiError(auth)) return auth;
  try {
    const { username } = await params;
    const body = await request.json();
    const lastWorkingDay =
      typeof body.last_working_day === 'string' ? body.last_working_day.slice(0, 10) : '';
    const exitReason = typeof body.exit_reason === 'string' ? body.exit_reason : '';
    const decisions: HandoverDecisions = body.handover ?? {};
    const today = dubaiDayKey(new Date());

    if (!lastWorkingDay || lastWorkingDay > today)
      return apiValidationError('آخر يوم عمل يجب أن يكون اليوم أو قبله'); // i18n-exempt
    if (!exitReason) return apiValidationError('سبب الخروج مطلوب'); // i18n-exempt

    const supabase = createServiceRoleClient();
    const { data: user, error: uErr } = await supabase
      .from('pyra_users')
      .select('username, display_name, status, salary, salary_currency, hire_date, work_schedule_id')
      .eq('username', username)
      .maybeSingle();
    if (uErr) {
      logError({ error: uErr, request, metadata: { fn: 'POST exit', username } });
      return apiServerError();
    }
    if (!user) return apiError('المستخدم غير موجود', 404); // i18n-exempt
    if (user.status !== 'active') return apiValidationError('الموظف غير نشط بالفعل'); // i18n-exempt

    // Actor (for handover notifications). requireApiPermission returns the caller.
    const actor = {
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name ?? auth.pyraUser.username,
    };

    // 1. Settlement (compute BEFORE the flip so attendance reads are clean).
    const settlement = await computeSettlement(supabase, user, lastWorkingDay);

    // 2. Execute handover (reassign/remove) — collects per-source outcomes, never throws.
    const handoverResult = await executeHandover(supabase, username, decisions, actor);

    // 3. LOCK before flip.
    const lockResult = await lockAccount(supabase, username);

    // 4. Flip status ALWAYS (even if the lock failed).
    const offboardingId = generateId('ofb');
    const { error: flipErr } = await supabase
      .from('pyra_users')
      .update({
        status: 'inactive',
        deactivated_at: new Date().toISOString(),
        last_working_day: lastWorkingDay,
      })
      .eq('username', username);
    if (flipErr) {
      logError({ error: flipErr, request, metadata: { fn: 'POST exit flip', username } });
      return apiServerError();
    }

    // 5. Settlement row (pending employee-payment) — idempotent on source_id.
    let settlementPaymentId: string | null = null;
    if (settlement.net > 0) {
      const { data: existing } = await supabase
        .from('pyra_employee_payments')
        .select('id')
        .eq('source_type', 'final_settlement')
        .eq('source_id', offboardingId)
        .limit(1);
      if (!existing || existing.length === 0) {
        const paymentId = generateId('ep');
        const { error: payErr } = await supabase.from('pyra_employee_payments').insert({
          id: paymentId,
          username,
          source_type: 'final_settlement',
          source_id: offboardingId,
          description: `تسوية نهائية — ${user.display_name ?? username}`, // i18n-exempt: stored payment description
          amount: settlement.net,
          currency: settlement.currency,
          status: 'pending',
        });
        if (payErr) handoverResult.errors.push(`settlement: ${payErr.message}`);
        else settlementPaymentId = paymentId;
      }
    }

    // 6. Record the permanent offboarding row.
    const { error: obErr } = await supabase.from('pyra_offboarding').insert({
      id: offboardingId,
      employee_username: username,
      status: 'completed',
      last_working_day: lastWorkingDay,
      exit_reason: exitReason,
      exit_notes: typeof body.exit_notes === 'string' ? body.exit_notes : null,
      handover: handoverResult.applied,
      settlement,
      settlement_payment_id: settlementPaymentId,
      locked: lockResult.locked,
      lock_error: lockResult.error ?? null,
      started_by: actor.username,
    });
    if (obErr) {
      logError({ error: obErr, request, metadata: { fn: 'POST exit record', username } });
      return apiServerError();
    }

    // 7. Audit.
    logActivity(
      actor.username,
      actor.display_name,
      `${ENTITY_TYPES.OFFBOARDING}_${ACTIVITY_ACTIONS.CREATE}`,
      `/dashboard/users/${username}`,
      {
        source: 'exit',
        offboarding_id: offboardingId,
        last_working_day: lastWorkingDay,
        locked: lockResult.locked,
        settlement_net: settlement.net,
        handover_errors: handoverResult.errors,
      },
    );

    // 8. Alert admins if the lock failed or handover had errors.
    if (!lockResult.locked || handoverResult.errors.length > 0) {
      logError({
        error: new Error('exit partial failure'),
        request,
        metadata: { username, locked: lockResult.locked, errors: handoverResult.errors },
      });
    }

    return apiSuccess({
      offboarding_id: offboardingId,
      locked: lockResult.locked,
      lock_error: lockResult.error,
      settlement,
      handover_results: handoverResult,
    });
  } catch (err) {
    logError({ error: err, request, metadata: { fn: 'POST exit' } });
    return apiServerError();
  }
}
