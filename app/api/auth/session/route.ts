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
      .select('id, username, role, display_name, permissions, created_at')
      .eq('username', user.user_metadata?.username || user.email)
      .single();

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
