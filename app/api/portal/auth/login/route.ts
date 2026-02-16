import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createPortalSession, CLIENT_SAFE_FIELDS } from '@/lib/portal/auth';
import {
  apiSuccess,
  apiError,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { loginLimiter, getClientIp } from '@/lib/utils/rate-limit';
import bcrypt from 'bcryptjs';

/**
 * POST /api/portal/auth/login
 *
 * Client login using Supabase Auth. The auth_user_id field on pyra_clients
 * stores the Supabase Auth user UUID; passwords are managed by Supabase Auth.
 *
 * Body: { email: string, password: string, remember_me?: boolean }
 *
 * Flow:
 *  1. Validate input
 *  2. Look up the client in pyra_clients by email
 *  3. Verify the client is active
 *  4. Authenticate via Supabase Auth signInWithPassword
 *  5. Create a portal session (cookie-based)
 *  6. Update last_login_at on pyra_clients
 *  7. Return client data (no auth_user_id)
 */
export async function POST(request: NextRequest) {
  try {
    // ── Rate limiting (5 per IP per 15 min) ──────────
    const clientIp = getClientIp(request);
    const rateCheck = loginLimiter.check(clientIp);
    if (rateCheck.limited) {
      const retryMinutes = Math.ceil(rateCheck.retryAfterMs / 60000);
      return apiError(
        `تجاوزت الحد المسموح. حاول مرة أخرى بعد ${retryMinutes} دقيقة`,
        429
      );
    }

    const body = await request.json();
    const { email, password } = body;

    // ── Validation ───────────────────────────────────
    if (!email?.trim()) {
      return apiValidationError('البريد الإلكتروني مطلوب');
    }

    if (!password) {
      return apiValidationError('كلمة المرور مطلوبة');
    }

    const supabase = createServiceRoleClient();
    const normalizedEmail = email.trim().toLowerCase();

    // ── Look up the client (include auth fields for verification) ──
    const { data: client, error: clientError } = await supabase
      .from('pyra_clients')
      .select('id, name, email, phone, company, last_login_at, is_active, created_at, auth_user_id, password_hash, status')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (clientError) {
      console.error('Portal login — client lookup error:', clientError);
      return apiServerError();
    }

    if (!client) {
      return apiError('البريد الإلكتروني أو كلمة المرور غير صحيحة', 401);
    }

    // ── Check if active (support both is_active and status fields) ──
    const isActive = client.is_active !== null ? client.is_active : client.status === 'active';
    if (!isActive) {
      return apiError('تم تعطيل حسابك. يرجى التواصل مع فريق الدعم', 403);
    }

    // ── Authenticate: Supabase Auth or legacy password_hash ──
    let authenticated = false;

    if (client.auth_user_id) {
      // Method 1: Supabase Auth (new clients)
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (!authError) {
        authenticated = true;
        await supabase.auth.signOut();
      }
    }

    if (!authenticated && client.password_hash && client.password_hash !== 'supabase_auth_managed') {
      // Method 2: Legacy bcrypt hash (existing clients)
      const hashToCheck = client.password_hash.replace(/^\$2y\$/, '$2a$');
      authenticated = await bcrypt.compare(password, hashToCheck);
    }

    if (!authenticated) {
      console.warn('Portal login — auth failed for:', normalizedEmail);
      return apiError('البريد الإلكتروني أو كلمة المرور غير صحيحة', 401);
    }

    // ── Create portal session ────────────────────────
    await createPortalSession(client.id);

    // ── Update last_login_at ─────────────────────────
    await supabase
      .from('pyra_clients')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', client.id);

    // ── Return safe client data ──────────────────────
    const { data: safeClient } = await supabase
      .from('pyra_clients')
      .select(CLIENT_SAFE_FIELDS)
      .eq('id', client.id)
      .single();

    return apiSuccess({
      authenticated: true,
      client: safeClient,
    });
  } catch (err) {
    console.error('POST /api/portal/auth/login error:', err);
    return apiServerError();
  }
}
