import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  apiSuccess,
  apiError,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';

/**
 * POST /api/portal/auth/reset-password
 *
 * Process a password reset using the token from forgot-password.
 *
 * Body: { token: string, password: string }
 *
 * Flow:
 *  1. Validate input
 *  2. Look up the reset token in pyra_sessions (username starts with "reset:")
 *  3. Verify it's not expired
 *  4. Extract client_id from the username field
 *  5. Look up the client to get the Supabase Auth user ID (password_hash)
 *  6. Update the password in Supabase Auth
 *  7. Delete the reset session record
 *  8. Return success
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, password } = body;

    // ── Validation ───────────────────────────────────
    if (!token?.trim()) {
      return apiValidationError('رمز إعادة التعيين مطلوب');
    }

    if (!password || password.length < 6) {
      return apiValidationError('كلمة المرور مطلوبة (6 أحرف على الأقل)');
    }

    const supabase = createServiceRoleClient();

    // ── Look up the reset token ──────────────────────
    const { data: resetSession, error: sessionError } = await supabase
      .from('pyra_sessions')
      .select('*')
      .eq('token', token.trim())
      .like('username', 'reset:%')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (sessionError) {
      console.error('Reset password — session lookup error:', sessionError);
      return apiServerError();
    }

    if (!resetSession) {
      return apiError('رمز إعادة التعيين غير صالح أو منتهي الصلاحية', 400);
    }

    // ── Extract client ID ────────────────────────────
    const clientId = resetSession.username.replace('reset:', '');

    if (!clientId) {
      return apiError('رمز إعادة التعيين غير صالح', 400);
    }

    // ── Look up the client ───────────────────────────
    const { data: client } = await supabase
      .from('pyra_clients')
      .select('id, password_hash, is_active')
      .eq('id', clientId)
      .maybeSingle();

    if (!client) {
      return apiError('العميل غير موجود', 404);
    }

    if (!client.is_active) {
      return apiError('تم تعطيل حسابك. يرجى التواصل مع فريق الدعم', 403);
    }

    // ── Update password in Supabase Auth ──────────────
    // password_hash stores the Supabase Auth user ID
    const authUserId = client.password_hash;

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

    return apiSuccess({
      success: true,
      message: 'تم إعادة تعيين كلمة المرور بنجاح',
    });
  } catch (err) {
    console.error('POST /api/portal/auth/reset-password error:', err);
    return apiServerError();
  }
}
