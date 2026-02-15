import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import {
  apiSuccess,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';

const RESET_TOKEN_EXPIRY_HOURS = 1;

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
 *  4. Store it in pyra_sessions with username = "reset:{clientId}"
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

    const supabase = createServiceRoleClient();
    const normalizedEmail = email.trim().toLowerCase();

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
    const expiresAt = new Date(
      Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000
    ).toISOString();

    // Clean up any existing reset tokens for this client
    await supabase
      .from('pyra_sessions')
      .delete()
      .like('username', `reset:${client.id}`);

    // Store reset token in pyra_sessions
    await supabase.from('pyra_sessions').insert({
      id: generateId('sess'),
      username: `reset:${client.id}`,
      token: resetToken,
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
      user_agent: request.headers.get('user-agent') || 'portal',
      last_activity: new Date().toISOString(),
      expires_at: expiresAt,
    });

    // In production, send the email here:
    // await sendPasswordResetEmail(client.email, client.name, resetToken);
    console.log(
      `[Portal] Password reset token for ${client.email}: ${resetToken} (expires: ${expiresAt})`
    );

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
