import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
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
 *  1. Verify current password via supabase.auth.signInWithPassword
 *  2. Sign out the auth session
 *  3. Update password via supabase.auth.admin.updateUserById
 */
export async function POST(request: NextRequest) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const supabase = createServiceRoleClient();
    const body = await request.json();
    const { current_password, new_password } = body;

    // ── Validation ────────────────────────────────────
    if (!current_password) {
      return apiValidationError('كلمة المرور الحالية مطلوبة');
    }

    if (!new_password) {
      return apiValidationError('كلمة المرور الجديدة مطلوبة');
    }

    if (new_password.length < 6) {
      return apiValidationError('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
    }

    // ── Fetch full client to get Supabase Auth user ID ─
    const { data: fullClient } = await supabase
      .from('pyra_clients')
      .select('password_hash, email')
      .eq('id', client.id)
      .single();

    if (!fullClient) {
      return apiServerError();
    }

    // ── Verify current password ───────────────────────
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: fullClient.email,
      password: current_password,
    });

    if (signInError) {
      return apiError('كلمة المرور الحالية غير صحيحة', 401);
    }

    // Sign out immediately — we don't keep Supabase Auth sessions for portal
    await supabase.auth.signOut();

    // ── Update password via admin API ─────────────────
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      fullClient.password_hash,
      { password: new_password }
    );

    if (updateError) {
      console.error('POST /api/portal/profile/password — update error:', updateError);
      return apiServerError('فشل تحديث كلمة المرور');
    }

    return apiSuccess({ message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) {
    console.error('POST /api/portal/profile/password error:', err);
    return apiServerError();
  }
}
