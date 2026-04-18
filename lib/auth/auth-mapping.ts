import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';

/**
 * Resolve a pyra username to its Supabase Auth user ID.
 *
 * Lookup order:
 *   1. pyra_auth_mapping (fast path)
 *   2. Fallback: auth.admin.listUsers() matched against `{username}@pyra.local`.
 *      If found, the missing mapping row is auto-created so subsequent calls
 *      hit the fast path. This heals legacy users created before the mapping
 *      logic existed.
 *
 * Returns null if no auth user can be resolved.
 *
 * Caller MUST pass a service-role client — the fallback uses auth.admin and
 * writes to pyra_auth_mapping (admin-only).
 */
export async function resolveAuthUserId(
  serviceClient: SupabaseClient,
  username: string
): Promise<string | null> {
  const { data: mapping } = await serviceClient
    .from('pyra_auth_mapping')
    .select('auth_user_id')
    .eq('pyra_username', username)
    .maybeSingle();

  if (mapping?.auth_user_id) {
    return mapping.auth_user_id as string;
  }

  const expectedEmail = `${username}@pyra.local`;
  const { data: list, error } = await serviceClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error || !list?.users?.length) return null;

  const authUser = list.users.find((u) => u.email === expectedEmail);
  if (!authUser) return null;

  await serviceClient.from('pyra_auth_mapping').insert({
    id: generateId('am'),
    auth_user_id: authUser.id,
    pyra_username: username,
  });

  return authUser.id;
}
