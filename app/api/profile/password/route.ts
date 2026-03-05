import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiUnauthorized, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';
import { userPasswordChangeLimiter, checkRateLimit } from '@/lib/utils/rate-limit';

// =============================================================
// POST /api/profile/password — Change current user's password
// Body: { current_password, new_password }
// =============================================================
export async function POST(request: NextRequest) {
  try {
    // Rate limit
    const limited = checkRateLimit(userPasswordChangeLimiter, request);
    if (limited) return limited;

    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { current_password, new_password } = await request.json();

    // Validate
    if (!current_password) {
      return apiValidationError('كلمة المرور الحالية مطلوبة');
    }
    if (!new_password || new_password.length < 8) {
      return apiValidationError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
    }
    if (new_password.length > 128) {
      return apiValidationError('كلمة المرور طويلة جداً (الحد الأقصى 128 حرف)');
    }

    const supabase = await createServerSupabaseClient();

    // Find the Supabase Auth user ID via mapping
    const { data: mapping } = await supabase
      .from('pyra_auth_mapping')
      .select('auth_user_id')
      .eq('pyra_username', auth.pyraUser.username)
      .single();

    if (!mapping) {
      return apiServerError('لم يتم العثور على ربط حساب المصادقة');
    }

    const serviceClient = createServiceRoleClient();

    // Get auth user email for verification
    const { data: authUser } = await serviceClient.auth.admin.getUserById(mapping.auth_user_id);
    if (!authUser?.user?.email) {
      return apiServerError('لم يتم العثور على بيانات المصادقة');
    }

    // Verify current password using a throwaway client
    const throwawayClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { error: verifyError } = await throwawayClient.auth.signInWithPassword({
      email: authUser.user.email,
      password: current_password,
    });

    if (verifyError) {
      return apiValidationError('كلمة المرور الحالية غير صحيحة');
    }

    // Sign out the throwaway client immediately
    await throwawayClient.auth.signOut();

    // Update password via admin API
    const { error: updateError } = await serviceClient.auth.admin.updateUserById(
      mapping.auth_user_id,
      { password: new_password }
    );

    if (updateError) {
      console.error('Password update error:', updateError);
      return apiServerError(`فشل في تحديث كلمة المرور: ${updateError.message}`);
    }

    // Log the activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'password_changed',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: auth.pyraUser.username,
      details: {
        changed_by: auth.pyraUser.username,
        is_self_change: true,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) {
    console.error('POST /api/profile/password error:', err);
    return apiServerError();
  }
}
