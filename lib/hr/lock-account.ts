import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAuthUserId } from '@/lib/auth/auth-mapping';
import { logError } from '@/lib/observability/log-error';

// ~100 years. GoTrue accepts a Go duration string.
const BAN_DURATION = '876000h';

/**
 * Ban the GoTrue identity so the user can neither log in NOR refresh a token.
 * Ban-only by necessity: session/refresh-token revocation is unreachable from
 * app code (the auth schema is not exposed to PostgREST; service_role holds no
 * grants on auth.*; admin.signOut needs the user's OWN jwt). The residual
 * window is one access-token TTL (measured 3600s). Never throws — returns the
 * outcome so callers can flip status regardless. MUST be given a service-role
 * client (resolveAuthUserId's fallback uses auth.admin).
 */
export async function lockAccount(
  serviceClient: SupabaseClient,
  username: string,
): Promise<{ locked: boolean; error?: string }> {
  try {
    const authId = await resolveAuthUserId(serviceClient, username);
    if (!authId) return { locked: false, error: 'no_auth_mapping' };
    const { error } = await serviceClient.auth.admin.updateUserById(authId, {
      ban_duration: BAN_DURATION,
    });
    if (error) {
      logError({ error, metadata: { fn: 'lockAccount', username } });
      return { locked: false, error: error.message };
    }
    return { locked: true };
  } catch (err) {
    logError({ error: err, metadata: { fn: 'lockAccount', username } });
    return { locked: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Lift the ban (reactivation / re-hire). Idempotent — unbanning an unbanned user is a no-op. */
export async function unlockAccount(
  serviceClient: SupabaseClient,
  username: string,
): Promise<{ unlocked: boolean; error?: string }> {
  try {
    const authId = await resolveAuthUserId(serviceClient, username);
    if (!authId) return { unlocked: false, error: 'no_auth_mapping' };
    const { error } = await serviceClient.auth.admin.updateUserById(authId, {
      ban_duration: 'none',
    });
    if (error) {
      logError({ error, metadata: { fn: 'unlockAccount', username } });
      return { unlocked: false, error: error.message };
    }
    return { unlocked: true };
  } catch (err) {
    logError({ error: err, metadata: { fn: 'unlockAccount', username } });
    return { unlocked: false, error: err instanceof Error ? err.message : String(err) };
  }
}
