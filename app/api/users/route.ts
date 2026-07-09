import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { PASSWORD_MIN_LENGTH, EMPLOYMENT_TYPES, WORK_LOCATIONS, PAYMENT_TYPES, SALARY_CURRENCIES } from '@/lib/constants/auth';
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';
import { validateExtraPermissions, type ApiTranslator } from '@/lib/auth/rbac';
import { createEmployeeUser } from '@/lib/hr/create-employee';

// =============================================================
// GET /api/users
// List all users (admin only). Supports ?search= and ?role= filters.
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('users.view');
    if (isApiError(auth)) return auth;
    const t = await getTranslations('api');

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') || '';

    const supabase = await createServerSupabaseClient();

    let query = supabase
      .from('pyra_users')
      .select('id, username, role, display_name, permissions, extra_permissions, role_id, phone, job_title, status, created_at, manager_username, employment_type, work_location, payment_type, salary, salary_currency, hourly_rate, hire_date, date_of_birth, department, national_id, commission_rate, onboarding_id, work_schedule_id, pyra_roles!left(name, name_ar, color, icon)');

    // Apply role filter
    if (['admin', 'employee', 'sales_agent'].includes(role)) {
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
      return apiServerError(t('users.listFailed'));
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
    const t = await getTranslations('api');

    const body = await request.json();
    const {
      username, password, role, display_name, permissions, extra_permissions, role_id, phone, job_title,
      employment_type, work_location, payment_type, salary, hourly_rate, hire_date, date_of_birth, department, manager_username, email,
      salary_currency, salary_breakdown, national_id, bank_details, commission_rate, work_schedule_id,
    } = body;

    // --- Validation ---
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return apiValidationError(t('users.usernameMinLength'));
    }

    if (!password || typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
      return apiValidationError(t('users.passwordMinRequired', { min: PASSWORD_MIN_LENGTH }));
    }

    if (!role || !['admin', 'employee', 'sales_agent'].includes(role)) {
      return apiValidationError(t('users.roleInvalid'));
    }

    if (!display_name || typeof display_name !== 'string' || display_name.trim().length === 0) {
      return apiValidationError(t('users.displayNameRequired'));
    }

    if (role_id !== undefined && role_id !== null && typeof role_id !== 'string') {
      return apiValidationError(t('users.roleIdInvalid'));
    }

    // --- New / previously-orphan field validation ---
    if (salary_currency !== undefined && salary_currency !== null &&
        !(SALARY_CURRENCIES as readonly string[]).includes(salary_currency)) {
      return apiValidationError(t('users.salaryCurrencyInvalid', { allowed: SALARY_CURRENCIES.join('، ') })); // i18n-exempt: pre-existing Arabic-comma list separator (legacy, unchanged)
    }
    if (commission_rate !== undefined && commission_rate !== null) {
      if (typeof commission_rate !== 'number' || Number.isNaN(commission_rate) || commission_rate < 0 || commission_rate > 100) {
        return apiValidationError(t('users.commissionRateInvalid'));
      }
    }
    if (national_id !== undefined && national_id !== null && typeof national_id !== 'string') {
      return apiValidationError(t('users.nationalIdInvalid'));
    }
    if (work_schedule_id !== undefined && work_schedule_id !== null && typeof work_schedule_id !== 'string') {
      return apiValidationError(t('users.workScheduleIdInvalid'));
    }
    if (bank_details !== undefined && bank_details !== null &&
        (typeof bank_details !== 'object' || Array.isArray(bank_details))) {
      return apiValidationError(t('users.bankDetailsInvalid'));
    }
    if (salary_breakdown !== undefined && salary_breakdown !== null &&
        (typeof salary_breakdown !== 'object' || Array.isArray(salary_breakdown))) {
      return apiValidationError(t('users.salaryBreakdownInvalid'));
    }

    // Validate extra_permissions — Phase D Commit 1 (audit P2 #1):
    // exact-match whitelist against PERMISSIONS catalog; reject wildcards.
    // Closes admin foot-gun where phished admin / typo could grant `["*"]`
    // and silently promote a user to super-admin.
    // next-intl's translator narrows `key` to known message keys, which
    // doesn't structurally satisfy validateExtraPermissions' looser
    // ApiTranslator param type (contravariance) — safe explicit cast.
    const extraPermsResult = validateExtraPermissions(extra_permissions, t as ApiTranslator);
    if (!extraPermsResult.ok) {
      return apiValidationError(extraPermsResult.error);
    }

    const cleanUsername = username.trim().toLowerCase();

    // Use service-role client for admin write operations
    const serviceClient = createServiceRoleClient();

    // Steps 1–5: existence check, auth user, pyra_users insert, auth mapping,
    // leave balances (with rollbacks) — delegated to the shared helper.
    const result = await createEmployeeUser(serviceClient, {
      username,
      password,
      role,
      display_name,
      phone,
      job_title,
      employment_type,
      work_location,
      payment_type,
      salary,
      hourly_rate,
      hire_date,
      date_of_birth,
      department,
      manager_username,
      email,
      permissions,
      extra_permissions: extraPermsResult.value,
      role_id,
      salary_currency,
      salary_breakdown,
      national_id,
      bank_details,
      commission_rate,
      work_schedule_id,
    });

    if (!result.ok) {
      // Map helper status codes to validation vs server error responses
      if (result.status === 409) {
        return apiValidationError(result.error);
      }
      return apiServerError(result.error);
    }

    // Step 4: Log the activity (route owns this — not in the shared helper)
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

    // Re-fetch the newly created user row so the 201 response shape is identical
    // to before the refactor (includes id, status, created_at, etc.)
    const { data: newUser } = await serviceClient
      .from('pyra_users')
      .select('id, username, role, display_name, permissions, extra_permissions, role_id, phone, job_title, status, created_at')
      .eq('username', cleanUsername)
      .single();

    return apiSuccess(newUser, undefined, 201);
  } catch (err) {
    console.error('Users POST error:', err);
    return apiServerError();
  }
}
