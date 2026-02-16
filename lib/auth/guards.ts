import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface AuthSession {
  user: {
    id: string;
    email: string;
  };
  pyraUser: {
    id: number;
    username: string;
    role: string;
    display_name: string;
    permissions: Record<string, unknown>;
    created_at: string;
  };
}

export async function requireAuth(): Promise<AuthSession> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  const { data: pyraUser } = await supabase
    .from('pyra_users')
    .select('*')
    .eq('username', user.user_metadata?.username || user.email)
    .single();

  if (!pyraUser) {
    redirect('/login');
  }

  return {
    user: { id: user.id, email: user.email! },
    pyraUser: {
      id: pyraUser.id,
      username: pyraUser.username,
      role: pyraUser.role,
      display_name: pyraUser.display_name,
      permissions: pyraUser.permissions || {},
      created_at: pyraUser.created_at,
    },
  };
}

export async function requireAdmin(): Promise<AuthSession> {
  const session = await requireAuth();
  if (session.pyraUser.role !== 'admin') {
    redirect('/dashboard');
  }
  return session;
}

export async function getOptionalAuth(): Promise<AuthSession | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: pyraUser } = await supabase
      .from('pyra_users')
      .select('*')
      .eq('username', user.user_metadata?.username || user.email)
      .single();

    if (!pyraUser) return null;

    return {
      user: { id: user.id, email: user.email! },
      pyraUser: {
        id: pyraUser.id,
        username: pyraUser.username,
        role: pyraUser.role,
        display_name: pyraUser.display_name,
        permissions: pyraUser.permissions || {},
        created_at: pyraUser.created_at,
      },
    };
  } catch {
    return null;
  }
}
