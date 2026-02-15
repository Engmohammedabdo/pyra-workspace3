import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createPortalSession } from '@/lib/portal/auth';
import {
  apiSuccess,
  apiError,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { loginLimiter, getClientIp } from '@/lib/utils/rate-limit';

/**
 * Fields to return for the logged-in client -- everything EXCEPT password_hash
 */
const CLIENT_SAFE_FIELDS = 'id, name, email, phone, company, last_login_at, is_active, created_at';

/**
 * POST /api/portal/auth/login
 *
 * Client login using Supabase Auth (since pyra_clients.password_hash stores
 * the Supabase Auth user ID; passwords are managed by Supabase Auth).
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
 *  7. Return client data (no password_hash)
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

    // ── Look up the client ───────────────────────────
    const { data: client, error: clientError } = await supabase
      .from('pyra_clients')
      .select('id, name, email, phone, company, password_hash, last_login_at, is_active, created_at')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (clientError) {
      console.error('Portal login — client lookup error:', clientError);
      return apiServerError();
    }

    if (!client) {
      return apiError('البريد الإلكتروني أو كلمة المرور غير صحيحة', 401);
    }

    // ── Check if active ──────────────────────────────
    if (!client.is_active) {
      return apiError('تم تعطيل حسابك. يرجى التواصل مع فريق الدعم', 403);
    }

    // ── Authenticate via Supabase Auth ────────────────
    // password_hash stores the Supabase Auth user ID; the actual password
    // is stored in Supabase Auth. We verify using signInWithPassword.
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (authError) {
      // Log failed attempt
      console.warn('Portal login — auth failed for:', normalizedEmail, authError.message);
      return apiError('البريد الإلكتروني أو كلمة المرور غير صحيحة', 401);
    }

    // Sign out immediately — we don't want to keep a Supabase Auth session
    // for the portal; we use our own cookie-based session instead.
    await supabase.auth.signOut();

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
