/**
 * lib/hr/create-employee.ts
 *
 * Shared helper that replicates the exact user-creation steps from
 * `app/api/users` POST. Extracted so the Employee Onboarding flow (and any
 * future bulk-import) can create users without duplicating the rollback chain.
 *
 * Steps (in order, matching the /api/users route exactly):
 *   1. Existence check (pyra_users by username) → {ok:false} if taken
 *   2. auth.admin.createUser (Supabase GoTrue)
 *   3. pyra_users insert (password_hash via scrypt) → rollback on failure
 *   4. pyra_auth_mapping insert → rollback on failure
 *   5. Employee leave balances (v2 — single source of truth) when
 *      role === 'employee' || 'sales_agent'
 *
 * The activity-log step is intentionally OMITTED — callers own that.
 *
 * Server-only — uses a service-role SupabaseClient passed by the caller.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';
import { hashPassword } from '@/lib/utils/password';
import { resolveAuthUserId } from '@/lib/auth/auth-mapping';

/**
 * Minimal shape of next-intl's `t` function, as resolved by
 * `getTranslations('api')` in a server route. Optional here (t-injection
 * pattern, Phase 5.6 precedent — see `lib/hr/overview-helpers.ts`'s
 * `AlertTranslator`) so this lib stays callable from a caller that hasn't
 * resolved a translator (e.g. `app/api/users` POST, outside the i18n Phase 5
 * HR-API scope) — the literal Arabic fallback is byte-identical to the
 * catalog value, so behaviour is unchanged either way.
 *
 * A plain function-type alias (not `Awaited<ReturnType<typeof
 * getTranslations>>`) is used deliberately — next-intl's actual overloaded
 * generic type triggers `TS2589: Type instantiation is excessively deep and
 * possibly infinite` when threaded through this file's discriminated-union
 * return type.
 */
export type ApiT = (key: string, values?: Record<string, string | number>) => string;

// ─────────────────────────────────────────────────────────────────────────────
// Input / Output types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateEmployeeInput {
  username: string;
  password: string;
  role: string;
  display_name: string;
  phone?: string;
  job_title?: string;
  employment_type?: string;
  work_location?: string;
  payment_type?: string;
  salary?: number;
  hourly_rate?: number;
  hire_date?: string | null;
  date_of_birth?: string | null;
  department?: string | null;
  manager_username?: string | null;
  email?: string | null;
  /** Legacy permissions map (rarely used — prefer extra_permissions) */
  permissions?: Record<string, unknown>;
  /** Validated extra_permissions array (already whitelist-checked by caller) */
  extra_permissions?: string[];
  /** DB role_id FK */
  role_id?: string | null;
  // ── New in migration 025 ───────────────────────────────────────────────────
  /** ISO 4217 currency code for salary (default 'AED') */
  salary_currency?: string;
  /** Salary breakdown details (e.g. { basic, housing, transport }) */
  salary_breakdown?: Record<string, unknown> | null;
  // ── Previously orphaned columns (no write path until Phase 1) ─────────────
  national_id?: string | null;
  bank_details?: Record<string, unknown> | null;
  /** Commission percentage 0–100 */
  commission_rate?: number | null;
  work_schedule_id?: string | null;
}

export type CreateEmployeeResult =
  | { ok: true; user: { username: string; role: string; display_name: string } }
  | { ok: false; error: string; status: number };

// ─────────────────────────────────────────────────────────────────────────────
// Main helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new internal user, replicating the /api/users POST steps exactly.
 *
 * @param serviceClient  A Supabase client initialised with the service role key
 *                       (bypasses RLS — caller is responsible for auth gating).
 * @param input          User fields. `username` will be trimmed + lowercased.
 *
 * @returns `{ ok: true, user }` on success or `{ ok: false, error, status }` on
 *          any failure. Rollbacks are applied internally on partial failures so
 *          the caller only needs to surface the error.
 */
