import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/users/lite
// Minimal user list for dropdowns/selects. Any authenticated user.
// Returns only username and display_name.
// =============================================================
export async function GET() {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const supabase = await createServerSupabaseClient();

    const { data: users, error } = await supabase
      .from('pyra_users')
      .select('username, display_name')
      .order('display_name', { ascending: true });

    if (error) {
      console.error('Users lite list error:', error);
      return apiServerError('فشل في جلب قائمة المستخدمين');
    }

    return apiSuccess(users || []);
  } catch (err) {
    console.error('Users lite GET error:', err);
    return apiServerError();
  }
}
