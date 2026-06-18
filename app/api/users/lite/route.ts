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

    // `status` + `role` are additive (Commit 1 / Option A): the reassign picker
    // filters to active, lead-capable users client-side, and resolves the
    // current owner's display_name even when that owner is inactive (e.g. a
    // departed agent). Existing callers ignore the extra fields (UserLite has
    // an index signature).
    const { data: users, error } = await supabase
      .from('pyra_users')
      .select('username, display_name, status, role')
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
