import { NextRequest } from 'next/server';
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
import { validateExtraPermissions } from '@/lib/auth/rbac';
import { EMPLOYMENT_TYPES, WORK_LOCATIONS, PAYMENT_TYPES, SALARY_CURRENCIES } from '@/lib/constants/auth';

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

    const { username } = await params;

    const supabase = await createServerSupabaseClient();
    const { data: user, error } = await supabase
      .from('pyra_users')
      .select('id, username, role, display_name, permissions, extra_permissions, role_id, phone, job_title, avatar_url, status, created_at, manager_username, employment_type, work_location, payment_type, salary, salary_currency, hourly_rate, hire_date, date_of_birth, department, national_id, bank_details, commission_rate, work_schedule_id, salary_breakdown, onboarding_id, pyra_roles!left(name, name_ar, color, icon)')
      .eq('username', username)
      .single();

    if (error || !user) {
      return apiNotFound('المستخدم غير موجود');
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
      return apiNotFound('المستخدم غير موجود');
    }

    // Build update payload — only include provided fields
    const updateData: Record<string, unknown> = {};

    if (body.display_name !== undefined) {
      if (typeof body.display_name !== 'string' || body.display_name.trim().length === 0) {
        return apiValidationError('اسم العرض غير صالح');
      }
      updateData.display_name = body.display_name.trim();
    }

    if (body.role !== undefined) {
      if (!['admin', 'employee', 'sales_agent'].includes(body.role)) {
        return apiValidationError('الدور يجب أن يكون admin أو employee أو sales_agent');
      }
      // Prevent admin from changing their own role (could lock themselves out)
      if (username === auth.pyraUser.username) {
        return apiError('لا يمكنك تغيير دورك الخاص', 400);
      }
      // Prevent demoting the last admin
      if (existingUser.role === 'admin' && body.role !== 'admin') {
        const { count: adminCount } = await supabase
          .from('pyra_users')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'admin');
        if ((adminCount ?? 0) <= 1) {
          return apiError('لا يمكن تخفيض دور آخر مدير. يجب وجود مدير واحد على الأقل', 400);
        }
      }
      updateData.role = body.role;
    }

    if (body.permissions !== undefined) {
      if (typeof body.permissions !== 'object' || body.permissions === null) {
        return apiValidationError('الصلاحيات يجب أن تكون كائن JSON');
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
      const extraPermsResult = validateExtraPermissions(body.extra_permissions);
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
          return apiValidationError('معرّف الدور الوظيفي غير صالح');
        }
        // Validate that the role exists using service role client
        const serviceClient = createServiceRoleClient();
        const { data: roleExists, error: roleError } = await serviceClient
          .from('pyra_roles')
          .select('id')
          .eq('id', body.role_id)
          .single();
        if (roleError || !roleExists) {
          return apiValidationError('الدور الوظيفي المحدد غير موجود');
        }
        updateData.role_id = body.role_id;
      }
    }

    // --- phone ---
    if (body.phone !== undefined) {
      if (body.phone !== null && typeof body.phone !== 'string') {
        return apiValidationError('رقم الهاتف غير صالح');
      }
      updateData.phone = body.phone ? body.phone.trim() : null;
    }

    // --- job_title ---
    if (body.job_title !== undefined) {
      if (body.job_title !== null && typeof body.job_title !== 'string') {
        return apiValidationError('المسمى الوظيفي غير صالح');
      }
      updateData.job_title = body.job_title ? body.job_title.trim() : null;
    }

    // --- status ---
    if (body.status !== undefined) {
      const validStatuses = ['active', 'inactive', 'suspended'];
      if (!validStatuses.includes(body.status)) {
        return apiValidationError('الحالة يجب أن تكون active أو inactive أو suspended');
      }
      updateData.status = body.status;
    }

    // --- Employment classification fields ---
    if (body.employment_type !== undefined) {
      if (body.employment_type !== null && !(EMPLOYMENT_TYPES as readonly string[]).includes(body.employment_type)) {
        return apiValidationError('نوع التوظيف غير صالح');
      }
      updateData.employment_type = body.employment_type;
    }

    if (body.work_location !== undefined) {
      if (body.work_location !== null && !(WORK_LOCATIONS as readonly string[]).includes(body.work_location)) {
        return apiValidationError('موقع العمل غير صالح');
      }
      updateData.work_location = body.work_location;
    }

    if (body.payment_type !== undefined) {
      if (body.payment_type !== null && !(PAYMENT_TYPES as readonly string[]).includes(body.payment_type)) {
        return apiValidationError('نوع الدفع غير صالح');
      }
      updateData.payment_type = body.payment_type;
    }

    if (body.salary !== undefined) {
      if (body.salary !== null && (typeof body.salary !== 'number' || body.salary < 0)) {
        return apiValidationError('الراتب يجب أن يكون رقم موجب');
      }
      updateData.salary = body.salary;
    }

    if (body.hourly_rate !== undefined) {
      if (body.hourly_rate !== null && (typeof body.hourly_rate !== 'number' || body.hourly_rate < 0)) {
        return apiValidationError('أجر الساعة يجب أن يكون رقم موجب');
      }
      updateData.hourly_rate = body.hourly_rate;
    }

    if (body.hire_date !== undefined) {
      if (body.hire_date !== null && typeof body.hire_date !== 'string') {
        return apiValidationError('تاريخ التعيين غير صالح');
      }
      updateData.hire_date = body.hire_date;
    }

    if (body.date_of_birth !== undefined) {
      if (body.date_of_birth !== null && typeof body.date_of_birth !== 'string') {
        return apiValidationError('تاريخ الميلاد غير صالح');
      }
      updateData.date_of_birth = body.date_of_birth || null;
    }

    if (body.department !== undefined) {
      if (body.department !== null && typeof body.department !== 'string') {
        return apiValidationError('القسم غير صالح');
      }
      updateData.department = body.department ? body.department.trim() : null;
    }

    // --- manager_username (direct manager) ---
    if (body.manager_username !== undefined) {
      if (body.manager_username === null) {
        updateData.manager_username = null;
      } else {
        if (typeof body.manager_username !== 'string') {
          return apiValidationError('اسم المدير المباشر غير صالح');
        }
        // Prevent setting self as own manager
        if (body.manager_username === username) {
          return apiError('لا يمكن تعيين المستخدم كمدير لنفسه', 400);
        }
        // Validate that the manager exists
        const { data: managerExists, error: managerError } = await supabase
          .from('pyra_users')
          .select('username')
          .eq('username', body.manager_username)
          .single();
        if (managerError || !managerExists) {
          return apiValidationError('المدير المباشر المحدد غير موجود');
        }
        updateData.manager_username = body.manager_username;
      }
    }

    // --- salary_currency (migration 025) ---
    if (body.salary_currency !== undefined) {
      // Column is NOT NULL — reject null/invalid explicitly (no silent coercion).
      if (!(SALARY_CURRENCIES as readonly string[]).includes(body.salary_currency)) {
        return apiValidationError(`عملة الراتب غير صالحة. القيم المسموح بها: ${SALARY_CURRENCIES.join('، ')}`);
      }
      updateData.salary_currency = body.salary_currency;
    }

    // --- national_id ---
    if (body.national_id !== undefined) {
      if (body.national_id !== null && typeof body.national_id !== 'string') {
        return apiValidationError('رقم الهوية الوطنية غير صالح');
      }
      updateData.national_id = body.national_id ? body.national_id.trim() : null;
    }

    // --- bank_details ---
    if (body.bank_details !== undefined) {
      if (body.bank_details !== null &&
          (typeof body.bank_details !== 'object' || Array.isArray(body.bank_details))) {
        return apiValidationError('بيانات البنك يجب أن تكون كائن JSON');
      }
      updateData.bank_details = body.bank_details ?? null;
    }

    // --- commission_rate ---
    if (body.commission_rate !== undefined) {
      if (body.commission_rate !== null &&
          (typeof body.commission_rate !== 'number' || Number.isNaN(body.commission_rate) || body.commission_rate < 0 || body.commission_rate > 100)) {
        return apiValidationError('نسبة العمولة يجب أن تكون رقم بين 0 و 100');
      }
      updateData.commission_rate = body.commission_rate ?? null;
    }

    // --- work_schedule_id ---
    if (body.work_schedule_id !== undefined) {
      if (body.work_schedule_id !== null && typeof body.work_schedule_id !== 'string') {
        return apiValidationError('معرّف جدول العمل غير صالح');
      }
      updateData.work_schedule_id = body.work_schedule_id ?? null;
    }

    // --- salary_breakdown (migration 025) ---
    if (body.salary_breakdown !== undefined) {
      if (body.salary_breakdown !== null &&
          (typeof body.salary_breakdown !== 'object' || Array.isArray(body.salary_breakdown))) {
        return apiValidationError('تفاصيل الراتب يجب أن تكون كائن JSON');
      }
      updateData.salary_breakdown = body.salary_breakdown ?? null;
    }

    if (Object.keys(updateData).length === 0) {
      return apiValidationError('لا توجد بيانات للتحديث');
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
      return apiServerError('فشل في تحديث المستخدم');
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

    const { username } = await params;

    // Prevent deleting own account
    if (username === auth.pyraUser.username) {
      return apiError('لا يمكنك حذف حسابك الخاص', 400);
    }

    const supabase = await createServerSupabaseClient();

    // Verify user exists
    const { data: existingUser, error: findError } = await supabase
      .from('pyra_users')
      .select('id, username, display_name, role')
      .eq('username', username)
      .single();

    if (findError || !existingUser) {
      return apiNotFound('المستخدم غير موجود');
    }

    // Use service-role client to bypass RLS for cleanup
    const serviceClient = createServiceRoleClient();

    // Step 1: Clean up related records (cascade cleanup)
    // These tables reference username but may not have FK CASCADE
    const cleanupTables = [
      { table: 'pyra_timesheets', column: 'username' },
      { table: 'pyra_leave_requests', column: 'username' },
      { table: 'pyra_leave_balances', column: 'username' },
      { table: 'pyra_leave_balances_v2', column: 'username' },
      { table: 'pyra_attendance', column: 'username' },
      { table: 'pyra_timesheet_periods', column: 'username' },
      { table: 'pyra_employee_payments', column: 'username' },
      { table: 'pyra_evaluations', column: 'employee_username' },
      { table: 'pyra_kpi_targets', column: 'username' },
      { table: 'pyra_task_assignees', column: 'username' },
      { table: 'pyra_task_comments', column: 'author_username' },
      { table: 'pyra_task_activity', column: 'username' },
      { table: 'pyra_announcement_reads', column: 'username' },
      { table: 'pyra_sessions', column: 'username' },
      { table: 'pyra_notifications', column: 'username' },
    ];

    for (const { table, column } of cleanupTables) {
      try {
        await serviceClient.from(table).delete().eq(column, username);
      } catch {
        // Table may not exist yet — safe to ignore
        console.warn(`Cleanup: skipped ${table} (may not exist)`);
      }
    }

    // Step 2: Delete from pyra_users
    const { error: deleteError } = await serviceClient
      .from('pyra_users')
      .delete()
      .eq('username', username);

    if (deleteError) {
      console.error('pyra_users delete error:', deleteError);
      return apiServerError('فشل في حذف المستخدم');
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

    return apiSuccess({ message: 'تم حذف المستخدم بنجاح' });
  } catch (err) {
    console.error('User DELETE error:', err);
    return apiServerError();
  }
}
