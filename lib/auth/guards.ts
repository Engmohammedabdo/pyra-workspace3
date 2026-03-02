import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { hasPermission, getDefaultPermissionsForLegacyRole } from '@/lib/auth/rbac';

export interface AuthSession {
  user: {
    id: string;
    email: string;
  };
  pyraUser: {
    id: number;
    username: string;
    role: string;
    role_id: string | null;
    display_name: string;
    permissions: Record<string, unknown>;
    rolePermissions: string[];
    role_name_ar: string;
    role_color: string;
    role_icon: string;
    created_at: string;
  };
}

async function loadUserWithRole(supabase: ReturnType<typeof import('@/lib/supabase/server').createServerSupabaseClient extends () => Promise<infer R> ? () => R : never>, username: string) {
  const { data: pyraUser } = await supabase
    .from('pyra_users')
    .select('*, pyra_roles!left(name, name_ar, permissions, color, icon)')
    .eq('username', username)
    .single();

  if (!pyraUser) return null;

  const role = pyraUser.pyra_roles;
  const rolePermissions: string[] = role?.permissions
    ?? getDefaultPermissionsForLegacyRole(pyraUser.role);

  return {
    id: pyraUser.id,
    username: pyraUser.username,
    role: pyraUser.role,
    role_id: pyraUser.role_id,
    display_name: pyraUser.display_name,
    permissions: pyraUser.permissions || {},
    rolePermissions,
    role_name_ar: role?.name_ar ?? (pyraUser.role === 'admin' ? 'مسؤول' : 'موظف'),
    role_color: role?.color ?? 'gray',
    role_icon: role?.icon ?? 'Shield',
    created_at: pyraUser.created_at,
  };
}

export async function requireAuth(): Promise<AuthSession> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  const pyraUser = await loadUserWithRole(
    supabase as any,
    user.user_metadata?.username || user.email!
  );

  if (!pyraUser) {
    redirect('/login');
  }

  return {
    user: { id: user.id, email: user.email! },
    pyraUser,
  };
}

/**
 * Require a specific permission to access a page.
 * Replaces requireAdmin() for granular access control.
 */
export async function requirePermission(permission: string): Promise<AuthSession> {
  const session = await requireAuth();
  if (!hasPermission(session.pyraUser.rolePermissions, permission)) {
    redirect('/dashboard');
  }
  return session;
}

/**
 * @deprecated Use requirePermission() instead
 */
export async function requireAdmin(): Promise<AuthSession> {
  const session = await requireAuth();
  if (!hasPermission(session.pyraUser.rolePermissions, '*') && session.pyraUser.role !== 'admin') {
    redirect('/dashboard');
  }
  return session;
}

export async function getOptionalAuth(): Promise<AuthSession | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return null;

    const pyraUser = await loadUserWithRole(
      supabase as any,
      user.user_metadata?.username || user.email!
    );

    if (!pyraUser) return null;

    return {
      user: { id: user.id, email: user.email! },
      pyraUser,
    };
  } catch {
    return null;
  }
}
