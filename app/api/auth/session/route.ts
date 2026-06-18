import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    const { data: pyraUser } = await supabase
      .from('pyra_users')
      .select('id, username, role, display_name, permissions, created_at, status')
      .eq('username', user.user_metadata?.username || user.email)
      .single();

    // Deactivation gate (Phase 1 remediation — audit Gap #1). A non-active
    // account must not read as authenticated, even with a valid Supabase
    // session. Fails closed — any status !== 'active' (incl. NULL) → 401.
    if (!pyraUser || pyraUser.status !== 'active') {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
      },
      profile: pyraUser,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
