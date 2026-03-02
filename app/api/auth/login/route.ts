import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { adminLoginLimiter, checkRateLimit, getClientIp } from '@/lib/utils/rate-limit';
import { escapePostgrestValue } from '@/lib/utils/path';
import { hasPermission } from '@/lib/auth/rbac';

/** Record login attempt (fire-and-forget, never blocks the response) */
function recordLoginAttempt(
  username: string,
  ip: string,
  success: boolean
) {
  const svc = createServiceRoleClient();
  svc
    .from('pyra_login_attempts')
    .insert({
      username,
      ip_address: ip,
      success,
      attempted_at: new Date().toISOString(),
    })
    .then(({ error }) => {
      if (error) console.error('[login-attempt] insert error:', error.message);
    });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  try {
    // Rate limit: 5 attempts per IP per 15 minutes
    const limited = checkRateLimit(adminLoginLimiter, request);
    if (limited) return limited;

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'البريد الإلكتروني وكلمة المرور مطلوبان' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // ── Record failed attempt ──
      recordLoginAttempt(email, ip, false);
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    // ── Verify user exists in pyra_users with a valid role ──
    const username = data.user.user_metadata?.username || data.user.email;
    const { data: pyraUser, error: pyraErr } = await supabase
      .from('pyra_users')
      .select('role, role_id, username, display_name, pyra_roles!left(name, name_ar, permissions, color, icon)')
      .or(`username.eq.${escapePostgrestValue(username)},email.eq.${escapePostgrestValue(email)}`)
      .limit(1)
      .maybeSingle();

    if (pyraErr || !pyraUser) {
      await supabase.auth.signOut();
      // ── Record failed attempt (no pyra_users record) ──
      recordLoginAttempt(email, ip, false);
      return NextResponse.json(
        { error: 'هذا الحساب غير مسجل كمستخدم إداري' },
        { status: 403 }
      );
    }

    // Check role permissions - user must have dashboard.view permission
    const roleData = pyraUser.pyra_roles as unknown;
    const role = (Array.isArray(roleData) ? roleData[0] : roleData) as { name: string; name_ar: string; permissions: string[]; color: string; icon: string } | null;
    const rolePermissions: string[] = role?.permissions ?? [];

    // If no role assigned and legacy role is not admin/employee, deny access
    if (!pyraUser.role_id && !['admin', 'employee'].includes(pyraUser.role)) {
      await supabase.auth.signOut();
      recordLoginAttempt(pyraUser.username, ip, false);
      return NextResponse.json(
        { error: 'لا تملك صلاحية الدخول للوحة الإدارة' },
        { status: 403 }
      );
    }

    // If has role but no dashboard.view permission, deny access
    if (pyraUser.role_id && !hasPermission(rolePermissions, 'dashboard.view')) {
      await supabase.auth.signOut();
      recordLoginAttempt(pyraUser.username, ip, false);
      return NextResponse.json(
        { error: 'لا تملك صلاحية الدخول للوحة الإدارة' },
        { status: 403 }
      );
    }

    // ── Record successful login ──
    recordLoginAttempt(pyraUser.username, ip, true);

    return NextResponse.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: pyraUser.role,
        role_id: pyraUser.role_id,
        username: pyraUser.username,
        role_name_ar: role?.name_ar,
        rolePermissions,
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
