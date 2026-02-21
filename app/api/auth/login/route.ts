import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { adminLoginLimiter, checkRateLimit, getClientIp } from '@/lib/utils/rate-limit';

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

    // ── Verify user has admin/employee role in pyra_users ──
    const username = data.user.user_metadata?.username || data.user.email;
    const { data: pyraUser, error: pyraErr } = await supabase
      .from('pyra_users')
      .select('role, username, display_name')
      .or(`username.eq.${username},email.eq.${email}`)
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

    if (!['admin', 'employee'].includes(pyraUser.role)) {
      await supabase.auth.signOut();
      // ── Record failed attempt (wrong role) ──
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
        username: pyraUser.username,
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
