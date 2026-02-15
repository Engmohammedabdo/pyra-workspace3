import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import type { PyraClient } from '@/types/database';

const PORTAL_SESSION_COOKIE = 'pyra_portal_session';
const SESSION_EXPIRY_DAYS = 30;

/**
 * Fields to select from pyra_clients -- everything EXCEPT password_hash
 */
export const CLIENT_SAFE_FIELDS = 'id, name, email, phone, company, last_login_at, is_active, created_at';

/**
 * Create a portal session for a client.
 * Inserts a row in pyra_sessions and sets a signed cookie.
 *
 * The cookie value format is `clientId:token`.
 */
export async function createPortalSession(clientId: string): Promise<string> {
  const token = generateId('ps'); // ps = portal session
  const cookieStore = await cookies();

  const supabase = createServiceRoleClient();
  await supabase.from('pyra_sessions').insert({
    id: generateId('sess'),
    username: clientId, // reuse username field for client_id
    token,
    ip_address: 'server',
    user_agent: 'portal',
    last_activity: new Date().toISOString(),
    expires_at: new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  });

  cookieStore.set(PORTAL_SESSION_COOKIE, `${clientId}:${token}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    path: '/',
  });

  return token;
}

/**
 * Read the current portal session from the cookie and validate it.
 * Returns the PyraClient (without password_hash) if session is valid, null otherwise.
 */
export async function getPortalSession(): Promise<PyraClient | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!sessionCookie) return null;

  const [clientId, token] = sessionCookie.split(':');
  if (!clientId || !token) return null;

  const supabase = createServiceRoleClient();

  // Verify session exists and is not expired
  const { data: session } = await supabase
    .from('pyra_sessions')
    .select('id, username, token, expires_at, last_activity')
    .eq('username', clientId)
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!session) return null;

  // Update last_activity timestamp
  await supabase
    .from('pyra_sessions')
    .update({ last_activity: new Date().toISOString() })
    .eq('id', session.id);

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
 * Deletes the session record from pyra_sessions and clears the cookie.
 */
export async function destroyPortalSession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;

  if (sessionCookie) {
    const [clientId, token] = sessionCookie.split(':');
    if (clientId && token) {
      const supabase = createServiceRoleClient();
      await supabase
        .from('pyra_sessions')
        .delete()
        .eq('username', clientId)
        .eq('token', token);
    }
  }

  cookieStore.delete(PORTAL_SESSION_COOKIE);
}
