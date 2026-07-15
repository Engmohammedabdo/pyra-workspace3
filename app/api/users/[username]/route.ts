import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiValidationError,
  apiServerError,
  apiError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveAuthUserId } from '@/lib/auth/auth-mapping';
import { generateId } from '@/lib/utils/id';
import { validateExtraPermissions, type ApiTranslator } from '@/lib/auth/rbac';
import { EMPLOYMENT_TYPES, WORK_LOCATIONS, PAYMENT_TYPES, SALARY_CURRENCIES } from '@/lib/constants/auth';
import { getDirectReports } from '@/lib/auth/team-scope';
import { notifyMany } from '@/lib/notifications/notify';
import { logError } from '@/lib/observability/log-error';

/**
 * Tables whose rows are EVIDENCE — HR/finance records with legal or financial
 * weight. A single row in ANY of them blocks hard-delete: the admin must
 * deactivate instead (the "deactivate, never delete" lock).
 *
 * The pre-2026-07-15 guard only covered payroll_items / employee_payments /
 * employee_documents / onboarding, which a short-tenure employee has all-zero.
 * Such a user was therefore hard-deletable, and the cleanup loop below then
 * destroyed their `pyra_attendance` rows — the evidence base the attendance-
 * deduction policy relies on to justify a deduction. `pyra_salary_history` was
 * in neither the guard nor the cleanup list, so it orphaned either way
 * (migration 023 had to remove exactly such an orphan for user `abeer`).
 *
 * A never-used account (zero rows everywhere) stays deletable, so cleaning up a
 * mistyped username still works.
 */
const EVIDENCE_TABLES: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'pyra_payroll_items', column: 'username' },
  { table: 'pyra_employee_payments', column: 'username' },
  { table: 'pyra_employee_documents', column: 'employee_username' },
  { table: 'pyra_onboarding', column: 'employee_username' },
  { table: 'pyra_attendance', column: 'username' },
  { table: 'pyra_salary_history', column: 'username' },
  { table: 'pyra_leave_requests', column: 'username' },
  { table: 'pyra_timesheets', column: 'username' },
  { table: 'pyra_evaluations', column: 'employee_username' },
];

/**
 * Ephemera — inbox / session / membership rows carrying no evidentiary value.
 * Only reached once EVIDENCE_TABLES are all empty, so the HR tables are
 * deliberately absent here: the guard already proved they hold no rows.
 *
 * `pyra_notifications` is keyed on `recipient_username` (the departing user's
 * own inbox) and NOT on `source_username` — rows they merely triggered live in
 * OTHER users' inboxes and must survive. `source_display_name` is denormalised
 * so those stay readable, and no FK on `source_username` can dangle.
 */
const CLEANUP_TABLES: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'pyra_leave_balances_v2', column: 'username' },
  { table: 'pyra_timesheet_periods', column: 'username' },
  { table: 'pyra_evaluations', column: 'evaluator_username' },
  { table: 'pyra_kpi_targets', column: 'username' },
  { table: 'pyra_task_assignees', column: 'username' },
  { table: 'pyra_task_comments', column: 'author_username' },
  { table: 'pyra_task_activity', column: 'username' },
  { table: 'pyra_announcement_reads', column: 'username' },
  { table: 'pyra_board_members', column: 'username' },
  { table: 'pyra_sessions', column: 'username' },
  { table: 'pyra_notifications', column: 'recipient_username' },
];

/**
 * Insert a salary history record when salary or hourly_rate changes.
 */
async function trackSalaryChange(
  supabase: ReturnType<typeof createServiceRoleClient>,
  username: string,
  changedBy: string,
  oldSalary: number | null,
  newSalary: number | null,
  oldHourlyRate: number | null,
  newHourlyRate: number | null,
) {
  const salaryChanged = oldSalary !== newSalary;
  const rateChanged = oldHourlyRate !== newHourlyRate;
  if (!salaryChanged && !rateChanged) return;

  await supabase.from('pyra_salary_history').insert({
    id: generateId('sh'),
    username,
    old_salary: oldSalary,
    new_salary: newSalary,
    old_hourly_rate: oldHourlyRate,
    new_hourly_rate: newHourlyRate,
    effective_date: new Date().toISOString().split('T')[0],
    changed_by: changedBy,
  });
}

