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
import { generateId } from '@/lib/utils/id';

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
      .select('id, username, role, display_name, permissions, role_id, phone, job_title, avatar_url, status, created_at, manager_username, employment_type, work_location, payment_type, salary, hourly_rate, hire_date, department, pyra_roles!left(name, name_ar, color, icon)')
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
      .select('id, username, role, display_name, permissions, role_id, phone, job_title, status, created_at, manager_username, employment_type, work_location, payment_type, salary, hourly_rate, hire_date, department')
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
      if (body.role !== 'admin' && body.role !== 'employee') {
        return apiValidationError('الدور يجب أن يكون admin أو employee');
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
      const validTypes = ['full_time', 'part_time', 'contract', 'freelance', 'intern'];
      if (body.employment_type !== null && !validTypes.includes(body.employment_type)) {
        return apiValidationError('نوع التوظيف غير صالح');
      }
      updateData.employment_type = body.employment_type;
    }

    if (body.work_location !== undefined) {
      const validLocations = ['remote', 'onsite', 'hybrid'];
      if (body.work_location !== null && !validLocations.includes(body.work_location)) {
        return apiValidationError('موقع العمل غير صالح');
      }
      updateData.work_location = body.work_location;
    }

    if (body.payment_type !== undefined) {
      const validPaymentTypes = ['monthly_salary', 'hourly', 'per_task', 'commission'];
      if (body.payment_type !== null && !validPaymentTypes.includes(body.payment_type)) {
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

    if (Object.keys(updateData).length === 0) {
      return apiValidationError('لا توجد بيانات للتحديث');
    }

    // Perform the update
    const { data: updatedUser, error: updateError } = await supabase
      .from('pyra_users')
      .update(updateData)
      .eq('username', username)
      .select('id, username, role, display_name, permissions, role_id, phone, job_title, status, created_at, manager_username, employment_type, work_location, payment_type, salary, hourly_rate, hire_date, department')
      .single();

    if (updateError) {
      console.error('User update error:', updateError);
      return apiServerError('فشل في تحديث المستخدم');
    }

    // Update Supabase Auth user metadata if display_name or role changed
    if (updateData.display_name || updateData.role) {
      const { data: mapping } = await supabase
        .from('pyra_auth_mapping')
        .select('auth_user_id')
        .eq('pyra_username', username)
        .single();

      if (mapping) {
        const serviceClient = createServiceRoleClient();
        await serviceClient.auth.admin.updateUserById(mapping.auth_user_id, {
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
    const { data: mapping } = await supabase
      .from('pyra_auth_mapping')
      .select('auth_user_id')
      .eq('pyra_username', username)
      .single();

    if (mapping) {
      await serviceClient.auth.admin.deleteUser(mapping.auth_user_id);

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
