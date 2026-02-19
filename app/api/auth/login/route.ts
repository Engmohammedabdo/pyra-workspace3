import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { adminLoginLimiter, checkRateLimit } from '@/lib/utils/rate-limit';

export async function POST(request: NextRequest) {
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
      // Sign out immediately — this user has no admin/employee record
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: 'هذا الحساب غير مسجل كمستخدم إداري' },
        { status: 403 }
      );
    }

    if (!['admin', 'employee'].includes(pyraUser.role)) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: 'لا تملك صلاحية الدخول للوحة الإدارة' },
        { status: 403 }
      );
    }

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