export async function createEmployeeUser(
  serviceClient: SupabaseClient,
  input: CreateEmployeeInput,
  t?: ApiT,
): Promise<CreateEmployeeResult> {
  const {
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
    extra_permissions,
    role_id,
    salary_currency,
    salary_breakdown,
    national_id,
    bank_details,
    commission_rate,
    work_schedule_id,
  } = input;

  // Normalise username exactly as the route does
  const cleanUsername = username.trim().toLowerCase();
  const authEmail = `${cleanUsername}@pyra.local`;

  // ── Step 1: Existence check ───────────────────────────────────────────────
  const { data: existing } = await serviceClient
    .from('pyra_users')
    .select('id')
    .eq('username', cleanUsername)
    .single();

  if (existing) {
    return { ok: false, error: t ? t('hr.userCreate.usernameTaken') : 'اسم المستخدم مستخدم بالفعل', status: 409 }; // i18n-exempt: byte-identical fallback for the sole caller that hasn't resolved a translator (app/api/users POST — outside i18n Phase 5 HR-API scope)
  }

  // ── Step 2: Create Supabase Auth user ────────────────────────────────────
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
    console.error('[createEmployeeUser] auth.admin.createUser error:', authError);
    return {
      ok: false,
      error: t ? t('hr.userCreate.authCreateFailed', { message: authError.message }) : `فشل في إنشاء حساب المصادقة: ${authError.message}`, // i18n-exempt: byte-identical fallback for the sole caller that hasn't resolved a translator (app/api/users POST — outside i18n Phase 5 HR-API scope)
      status: 500,
    };
  }

  // ── Step 3: Insert into pyra_users ────────────────────────────────────────
  const passwordHash = hashPassword(password);
  const { data: newUser, error: insertError } = await serviceClient
    .from('pyra_users')
    .insert({
      username: cleanUsername,
      password_hash: passwordHash,
      role,
      display_name: display_name.trim(),
      permissions: permissions || {},
      extra_permissions: extra_permissions ?? [],
      role_id: role_id || null,
      phone: phone ? String(phone).trim() : null,
      job_title: job_title ? String(job_title).trim() : null,
      employment_type: employment_type || 'full_time',
      work_location: work_location || 'onsite',
      payment_type: payment_type || 'monthly_salary',
      salary: salary || 0,
      hourly_rate: hourly_rate || 0,
      hire_date: hire_date || null,
      date_of_birth: date_of_birth || null,
      department: department || null,
      manager_username: manager_username || null,
      email: email || null,
      salary_currency: salary_currency || 'AED',
      salary_breakdown: salary_breakdown || null,
      national_id: national_id || null,
      bank_details: bank_details || null,
      commission_rate: commission_rate ?? null,
      work_schedule_id: work_schedule_id || null,
    })
    .select('id, username, role, display_name, permissions, extra_permissions, role_id, phone, job_title, status, created_at')
    .single();

  if (insertError) {
    console.error('[createEmployeeUser] pyra_users insert error:', insertError);
    // Rollback: delete the auth user we just created
    if (authData.user) {
      await serviceClient.auth.admin.deleteUser(authData.user.id);
    }
    return {
      ok: false,
      error: t ? t('hr.userCreate.userInsertFailed', { message: insertError.message }) : `فشل في إنشاء المستخدم: ${insertError.message}`, // i18n-exempt: byte-identical fallback for the sole caller that hasn't resolved a translator (app/api/users POST — outside i18n Phase 5 HR-API scope)
      status: 500,
    };
  }

  // ── Step 4: Insert auth mapping ───────────────────────────────────────────
  const { error: mappingError } = await serviceClient.from('pyra_auth_mapping').insert({
    id: generateId('am'),
    auth_user_id: authData.user.id,
    pyra_username: cleanUsername,
  });

  if (mappingError) {
    console.error('[createEmployeeUser] pyra_auth_mapping insert error:', mappingError);
    // Rollback: delete pyra_users row + auth user
    await serviceClient.from('pyra_users').delete().eq('username', cleanUsername);
    await serviceClient.auth.admin.deleteUser(authData.user.id);
    return {
      ok: false,
      error: t ? t('hr.userCreate.authMappingFailed', { message: mappingError.message }) : `فشل في إنشاء ربط المصادقة: ${mappingError.message}`, // i18n-exempt: byte-identical fallback for the sole caller that hasn't resolved a translator (app/api/users POST — outside i18n Phase 5 HR-API scope)
      status: 500,
    };
  }

  // ── Step 5: Initialize leave balances for employees (v2 — single source
  //            of truth; one record per active leave type) ────────────────
  if (role === 'employee' || role === 'sales_agent') {
    const currentYear = new Date().getFullYear();

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
  }

  // ── Return success ─────────────────────────────────────────────────────────
  return {
    ok: true,
    user: {
      username: newUser!.username,
      role: newUser!.role,
      display_name: newUser!.display_name,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-hire helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reactivate an existing (inactive/suspended) employee account.
 *
 * - Updates pyra_users: sets status='active' + ALL employment fields (mirrors
 *   createEmployeeUser's insert field list exactly, minus username/created_at).
 * - Resets the Supabase Auth password so the returning employee can log in.
 * - Seeds leave balances only when the employee has NONE for the current year
 *   (safe no-op for employees who already have balances from before).
 *
 * Returns the same result shape as createEmployeeUser.
 *
 * @param serviceClient  Service-role client (bypasses RLS; caller must auth-gate)
 * @param input          Same CreateEmployeeInput as createEmployeeUser. `username`
 *                       must match an existing pyra_users row.
 */
export async function reactivateEmployeeUser(
  serviceClient: SupabaseClient,
  input: CreateEmployeeInput,
  t?: ApiT,
): Promise<CreateEmployeeResult> {
  const {
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
    extra_permissions,
    role_id,
    salary_currency,
    salary_breakdown,
    national_id,
    bank_details,
    commission_rate,
    work_schedule_id,
  } = input;

  const cleanUsername = username.trim().toLowerCase();

  // ── Step 1: Update pyra_users row ─────────────────────────────────────────
  const passwordHash = hashPassword(password);

  const { data: updatedUser, error: updateError } = await serviceClient
    .from('pyra_users')
    .update({
      status: 'active',
      deactivated_at: null,
      password_hash: passwordHash,
      role,
      display_name: display_name.trim(),
      permissions: permissions || {},
      extra_permissions: extra_permissions ?? [],
      role_id: role_id || null,
      phone: phone ? String(phone).trim() : null,
      job_title: job_title ? String(job_title).trim() : null,
      employment_type: employment_type || 'full_time',
      work_location: work_location || 'onsite',
      payment_type: payment_type || 'monthly_salary',
      salary: salary || 0,
      hourly_rate: hourly_rate || 0,
      hire_date: hire_date || null,
      date_of_birth: date_of_birth || null,
      department: department || null,
      manager_username: manager_username || null,
      email: email || null,
      salary_currency: salary_currency || 'AED',
      salary_breakdown: salary_breakdown || null,
      national_id: national_id || null,
      bank_details: bank_details || null,
      commission_rate: commission_rate ?? null,
      work_schedule_id: work_schedule_id || null,
    })
    .eq('username', cleanUsername)
    .select('id, username, role, display_name')
    .single();

  if (updateError || !updatedUser) {
    console.error('[reactivateEmployeeUser] pyra_users update error:', updateError);
    return {
      ok: false,
      error: t
        ? t('hr.userCreate.reactivateFailed', { message: updateError?.message ?? 'unknown' })
        : `فشل في إعادة تفعيل المستخدم: ${updateError?.message ?? 'unknown'}`, // i18n-exempt: byte-identical fallback for the sole caller that hasn't resolved a translator (app/api/users POST — outside i18n Phase 5 HR-API scope)
      status: 500,
    };
  }

  // ── Step 2: Reset Supabase Auth password ──────────────────────────────────
  try {
    const authId = await resolveAuthUserId(serviceClient, cleanUsername);
    if (authId) {
      await serviceClient.auth.admin.updateUserById(authId, { password });
    }
  } catch (authErr) {
    // Non-fatal — user can request a password reset; don't abort reactivation
    console.error('[reactivateEmployeeUser] auth password reset error:', authErr);
  }

  // ── Step 3: Seed leave balances (v2) if the employee has none for this
  //            year — safe no-op for employees who already have balances ───
  if (role === 'employee' || role === 'sales_agent') {
    const currentYear = new Date().getFullYear();

    try {
      const { count: existingV2Count } = await serviceClient
        .from('pyra_leave_balances_v2')
        .select('id', { count: 'exact', head: true })
        .eq('username', cleanUsername)
        .eq('year', currentYear);

      if ((existingV2Count ?? 0) === 0) {
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
      }
    } catch {
      // Non-fatal — leave balances may already exist
    }
  }

  // ── Return success ─────────────────────────────────────────────────────────
  return {
    ok: true,
    user: {
      username: updatedUser.username,
      role: updatedUser.role,
      display_name: updatedUser.display_name,
    },
  };
}
