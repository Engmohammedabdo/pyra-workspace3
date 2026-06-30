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
 *   5. Employee leave balances (v1 + v2) when role === 'employee'
 *
 * The activity-log step is intentionally OMITTED — callers own that.
 *
 * Server-only — uses a service-role SupabaseClient passed by the caller.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';
import { hashPassword } from '@/lib/utils/password';

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
    return { ok: false, error: 'اسم المستخدم مستخدم بالفعل', status: 409 };
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
      error: `فشل في إنشاء حساب المصادقة: ${authError.message}`,
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
      error: `فشل في إنشاء المستخدم: ${insertError.message}`,
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
      error: `فشل في إنشاء ربط المصادقة: ${mappingError.message}`,
      status: 500,
    };
  }

  // ── Step 5: Initialize leave balances for employees ───────────────────────
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
