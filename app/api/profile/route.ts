import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiUnauthorized, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/profile — Get current user profile
// =============================================================
export async function GET() {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const supabase = await createServerSupabaseClient();

    // Get user with extra stats
    const { data: user } = await supabase
      .from('pyra_users')
      .select('*')
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
// =============================================================
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { display_name, email, phone } = body;

    if (!display_name?.trim()) {
      return apiValidationError('الاسم مطلوب');
    }

    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from('pyra_users')
      .update({
        display_name: display_name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('username', auth.pyraUser.username);

    if (error) {
      console.error('Profile update error:', error);
      return apiServerError('فشل في تحديث الملف الشخصي');
    }

    return apiSuccess({ message: 'تم تحديث الملف الشخصي' });
  } catch (err) {
    console.error('Profile PATCH error:', err);
    return apiServerError();
  }
}
