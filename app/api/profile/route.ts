import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiUnauthorized, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';

// =============================================================
// GET /api/profile — Get current user profile
// =============================================================
export async function GET() {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const supabase = await createServerSupabaseClient();

    // Get user with role join
    const { data: user } = await supabase
      .from('pyra_users')
      .select('*, pyra_roles!left(name, name_ar, color, icon)')
      .eq('username', auth.pyraUser.username)
      .single();

    if (!user) return apiUnauthorized();

    // Get activity count
    const { count: activityCount } = await supabase
      .from('pyra_activity_log')
      .select('id', { count: 'exact', head: true })
      .eq('username', auth.pyraUser.username);

    // Get recent login history
    const { data: loginHistory } = await supabase
      .from('pyra_login_history')
      .select('*')
      .eq('username', auth.pyraUser.username)
      .order('logged_in_at', { ascending: false })
      .limit(5);

    return apiSuccess({
      ...user,
      activity_count: activityCount || 0,
      login_history: loginHistory || [],
    });
  } catch (err) {
    console.error('Profile GET error:', err);
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/profile — Update current user profile
// Allowed fields: display_name, email, phone, job_title, bio
// =============================================================
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();

    // Whitelist of allowed fields
    const allowed = ['display_name', 'email', 'phone', 'job_title', 'bio'];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (key in body) {
        updates[key] = typeof body[key] === 'string' ? body[key].trim() || null : body[key];
      }
    }

    // display_name is required if provided
    if ('display_name' in updates && !updates.display_name) {
      return apiValidationError('الاسم مطلوب');
    }

    // Bio max length
    if (updates.bio && updates.bio.length > 280) {
      return apiValidationError('النبذة التعريفية يجب أن تكون أقل من 280 حرف');
    }

    // bank_details — self-service editable (object|null, mirrors admin route validation)
    if (body.bank_details !== undefined) {
      if (
        body.bank_details !== null &&
        (typeof body.bank_details !== 'object' || Array.isArray(body.bank_details))
      ) {
        return apiValidationError('بيانات البنك يجب أن تكون كائن JSON');
      }
      updates.bank_details = body.bank_details ?? null;
    }

    updates.updated_at = new Date().toISOString();

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('pyra_users')
      .update(updates)
      .eq('username', auth.pyraUser.username)
      .select()
      .single();

    if (error) {
      console.error('Profile update error:', error);
      return apiServerError('فشل في تحديث الملف الشخصي');
    }

    // Audit self-edits (contact / bank details) so HR can see who changed what
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.USER}_${ACTIVITY_ACTIONS.UPDATE}`,
      '/dashboard/profile',
      { updated_fields: Object.keys(updates).filter((k) => k !== 'updated_at'), source: 'self_edit' },
      request.headers.get('x-forwarded-for') ?? undefined,
    );

    return apiSuccess(data);
  } catch (err) {
    console.error('Profile PATCH error:', err);
    return apiServerError();
  }
}
