import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { passwordChangeLimiter } from '@/lib/utils/rate-limit';
import {
  apiSuccess,
  apiError,
  apiUnauthorized,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';

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

    if (new_password.length < 8) {
      return apiValidationError('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل');
    }

    if (new_password.length > 128) {
      return apiValidationError('كلمة المرور الجديدة طويلة جداً (الحد الأقصى 128 حرف)');
    }

    const supabase = createServiceRoleClient();

    // ── Fetch full client to get Supabase Auth user ID ─
    const { data: fullClient } = await supabase
      .from('pyra_clients')
      .select('password_hash, email')
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
      fullClient.password_hash,
      { password: new_password }
    );

    if (updateError) {
      console.error('POST /api/portal/profile/password — update error:', updateError);
      return apiServerError('فشل تحديث كلمة المرور');
    }

    // ── Invalidate all OTHER portal sessions ──────────
    // Keep the current session active, destroy all others
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('pyra_portal_session')?.value;
    let currentToken: string | undefined;
    if (sessionCookie) {
      const parts = sessionCookie.split(':');
      currentToken = parts[1];
    }

    if (currentToken) {
      // Delete all sessions for this client EXCEPT the current one
      await supabase
        .from('pyra_sessions')
        .delete()
        .eq('username', client.id)
        .neq('token', currentToken);
    }

    return apiSuccess({ message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) {
    console.error('POST /api/portal/profile/password error:', err);
    return apiServerError();
  }
}
