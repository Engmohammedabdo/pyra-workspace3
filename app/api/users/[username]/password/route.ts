import { NextRequest } from 'next/server';
import { getApiAuth, getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { userPasswordChangeLimiter, checkRateLimit } from '@/lib/utils/rate-limit';

type RouteParams = { params: Promise<{ username: string }> };

// =============================================================
// POST /api/users/[username]/password
// Change a user's password.
// Admin can change anyone's password.
// Non-admin can only change their own password.
// Body: { password }
// =============================================================
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Rate limit
    const limited = checkRateLimit(userPasswordChangeLimiter, request);
    if (limited) return limited;

    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { username } = await params;
    const isAdmin = auth.pyraUser.role === 'admin';
    const isSelf = auth.pyraUser.username === username;

    // Non-admin users can only change their own password
    if (!isAdmin && !isSelf) {
      return apiForbidden('لا تملك صلاحية تغيير كلمة مرور هذا المستخدم');
    }

    const body = await request.json();
    const { password } = body;

    // Validate password
    if (!password || typeof password !== 'string' || password.length < 12) {
      return apiValidationError('كلمة المرور مطلوبة (12 حرف على الأقل)');
    }

    const supabase = await createServerSupabaseClient();

    // Verify target user exists
    const { data: targetUser, error: findError } = await supabase
      .from('pyra_users')
      .select('id, username, display_name')
      .eq('username', username)
      .single();

    if (findError || !targetUser) {
      return apiNotFound('المستخدم غير موجود');
    }

    // Find the Supabase Auth user ID via mapping
    const { data: mapping } = await supabase
      .from('pyra_auth_mapping')
      .select('auth_user_id')
      .eq('pyra_username', username)
      .single();

    if (!mapping) {
      return apiServerError('لم يتم العثور على ربط حساب المصادقة');
    }

    // Update Supabase Auth password
    const serviceClient = createServiceRoleClient();
    const { error: updateError } = await serviceClient.auth.admin.updateUserById(
      mapping.auth_user_id,
      { password }
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
      target_path: username,
      details: {
        target_username: username,
        changed_by: auth.pyraUser.username,
        is_self_change: isSelf,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) {
    console.error('Password POST error:', err);
    return apiServerError();
  }
}
