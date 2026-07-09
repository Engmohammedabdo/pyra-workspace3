import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveAuthUserId } from '@/lib/auth/auth-mapping';
import { generateId } from '@/lib/utils/id';
import { PASSWORD_MIN_LENGTH } from '@/lib/constants/auth';
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

    const auth = await requireApiPermission('users.manage');
    if (isApiError(auth)) return auth;
    const t = await getTranslations('api');

    const { username } = await params;
    const isSelf = auth.pyraUser.username === username;

    const body = await request.json();
    const { password, current_password } = body;

    // Validate password
    if (!password || typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
      return apiValidationError(t('users.passwordMinRequired', { min: PASSWORD_MIN_LENGTH }));
    }

    const supabase = await createServerSupabaseClient();

    // Verify target user exists
    const { data: targetUser, error: findError } = await supabase
      .from('pyra_users')
      .select('id, username, display_name')
      .eq('username', username)
      .single();

    if (findError || !targetUser) {
      return apiNotFound(t('users.notFound'));
    }

    // Resolve Supabase Auth user ID (heals legacy users missing from pyra_auth_mapping)
    const serviceClient = createServiceRoleClient();
    const authUserId = await resolveAuthUserId(serviceClient, username);

    if (!authUserId) {
      return apiServerError(t('users.authAccountNotFound'));
    }

    // For self-change, verify current password
    if (isSelf) {
      if (!current_password) {
        return apiValidationError(t('users.currentPasswordRequired'));
      }
      const { data: authUser } = await serviceClient.auth.admin.getUserById(authUserId);
      if (!authUser?.user?.email) {
        return apiServerError(t('users.authDataNotFound'));
      }
      const { error: verifyError } = await serviceClient.auth.signInWithPassword({
        email: authUser.user.email,
        password: current_password,
      });
      if (verifyError) {
        return apiValidationError(t('users.currentPasswordIncorrect'));
      }
    }
    const { error: updateError } = await serviceClient.auth.admin.updateUserById(
      authUserId,
      { password }
    );

    if (updateError) {
      console.error('Password update error:', updateError);
      return apiServerError(t('users.passwordUpdateFailed', { message: updateError.message }));
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

    return apiSuccess({ message: t('users.passwordChangeSuccess') });
  } catch (err) {
    console.error('Password POST error:', err);
    return apiServerError();
  }
}
