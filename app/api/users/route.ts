import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';
import { hashPassword } from '@/lib/utils/password';

// =============================================================
// GET /api/users
// List all users (admin only). Supports ?search= and ?role= filters.
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('users.view');
    if (isApiError(auth)) return auth;

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') || '';

    const supabase = await createServerSupabaseClient();

    let query = supabase
      .from('pyra_users')
      .select('id, username, role, display_name, permissions, role_id, phone, job_title, status, created_at, manager_username, employment_type, work_location, payment_type, salary, hourly_rate, hire_date, department, pyra_roles!left(name, name_ar, color, icon)');

    // Apply role filter
    if (role === 'admin' || role === 'employee') {
      query = query.eq('role', role);
    }

    // Apply search filter (search in username and display_name)
    // Use escapePostgrestValue to wrap the LIKE pattern and prevent filter injection
    if (search.trim()) {
      const escaped = escapeLike(search.trim());
      const safeVal = escapePostgrestValue(`%${escaped}%`);
      query = query.or(
        `username.ilike.${safeVal},display_name.ilike.${safeVal}`
      );
    }

    // Order by creation date descending, with limit to prevent unbounded results
    query = query.order('created_at', { ascending: false }).limit(200);

    const { data: users, error } = await query;

    if (error) {
      console.error('Users list error:', error);
      return apiServerError('فشل في جلب قائمة المستخدمين');
    }

    return apiSuccess(users || [], { total: (users || []).length });
  } catch (err) {
    console.error('Users GET error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/users
// Create a new user (admin only).
// Body: { username, password, role, display_name, permissions }
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('users.manage');
    if (isApiError(auth)) return auth;

    const body = await request.json();
    const {
      username, password, role, display_name, permissions, role_id, phone, job_title,
      employment_type, work_location, payment_type, salary, hourly_rate, hire_date, department, manager_username, email,
    } = body;

    // --- Validation ---
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return apiValidationError('اسم المستخدم مطلوب (3 أحرف على الأقل)');
    }

    if (!password || typeof password !== 'string' || password.length < 12) {
      return apiValidationError('كلمة المرور مطلوبة (12 حرف على الأقل)');
    }

    if (!role || (role !== 'admin' && role !== 'employee')) {
      return apiValidationError('الدور يجب أن يكون admin أو employee');
    }

    if (!display_name || typeof display_name !== 'string' || display_name.trim().length === 0) {
      return apiValidationError('اسم العرض مطلوب');
    }

    if (role_id !== undefined && role_id !== null && typeof role_id !== 'string') {
      return apiValidationError('معرّف الدور الوظيفي غير صالح');
    }

    const cleanUsername = username.trim().toLowerCase();
    const authEmail = `${cleanUsername}@pyra.local`;

    // Use service-role client for admin write operations
    const serviceClient = createServiceRoleClient();

    // Check if username already exists
    const { data: existing } = await serviceClient
      .from('pyra_users')
      .select('id')
      .eq('username', cleanUsername)
      .single();

    if (existing) {
      return apiValidationError('اسم المستخدم مستخدم بالفعل');
    }

    // Step 1: Create Supabase Auth user
    const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: {
        username: cleanUsername,
        display_name: display_name.trim(),
        role,
      },
    });

    if (authError) {
      console.error('Supabase auth create error:', authError);
      return apiServerError(`فشل في إنشاء حساب المصادقة: ${authError.message}`);
    }

    // Step 2: Insert into pyra_users (password_hash via scrypt)
    const passwordHash = hashPassword(password);
    const { data: newUser, error: insertError } = await serviceClient
      .from('pyra_users')
      .insert({
        username: cleanUsername,
        password_hash: passwordHash,
        role,
        display_name: display_name.trim(),
        permissions: permissions || {},
        role_id: role_id || null,
        phone: phone ? String(phone).trim() : null,
        job_title: job_title ? String(job_title).trim() : null,
        employment_type: employment_type || 'full_time',
        work_location: work_location || 'onsite',
        payment_type: payment_type || 'monthly_salary',
        salary: salary || 0,
        hourly_rate: hourly_rate || 0,
        hire_date: hire_date || null,
        department: department || null,
        manager_username: manager_username || null,
        email: email || null,
      })
      .select('id, username, role, display_name, permissions, role_id, phone, job_title, status, created_at')
      .single();

    if (insertError) {
      console.error('pyra_users insert error:', insertError);
      // Rollback: delete the auth user we just created
      if (authData.user) {
        await serviceClient.auth.admin.deleteUser(authData.user.id);
      }
      return apiServerError(`فشل في إنشاء المستخدم: ${insertError.message}`);
    }

    // Step 3: Insert auth mapping
    await serviceClient.from('pyra_auth_mapping').insert({
      id: generateId('am'),
      auth_user_id: authData.user.id,
      pyra_username: cleanUsername,
    });

    // Step 3.5: Initialize leave balances for employees
    if (role === 'employee') {
      const currentYear = new Date().getFullYear();

      // v1 balance
      await serviceClient.from('pyra_leave_balances').insert({
        username: cleanUsername,
        year: currentYear,
        annual_total: 30,
        annual_used: 0,
        sick_total: 15,
        sick_used: 0,
        personal_total: 5,
        personal_used: 0,
      });

      // v2 balances — create one record per active leave type
      try {
        const { data: activeLeaveTypes } = await serviceClient
          .from('pyra_leave_types')
          .select('id, default_days')
          .eq('is_active', true);

        if (activeLeaveTypes && activeLeaveTypes.length > 0) {
          const v2Records = activeLeaveTypes.map((lt) => ({
            id: generateId('lb'),
            username: cleanUsername,
            year: currentYear,
            leave_type_id: lt.id,
            total_days: lt.default_days,
            used_days: 0,
          }));

          await serviceClient.from('pyra_leave_balances_v2').insert(v2Records);
        }
      } catch {
        // v2 tables may not exist yet — skip silently
      }
    }

    // Step 4: Log the activity
    await serviceClient.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'user_created',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: cleanUsername,
      details: {
        created_username: cleanUsername,
        created_display_name: display_name.trim(),
        created_role: role,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(newUser, undefined, 201);
  } catch (err) {
    console.error('Users POST error:', err);
    return apiServerError();
  }
}
