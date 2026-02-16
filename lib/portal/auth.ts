import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
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

/**
 * Create a portal session for a client.
 * Inserts a row in pyra_sessions (storing a SHA-256 hash of the token)
 * and sets an httpOnly cookie with the raw token.
 *
 * Cookie format: `clientId:rawToken`
 */
export async function createPortalSession(clientId: string): Promise<string> {
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const cookieStore = await cookies();

  const supabase = createServiceRoleClient();
  await supabase.from('pyra_sessions').insert({
    id: generateId('sess'),
    username: clientId, // reuse username field for client_id
    token_hash: tokenHash,   // store HASH, not raw token
    expires_at: new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  });

  cookieStore.set(PORTAL_SESSION_COOKIE, `${clientId}:${rawToken}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    path: '/',
  });

  return rawToken;
}

/**
 * Read the current portal session from the cookie and validate it.
 * Hashes the raw token from the cookie and compares against the stored hash.
 * Returns the PyraClient (without auth_user_id) if session is valid, null otherwise.
 */
export async function getPortalSession(): Promise<PyraClient | null> {
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

  // Verify session exists (by hash) and is not expired
  const { data: session } = await supabase
    .from('pyra_sessions')
    .select('id, username, token_hash, expires_at')
    .eq('username', clientId)
    .eq('token_hash', tokenHash)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!session) return null;

  // Get client (active only)
  const { data: client } = await supabase
    .from('pyra_clients')
    .select(CLIENT_SAFE_FIELDS)
    .eq('id', clientId)
    .eq('is_active', true)
    .single();

  return (client as PyraClient | null);
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
      const clientId = sessionCookie.slice(0, separatorIdx);
      const rawToken = sessionCookie.slice(separatorIdx + 1);
      if (clientId && rawToken) {
        const tokenHash = hashToken(rawToken);
        const supabase = createServiceRoleClient();
        await supabase
          .from('pyra_sessions')
          .delete()
          .eq('username', clientId)
          .eq('token_hash', tokenHash);
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
    .eq('username', clientId);
}
