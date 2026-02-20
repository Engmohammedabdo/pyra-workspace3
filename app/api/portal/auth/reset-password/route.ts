import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { destroyAllClientSessions } from '@/lib/portal/auth';
import { createHash } from 'crypto';
import {
  apiSuccess,
  apiError,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { resetPasswordLimiter, getClientIp } from '@/lib/utils/rate-limit';
import { generateId } from '@/lib/utils/id';

/**
 * Hash a reset token using SHA-256 to look up the stored hash.
 */
function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * POST /api/portal/auth/reset-password
 *
 * Process a password reset using the token from forgot-password.
 *
 * Body: { token: string, password: string }
 *
 * Flow:
 *  1. Validate input
 *  2. Hash the token, look up matching token_hash in pyra_sessions (username starts with "reset:")
 *  3. Verify it's not expired
 *  4. Extract client_id from the username field
 *  5. Look up the client to get the Supabase Auth user ID (auth_user_id)
 *  6. Update the password in Supabase Auth
 *  7. Delete the reset session record
 *  8. Return success
 */
export async function POST(request: NextRequest) {
  try {
    // ── Rate limiting (5 per IP per 15 min) ──────────
    const clientIp = getClientIp(request);
    const rateCheck = resetPasswordLimiter.check(clientIp);
    if (rateCheck.limited) {
      const retryMinutes = Math.ceil(rateCheck.retryAfterMs / 60000);
      return apiError(
        `تجاوزت الحد المسموح. حاول مرة أخرى بعد ${retryMinutes} دقيقة`,
        429
      );
    }

    const body = await request.json();
    const { token, password } = body;

    // ── Validation ───────────────────────────────────
    if (!token?.trim()) {
      return apiValidationError('رمز إعادة التعيين مطلوب');
    }

    if (!password || password.length < 12) {
      return apiValidationError('كلمة المرور مطلوبة (12 حرف على الأقل)');
    }

    const supabase = createServiceRoleClient();

    // ── Look up the reset token by HASH ──────────────
    // The raw token was sent to the client; we hash it to match the stored id.
    // Actual columns: id=tokenHash, username="reset:{clientId}", ip_address=expiresAt
    const tokenHash = hashResetToken(token.trim());
    const { data: resetSession, error: sessionError } = await supabase
      .from('pyra_sessions')
      .select('id, username, ip_address, last_activity')
      .eq('id', tokenHash)
      .like('username', 'reset:%')
      .eq('user_agent', 'reset_token')
      .maybeSingle();

    if (sessionError) {
      console.error('Reset password — session lookup error:', sessionError);
      return apiServerError();
    }

    if (!resetSession) {
      return apiError('رمز إعادة التعيين غير صالح أو منتهي الصلاحية', 400);
    }

    // Check expiry (stored in ip_address field)
    const expiresAt = resetSession.ip_address;
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      // Token expired — clean up
      await supabase.from('pyra_sessions').delete().eq('id', tokenHash);
      return apiError('رمز إعادة التعيين منتهي الصلاحية', 400);
    }

    // ── Extract client ID ────────────────────────────
    const clientId = resetSession.username.replace('reset:', '');

    if (!clientId) {
      return apiError('رمز إعادة التعيين غير صالح', 400);
    }

    // ── Look up the client ───────────────────────────
    const { data: client } = await supabase
      .from('pyra_clients')
      .select('id, auth_user_id, is_active')
      .eq('id', clientId)
      .maybeSingle();

    if (!client) {
      return apiError('العميل غير موجود', 404);
    }

    if (!client.is_active) {
      return apiError('تم تعطيل حسابك. يرجى التواصل مع فريق الدعم', 403);
    }

    // ── Update password in Supabase Auth ──────────────
    const authUserId = client.auth_user_id;

    if (!authUserId) {
      return apiError(
        'حسابك لا يدعم إعادة تعيين كلمة المرور عبر هذا الرابط. يرجى التواصل مع فريق الدعم',
        400
      );
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      authUserId,
      { password }
    );

    if (updateError) {
      console.error('Reset password — auth update error:', updateError);
      return apiError('فشل في تحديث كلمة المرور. يرجى المحاولة مرة أخرى', 500);
    }

    // ── Delete the reset token ───────────────────────
    await supabase
      .from('pyra_sessions')
      .delete()
      .eq('id', resetSession.id);

    // Also clean up any other reset tokens for this client
    await supabase
      .from('pyra_sessions')
      .delete()
      .like('username', `reset:${clientId}`);

    // ── Log password reset activity ──────────────────
    void supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'portal_password_reset_completed',
      username: `client:${clientId}`,
      display_name: 'عميل',
      target_path: `/portal/auth`,
      details: {
        client_id: clientId,
        portal_client: true,
      },
      ip_address: clientIp,
    }).then(({ error: logErr }) => {
      if (logErr) console.error('[activity-log] insert error:', logErr.message);
    });

    // ── Invalidate ALL active portal sessions ──────
    await destroyAllClientSessions(clientId);

    return apiSuccess({
      success: true,
      message: 'تم إعادة تعيين كلمة المرور بنجاح. يرجى تسجيل الدخول بكلمة المرور الجديدة',
    });
  } catch (err) {
    console.error('POST /api/portal/auth/reset-password error:', err);
    return apiServerError();
  }
}
