import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { createHash } from 'crypto';
import {
  apiSuccess,
  apiError,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { forgotPasswordLimiter, getClientIp } from '@/lib/utils/rate-limit';

const RESET_TOKEN_EXPIRY_HOURS = 1;

/**
 * Hash a reset token using SHA-256 for storage.
 * Only the hash is stored; the raw token is sent to the client via email/response.
 */
function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * POST /api/portal/auth/forgot-password
 *
 * Request a password reset for a portal client.
 *
 * Body: { email: string }
 *
 * Flow:
 *  1. Validate email
 *  2. Check if client exists and is active
 *  3. Generate a reset token
 *  4. Store its SHA-256 hash in pyra_sessions with username = "reset:{clientId}"
 *  5. In production, this would send an email with the token/link.
 *     In dev mode, the token is returned in the response for testing.
 *  6. Always return success (to prevent email enumeration)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    // ── Validation ───────────────────────────────────
    if (!email?.trim()) {
      return apiValidationError('البريد الإلكتروني مطلوب');
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ── Rate limiting (3 per email per hour) ────────
    const rateCheck = forgotPasswordLimiter.check(normalizedEmail);
    if (rateCheck.limited) {
      const retryMinutes = Math.ceil(rateCheck.retryAfterMs / 60000);
      return apiError(
        `تجاوزت الحد المسموح. حاول مرة أخرى بعد ${retryMinutes} دقيقة`,
        429
      );
    }

    const supabase = createServiceRoleClient();

    // ── Look up the client ───────────────────────────
    const { data: client } = await supabase
      .from('pyra_clients')
      .select('id, name, email, is_active')
      .eq('email', normalizedEmail)
      .maybeSingle();

    // Always return success to prevent email enumeration attacks.
    // Only actually generate a token if the client exists and is active.
    const successMessage = 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني';

    if (!client || !client.is_active) {
      // Client not found or inactive -- still return success to prevent enumeration
      const response: Record<string, unknown> = {
        success: true,
        message: successMessage,
      };
      return apiSuccess(response);
    }

    // ── Generate reset token ─────────────────────────
    const resetToken = generateId('rst');
    const tokenHash = hashResetToken(resetToken);
    const expiresAt = new Date(
      Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000
    ).toISOString();

    // Clean up any existing reset tokens for this client
    await supabase
      .from('pyra_sessions')
      .delete()
      .like('username', `reset:${client.id}`);

    // Store HASHED reset token in pyra_sessions
    // Actual columns: id, username, ip_address, user_agent, last_activity, created_at
    // Mapping: id=tokenHash, username="reset:{clientId}", ip_address=expiresAt, user_agent="reset_token"
    await supabase.from('pyra_sessions').insert({
      id: tokenHash,
      username: `reset:${client.id}`,
      ip_address: expiresAt,
      user_agent: 'reset_token',
      last_activity: new Date().toISOString(),
    });

    // In production, send the email here:
    // await sendPasswordResetEmail(client.email, client.name, resetToken);

    // ── Log reset request activity (non-critical) ───
    const clientIp = getClientIp(request);
    void supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'portal_password_reset_requested',
      username: client.email || client.name,
      display_name: client.name || 'عميل',
      target_path: `/portal/auth`,
      details: {
        client_id: client.id,
        portal_client: true,
      },
      ip_address: clientIp,
    }).then(({ error: logErr }) => {
      if (logErr) console.error('[activity-log] insert error:', logErr.message);
    });

    // ── Build response ───────────────────────────────
    const response: Record<string, unknown> = {
      success: true,
      message: successMessage,
    };

    // In development, include the token for testing
    if (process.env.NODE_ENV !== 'production') {
      response.debug = {
        token: resetToken,
        expires_at: expiresAt,
        client_id: client.id,
      };
    }

    return apiSuccess(response);
  } catch (err) {
    console.error('POST /api/portal/auth/forgot-password error:', err);
    return apiServerError();
  }
}
