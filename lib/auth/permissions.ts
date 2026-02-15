import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function checkPathAccess(
  username: string,
  path: string,
  action: string = 'read'
): Promise<boolean> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc('check_path_access', {
      p_username: username,
      p_path: path,
      p_action: action,
    });
    if (error) {
      console.error('Permission check error:', error);
      return false;
    }
    return data === true;
  } catch {
    return false;
  }
}

export function isAdmin(role: string): boolean {
  return role === 'admin';
}
