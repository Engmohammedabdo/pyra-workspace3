import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { PyraUser } from '@/types/database';

/**
 * API-level auth check: returns user + pyraUser, or null if not authenticated.
 * Unlike guards.ts (which uses redirect()), this returns null for API use.
 */
export async function getApiAuth(): Promise<{
  userId: string;
  email: string;
  pyraUser: PyraUser;
} | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) return null;

    const { data: pyraUser } = await supabase
      .from('pyra_users')
      .select('id, username, auth_user_id, role, display_name, permissions, created_at')
      .eq('username', user.user_metadata?.username || user.email)
      .single();

    if (!pyraUser) return null;

    return {
      userId: user.id,
      email: user.email!,
      pyraUser: pyraUser as PyraUser,
    };
  } catch {
    return null;
  }
}

/**
 * Check if the current user is an admin
 */
export async function getApiAdmin() {
  const auth = await getApiAuth();
  if (!auth) return null;
  if (auth.pyraUser.role !== 'admin') return null;
  return auth;
}