type RouteParams = { params: Promise<{ username: string }> };

// =============================================================
// GET /api/users/[username]
// Get a single user by username (admin only).
// =============================================================
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiPermission('users.view');
    if (isApiError(auth)) return auth;
    const t = await getTranslations('api');

    const { username } = await params;

    const supabase = await createServerSupabaseClient();
    const { data: user, error } = await supabase
      .from('pyra_users')
      .select('id, username, role, display_name, permissions, extra_permissions, role_id, phone, job_title, avatar_url, status, created_at, manager_username, employment_type, work_location, payment_type, salary, salary_currency, hourly_rate, hire_date, date_of_birth, department, national_id, bank_details, commission_rate, work_schedule_id, salary_breakdown, onboarding_id, pyra_roles!left(name, name_ar, color, icon)')
      .eq('username', username)
      .single();

    if (error || !user) {
      return apiNotFound(t('users.notFound'));
    }

    return apiSuccess(user);
  } catch (err) {
    console.error('User GET error:', err);
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/users/[username]
// Update a user (admin only).
// Body can include: { display_name?, role?, permissions?, role_id?, phone?, job_title?, status? }
// =============================================================
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiPermission('users.manage');
    if (isApiError(auth)) return auth;
    const t = await getTranslations('api');

    const { username } = await params;
    const body = await request.json();

    const supabase = await createServerSupabaseClient();

    // Verify user exists
    const { data: existingUser, error: findError } = await supabase
      .from('pyra_users')
      .select('id, username, role, display_name, permissions, extra_permissions, role_id, phone, job_title, status, created_at, manager_username, employment_type, work_location, payment_type, salary, hourly_rate, hire_date, date_of_birth, department')
      .eq('username', username)
      .single();

    if (findError || !existingUser) {
      return apiNotFound(t('users.notFound'));
    }

    // Build update payload — only include provided fields
    const updateData: Record<string, unknown> = {};

    if (body.display_name !== undefined) {
      if (typeof body.display_name !== 'string' || body.display_name.trim().length === 0) {
        return apiValidationError(t('users.displayNameInvalid'));
      }
      updateData.display_name = body.display_name.trim();
    }

    if (body.role !== undefined) {
      if (!['admin', 'employee', 'sales_agent'].includes(body.role)) {
        return apiValidationError(t('users.roleInvalid'));
      }
      // Prevent admin from CHANGING their own role (could lock themselves out).
      // The edit dialog always sends the full form incl. an unchanged role —
      // only block when the value actually differs (2026-07-03 fix: the old
      // presence-check 400'd EVERY self-edit, e.g. adding your own phone).
      if (username === auth.pyraUser.username && body.role !== existingUser.role) {
        return apiError(t('users.cannotChangeOwnRole'), 400);
      }
      // Prevent demoting the last admin
      if (existingUser.role === 'admin' && body.role !== 'admin') {
        const { count: adminCount } = await supabase
          .from('pyra_users')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'admin');
        if ((adminCount ?? 0) <= 1) {
          return apiError(t('users.cannotDemoteLastAdmin'), 400);
        }
      }
      updateData.role = body.role;
    }

    if (body.permissions !== undefined) {
      if (typeof body.permissions !== 'object' || body.permissions === null) {
        return apiValidationError(t('users.permissionsInvalid'));
      }
      updateData.permissions = body.permissions;
    }

    // --- extra_permissions (per-user additional RBAC permissions) ---
    // Phase D Commit 1 (audit P2 #1) — exact-match whitelist against
    // PERMISSIONS catalog; reject wildcards. validateExtraPermissions
    // returns { ok, value } for the happy path or { ok: false, error,
    // rejected? } for typos / wildcard attempts. The shared helper keeps
    // POST + PATCH in sync (DRY).
    if (body.extra_permissions !== undefined) {
      // next-intl's translator narrows `key` to known message keys, which
      // doesn't structurally satisfy validateExtraPermissions' looser
      // ApiTranslator param type (contravariance) — safe explicit cast.
      const extraPermsResult = validateExtraPermissions(body.extra_permissions, t as ApiTranslator);
      if (!extraPermsResult.ok) {
        return apiValidationError(extraPermsResult.error);
      }
      updateData.extra_permissions = extraPermsResult.value;
    }

    // --- role_id (RBAC role assignment) ---
    if (body.role_id !== undefined) {
      if (body.role_id === null) {
        // Unassign role
        updateData.role_id = null;
      } else {
        if (typeof body.role_id !== 'string') {
          return apiValidationError(t('users.roleIdInvalid'));
        }
        // Validate that the role exists using service role client
        const serviceClient = createServiceRoleClient();
        const { data: roleExists, error: roleError } = await serviceClient
          .from('pyra_roles')
          .select('id')
          .eq('id', body.role_id)
          .single();
        if (roleError || !roleExists) {
          return apiValidationError(t('users.roleIdNotFound'));
        }
        updateData.role_id = body.role_id;
      }
    }

    // --- phone ---
    if (body.phone !== undefined) {
      if (body.phone !== null && typeof body.phone !== 'string') {
        return apiValidationError(t('users.phoneInvalid'));
      }
      updateData.phone = body.phone ? body.phone.trim() : null;
    }

    // --- job_title ---
    if (body.job_title !== undefined) {
      if (body.job_title !== null && typeof body.job_title !== 'string') {
        return apiValidationError(t('users.jobTitleInvalid'));
      }
      updateData.job_title = body.job_title ? body.job_title.trim() : null;
    }

    // --- status ---
    if (body.status !== undefined) {
      const validStatuses = ['active', 'inactive', 'suspended'];
      if (!validStatuses.includes(body.status)) {
        return apiValidationError(t('users.statusInvalid'));
      }
      updateData.status = body.status;
      // Stamp/clear the departure timestamp for turnover metrics: set it only on
      // the transition FROM active into an inactive state; clear on reactivation.
      if ((body.status === 'inactive' || body.status === 'suspended') && existingUser.status === 'active') {
        updateData.deactivated_at = new Date().toISOString();
      } else if (body.status === 'active') {
        updateData.deactivated_at = null;
      }
    }

    // --- Employment classification fields ---
    if (body.employment_type !== undefined) {
      if (body.employment_type !== null && !(EMPLOYMENT_TYPES as readonly string[]).includes(body.employment_type)) {
        return apiValidationError(t('users.employmentTypeInvalid'));
      }
      updateData.employment_type = body.employment_type;
    }

    if (body.work_location !== undefined) {
      if (body.work_location !== null && !(WORK_LOCATIONS as readonly string[]).includes(body.work_location)) {
        return apiValidationError(t('users.workLocationInvalid'));
      }
      updateData.work_location = body.work_location;
    }

    if (body.payment_type !== undefined) {
      if (body.payment_type !== null && !(PAYMENT_TYPES as readonly string[]).includes(body.payment_type)) {
        return apiValidationError(t('users.paymentTypeInvalid'));
      }
      updateData.payment_type = body.payment_type;
    }

    if (body.salary !== undefined) {
      if (body.salary !== null && (typeof body.salary !== 'number' || body.salary < 0)) {
        return apiValidationError(t('users.salaryInvalid'));
      }
      updateData.salary = body.salary;
    }

    if (body.hourly_rate !== undefined) {
      if (body.hourly_rate !== null && (typeof body.hourly_rate !== 'number' || body.hourly_rate < 0)) {
        return apiValidationError(t('users.hourlyRateInvalid'));
      }
      updateData.hourly_rate = body.hourly_rate;
    }

    if (body.hire_date !== undefined) {
      if (body.hire_date !== null && typeof body.hire_date !== 'string') {
        return apiValidationError(t('users.hireDateInvalid'));
      }
      updateData.hire_date = body.hire_date;
    }

    if (body.date_of_birth !== undefined) {
      if (body.date_of_birth !== null && typeof body.date_of_birth !== 'string') {
        return apiValidationError(t('users.dateOfBirthInvalid'));
      }
      updateData.date_of_birth = body.date_of_birth || null;
    }

    if (body.department !== undefined) {
      if (body.department !== null && typeof body.department !== 'string') {
        return apiValidationError(t('users.departmentInvalid'));
      }
      updateData.department = body.department ? body.department.trim() : null;
    }

    // --- manager_username (direct manager) ---
    if (body.manager_username !== undefined) {
      if (body.manager_username === null) {
        updateData.manager_username = null;
      } else {
        if (typeof body.manager_username !== 'string') {
          return apiValidationError(t('users.managerUsernameInvalid'));
        }
        // Prevent setting self as own manager
        if (body.manager_username === username) {
          return apiError(t('users.cannotBeOwnManager'), 400);
        }
        // Validate that the manager exists
        const { data: managerExists, error: managerError } = await supabase
          .from('pyra_users')
          .select('username')
          .eq('username', body.manager_username)
          .single();
        if (managerError || !managerExists) {
          return apiValidationError(t('users.managerNotFound'));
        }
        updateData.manager_username = body.manager_username;
      }
    }

    // --- salary_currency (migration 025) ---
    if (body.salary_currency !== undefined) {
      // Column is NOT NULL — reject null/invalid explicitly (no silent coercion).
      if (!(SALARY_CURRENCIES as readonly string[]).includes(body.salary_currency)) {
        return apiValidationError(t('users.salaryCurrencyInvalid', { allowed: SALARY_CURRENCIES.join('، ') })); // i18n-exempt: pre-existing Arabic-comma list separator (legacy, unchanged)
      }
      updateData.salary_currency = body.salary_currency;
    }

    // --- national_id ---
    if (body.national_id !== undefined) {
      if (body.national_id !== null && typeof body.national_id !== 'string') {
        return apiValidationError(t('users.nationalIdInvalid'));
      }
      updateData.national_id = body.national_id ? body.national_id.trim() : null;
    }

    // --- bank_details ---
    if (body.bank_details !== undefined) {
      if (body.bank_details !== null &&
          (typeof body.bank_details !== 'object' || Array.isArray(body.bank_details))) {
        return apiValidationError(t('users.bankDetailsInvalid'));
      }
      updateData.bank_details = body.bank_details ?? null;
    }

    // --- commission_rate ---
    if (body.commission_rate !== undefined) {
      if (body.commission_rate !== null &&
          (typeof body.commission_rate !== 'number' || Number.isNaN(body.commission_rate) || body.commission_rate < 0 || body.commission_rate > 100)) {
        return apiValidationError(t('users.commissionRateInvalid'));
      }
      updateData.commission_rate = body.commission_rate ?? null;
    }

    // --- work_schedule_id ---
    if (body.work_schedule_id !== undefined) {
      if (body.work_schedule_id !== null && typeof body.work_schedule_id !== 'string') {
        return apiValidationError(t('users.workScheduleIdInvalid'));
      }
      updateData.work_schedule_id = body.work_schedule_id ?? null;
    }

    // --- salary_breakdown (migration 025) ---
    if (body.salary_breakdown !== undefined) {
      if (body.salary_breakdown !== null &&
          (typeof body.salary_breakdown !== 'object' || Array.isArray(body.salary_breakdown))) {
        return apiValidationError(t('users.salaryBreakdownInvalid'));
      }
      updateData.salary_breakdown = body.salary_breakdown ?? null;
    }

    if (Object.keys(updateData).length === 0) {
      return apiValidationError(t('users.noDataToUpdate'));
    }

    // Perform the update
    const { data: updatedUser, error: updateError } = await supabase
      .from('pyra_users')
      .update(updateData)
      .eq('username', username)
      .select('id, username, role, display_name, permissions, extra_permissions, role_id, phone, job_title, status, created_at, manager_username, employment_type, work_location, payment_type, salary, salary_currency, hourly_rate, hire_date, date_of_birth, department, national_id, bank_details, commission_rate, work_schedule_id, salary_breakdown, onboarding_id')
      .single();

    if (updateError) {
      console.error('User update error:', updateError);
      return apiServerError(t('users.updateFailed'));
    }

    // Track salary/hourly_rate changes in pyra_salary_history
    if (updateData.salary !== undefined || updateData.hourly_rate !== undefined) {
      try {
        const serviceClient = createServiceRoleClient();
        await trackSalaryChange(
          serviceClient,
          username,
          auth.pyraUser.username,
          existingUser.salary ?? null,
          updateData.salary !== undefined ? (updateData.salary as number | null) : (existingUser.salary ?? null),
          existingUser.hourly_rate ?? null,
          updateData.hourly_rate !== undefined ? (updateData.hourly_rate as number | null) : (existingUser.hourly_rate ?? null),
        );
      } catch (err) {
        console.error('Salary history insert error:', err);
        // Non-blocking — do not fail the update
      }
    }

    // B2: If the user's status was set to inactive or suspended, alert admins
    // about any direct reports that may need a new manager assigned.
    // (We do NOT null manager_username on deactivation — the link is preserved
    // for potential reactivation; admins may reassign manually if needed.)
    if (
      (body.status === 'inactive' || body.status === 'suspended') &&
      existingUser.status !== body.status
    ) {
      try {
        const deactServiceClient = createServiceRoleClient();
        const orphanedReports = await getDirectReports(deactServiceClient, username);
        if (orphanedReports.length > 0) {
          const { data: admins } = await deactServiceClient
            .from('pyra_users')
            .select('username')
            .eq('role', 'admin')
            .eq('status', 'active');
          await notifyMany(
            deactServiceClient,
            (admins ?? []).map((a: { username: string }) => a.username),
            {
              type: 'system',
              title: 'مدير مُعطَّل — موظفون بحاجة لمتابعة', // i18n-exempt: notification content (Phase 8)
              message: `تم تعطيل ${updatedUser.display_name ?? username} وله ${orphanedReports.length} موظف تابع — قد تحتاج لإعادة تعيين مديرهم`, // i18n-exempt: notification content (Phase 8)
              link: '/dashboard/users',
              from: { username: 'system' },
            },
          );
        }
      } catch (deactErr) {
        // Non-blocking — never fail the PATCH for a notification error
        console.error('[PATCH /api/users] deactivation alert error:', deactErr);
      }
    }

    // Update Supabase Auth user metadata if display_name or role changed
    if (updateData.display_name || updateData.role) {
      const serviceClient = createServiceRoleClient();
      const authUserId = await resolveAuthUserId(serviceClient, username);

      if (authUserId) {
        await serviceClient.auth.admin.updateUserById(authUserId, {
          user_metadata: {
            username,
            display_name: updatedUser.display_name,
            role: updatedUser.role,
          },
        });
      }
    }

    // Log the activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'user_updated',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: username,
      details: {
        updated_fields: Object.keys(updateData),
        changes: updateData,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(updatedUser);
  } catch (err) {
    console.error('User PATCH error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/users/[username]
// Delete a user (admin only). Cannot delete own account.
// =============================================================
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiPermission('users.manage');
    if (isApiError(auth)) return auth;
    const t = await getTranslations('api');

    const { username } = await params;

    // Prevent deleting own account
    if (username === auth.pyraUser.username) {
      return apiError(t('users.cannotDeleteSelf'), 400);
    }

    const supabase = await createServerSupabaseClient();

    // Verify user exists
    const { data: existingUser, error: findError } = await supabase
      .from('pyra_users')
      .select('id, username, display_name, role')
      .eq('username', username)
      .single();

    if (findError || !existingUser) {
      return apiNotFound(t('users.notFound'));
    }

    // Use service-role client to bypass RLS for cleanup
    const serviceClient = createServiceRoleClient();

    // Block hard-delete when the employee has records that must be preserved — use deactivate instead.
    const evidenceChecks = await Promise.all(
      EVIDENCE_TABLES.map(async ({ table, column }) => {
        const { count, error } = await serviceClient
          .from(table)
          .select('id', { count: 'exact', head: true })
          .eq(column, username);
        return { table, column, count: count ?? 0, error };
      }),
    );

    // Fail CLOSED. Supabase JS resolves with `{ error }` rather than throwing,
    // so a bad column/table returns count=null and would otherwise read as
    // "no records" — silently authorising the irreversible delete this guard
    // exists to prevent. A guard that cannot read its evidence must refuse.
    const unreadable = evidenceChecks.filter((c) => c.error);
    if (unreadable.length > 0) {
      logError({
        error: new Error(
          `User-delete guard could not read: ${unreadable
            .map((c) => `${c.table}.${c.column} (${c.error?.code ?? 'unknown'}: ${c.error?.message ?? ''})`)
            .join('; ')}`,
        ),
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { action: 'users.delete.guard', target_username: username },
      });
      return apiServerError(t('users.deleteGuardFailed'));
    }

    const blocking = evidenceChecks.filter((c) => c.count > 0);
    if (blocking.length > 0) {
      return apiError(
        t('users.deleteBlockedHasRecords'),
        409,
      );
    }

    // Capture direct reports BEFORE deletion so we can null their manager link
    // and alert admins after the user is gone.
    const reports = await getDirectReports(serviceClient, username);
    if (reports.length > 0) {
      await serviceClient
        .from('pyra_users')
        .update({ manager_username: null })
        .eq('manager_username', username);
    }

    // Step 1: Clean up ephemeral related records. These reference username but
    // have no FK CASCADE (only pyra_auth_mapping + pyra_agent_whatsapp_settings
    // do). Best-effort: the evidence guard has already passed, so a failure here
    // leaves a harmless orphan and must not abort the delete — but it is logged
    // loudly rather than swallowed.
    for (const { table, column } of CLEANUP_TABLES) {
      const { error: cleanupError } = await serviceClient.from(table).delete().eq(column, username);
      if (cleanupError) {
        // Supabase JS returns `{ error }` instead of throwing, so the previous
        // try/catch here never fired: `pyra_notifications.username` does not
        // exist (it is recipient_username), and every delete silently orphaned
        // the departing user's notifications with a 42703 nobody ever saw.
        logError({
          severity: 'warning',
          error: new Error(
            `User-delete cleanup failed on ${table}.${column} (${cleanupError.code ?? 'unknown'}): ${cleanupError.message}`,
          ),
          request,
          user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
          metadata: { action: 'users.delete.cleanup', target_username: username, table, column },
        });
        console.error(`[DELETE /api/users] cleanup failed on ${table}.${column}:`, cleanupError);
      }
    }

    // Step 2: Delete from pyra_users
    const { error: deleteError } = await serviceClient
      .from('pyra_users')
      .delete()
      .eq('username', username);

    if (deleteError) {
      console.error('pyra_users delete error:', deleteError);
      return apiServerError(t('users.deleteFailed'));
    }

    // Step 3: Find and delete Supabase Auth user
    const authUserId = await resolveAuthUserId(serviceClient, username);

    if (authUserId) {
      await serviceClient.auth.admin.deleteUser(authUserId);

      // Clean up the mapping record
      await serviceClient
        .from('pyra_auth_mapping')
        .delete()
        .eq('pyra_username', username);
    }

    // Step 4: Log the activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'user_deleted',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: username,
      details: {
        deleted_username: existingUser.username,
        deleted_display_name: existingUser.display_name,
        deleted_role: existingUser.role,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    // Step 5: If the deleted user had direct reports, alert admins to reassign them
    if (reports.length > 0) {
      const { data: admins } = await serviceClient
        .from('pyra_users')
        .select('username')
        .eq('role', 'admin')
        .eq('status', 'active');
      await notifyMany(
        serviceClient,
        (admins ?? []).map((a: { username: string }) => a.username),
        {
          type: 'system',
          title: 'موظفون بحاجة لإعادة تعيين مدير', // i18n-exempt: notification content (Phase 8)
          message: `تم حذف ${existingUser.display_name} وكان لديه ${reports.length} موظف تابع — يرجى إعادة تعيين مديرهم`, // i18n-exempt: notification content (Phase 8)
          link: '/dashboard/users',
          from: { username: 'system' },
        },
      );
    }

    return apiSuccess({ message: t('users.deleteSuccess') });
  } catch (err) {
    console.error('User DELETE error:', err);
    return apiServerError();
  }
}
