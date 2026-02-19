import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { randomBytes, createHash } from 'crypto';
import type { PyraClient } from '@/types/database';

const PORTAL_SESSION_COOKIE = 'pyra_portal_session';
const SESSION_EXPIRY_DAYS = 30;

/**
 * Fields to select from pyra_clients -- everything EXCEPT auth_user_id
 */
export const CLIENT_SAFE_FIELDS = 'id, name, email, phone, company, last_login_at, is_active, created_at';

/**
 * Generate a cryptographically secure session token (48 bytes = 64 chars base64url).
 */
function generateSecureToken(): string {
  return randomBytes(48).toString('base64url');
}

/**
 * Hash a token using SHA-256 for storage.
 * Only the hash is stored in the database; the raw token lives in the cookie.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/* ---------------------------------------------------------------
   Actual pyra_sessions table columns:
   id, username, ip_address, user_agent, last_activity, created_at

   Mapping:
   - id           → SHA-256 hash of the token (64 hex chars)
   - username      → client ID (e.g. "cl_abc123")
   - ip_address    → "portal" marker
   - user_agent    → "portal_session" marker
   - last_activity → session creation timestamp (used for expiry check)
   - created_at    → auto
--------------------------------------------------------------- */

/**
 * Create a portal session for a client.
 * Inserts a row in pyra_sessions and sets an httpOnly cookie.
 * Cookie format: `clientId:rawToken`
 */
export async function createPortalSession(clientId: string): Promise<string> {
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const cookieStore = await cookies();

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from('pyra_sessions').insert({
    id: tokenHash,
    username: clientId,
    ip_address: 'portal',
    user_agent: 'portal_session',
    last_activity: new Date().toISOString(),
  });

  if (error) {
    console.error('Portal session insert error:', error.message);
  }

  cookieStore.set(PORTAL_SESSION_COOKIE, `${clientId}:${rawToken}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    path: '/',
  });

  return rawToken;
}

/**
 * Read the current portal session from the cookie and validate it.
 * Hashes the raw token from the cookie and looks up the session by id (hash).
 * Returns the PyraClient (without auth_user_id) if session is valid, null otherwise.
 */
export async function getPortalSession(): Promise<PyraClient | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    if (!sessionCookie) return null;

    const separatorIdx = sessionCookie.indexOf(':');
    if (separatorIdx === -1) return null;

    const clientId = sessionCookie.slice(0, separatorIdx);
    const rawToken = sessionCookie.slice(separatorIdx + 1);
    if (!clientId || !rawToken) return null;

    const tokenHash = hashToken(rawToken);
    const supabase = createServiceRoleClient();

    // Verify session exists by id (token hash)
    const { data: session } = await supabase
      .from('pyra_sessions')
      .select('id, username, last_activity')
      .eq('id', tokenHash)
      .eq('username', clientId)
      .single();

    if (!session) return null;

    // Check expiry: last_activity + 30 days > now
    const sessionTime = new Date(session.last_activity).getTime();
    const expiryMs = SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() - sessionTime > expiryMs) {
      // Session expired — delete it
      await supabase.from('pyra_sessions').delete().eq('id', tokenHash);
      return null;
    }

    // Get client (active only)
    const { data: client } = await supabase
      .from('pyra_clients')
      .select(CLIENT_SAFE_FIELDS)
      .eq('id', clientId)
      .eq('is_active', true)
      .single();

    return (client as PyraClient | null);
  } catch {
    return null;
  }
}

/**
 * Destroy the current portal session.
 * Hashes the raw token, deletes the matching session record, and clears the cookie.
 */
export async function destroyPortalSession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;

  if (sessionCookie) {
    const separatorIdx = sessionCookie.indexOf(':');
    if (separatorIdx !== -1) {
      const rawToken = sessionCookie.slice(separatorIdx + 1);
      if (rawToken) {
        const tokenHash = hashToken(rawToken);
        const supabase = createServiceRoleClient();
        await supabase
          .from('pyra_sessions')
          .delete()
          .eq('id', tokenHash);
      }
    }
  }

  cookieStore.delete(PORTAL_SESSION_COOKIE);
}

/**
 * Destroy ALL portal sessions for a given client.
 * Used on password change to invalidate every session.
 */
export async function destroyAllClientSessions(clientId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from('pyra_sessions')
    .delete()
    .eq('username', clientId)
    .eq('user_agent', 'portal_session');
}
