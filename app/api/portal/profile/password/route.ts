import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPortalSession, destroyAllClientSessions } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { passwordChangeLimiter } from '@/lib/utils/rate-limit';
import {
  apiSuccess,
  apiError,
  apiUnauthorized,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';

/**
 * POST /api/portal/profile/password
 *
 * Change client password.
 * Body: { current_password: string, new_password: string }
 *
 * Flow:
 *  1. Rate limit by client ID (5 attempts / 15 min)
 *  2. Validate password length (8–128 chars)
 *  3. Verify current password via a throwaway Supabase client (NOT service_role)
 *  4. Update password via admin API
 *  5. Invalidate all other portal sessions for this client
 */
export async function POST(request: NextRequest) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    // ── Rate limit ──────────────────────────────────
    const rl = passwordChangeLimiter.check(client.id);
    if (rl.limited) {
      const retryMinutes = Math.ceil(rl.retryAfterMs / 60000);
      return apiError(
        `عدد المحاولات كثير جداً. يرجى المحاولة بعد ${retryMinutes} دقيقة`,
        429
      );
    }

    const body = await request.json();
    const { current_password, new_password } = body;

    // ── Validation ────────────────────────────────────
    if (!current_password) {
      return apiValidationError('كلمة المرور الحالية مطلوبة');
    }

    if (!new_password) {
      return apiValidationError('كلمة المرور الجديدة مطلوبة');
    }

    if (new_password.length < 12) {
      return apiValidationError('كلمة المرور الجديدة يجب أن تكون 12 حرف على الأقل');
    }

    if (new_password.length > 128) {
      return apiValidationError('كلمة المرور الجديدة طويلة جداً (الحد الأقصى 128 حرف)');
    }

    const supabase = createServiceRoleClient();

    // ── Fetch full client to get Supabase Auth user ID ─
    const { data: fullClient } = await supabase
      .from('pyra_clients')
      .select('auth_user_id, email')
      .eq('id', client.id)
      .single();

    if (!fullClient) {
      return apiServerError();
    }

    // ── Verify current password using a THROWAWAY anon client ─
    // This avoids session state leak on the service_role client
    const throwawayClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { error: signInError } = await throwawayClient.auth.signInWithPassword({
      email: fullClient.email,
      password: current_password,
    });

    if (signInError) {
      return apiError('كلمة المرور الحالية غير صحيحة', 401);
    }

    // Sign out the throwaway client immediately
    await throwawayClient.auth.signOut();

    // ── Update password via admin API ─────────────────
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      fullClient.auth_user_id,
      { password: new_password }
    );

    if (updateError) {
      console.error('POST /api/portal/profile/password — update error:', updateError);
      return apiServerError('فشل تحديث كلمة المرور');
    }

    // ── Log password change activity ────────────────
    void supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'portal_password_changed',
      username: client.email || client.name,
      display_name: client.name || client.company,
      target_path: `/portal/profile`,
      details: {
        client_id: client.id,
        client_company: client.company,
        portal_client: true,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    // ── Invalidate ALL portal sessions (including current) ──
    // After password change, user must re-login for security
    await destroyAllClientSessions(client.id);

    return apiSuccess({ message: 'تم تغيير كلمة المرور بنجاح. يرجى تسجيل الدخول مرة أخرى' });
  } catch (err) {
    console.error('POST /api/portal/profile/password error:', err);
    return apiServerError();
  }
}
