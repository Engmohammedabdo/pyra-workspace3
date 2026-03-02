import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/sessions
// List active sessions (admin only)
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireApiPermission('sessions.view');
    if (isApiError(auth)) return auth;

    const supabase = await createServerSupabaseClient();

    const { data, count, error } = await supabase
      .from('pyra_sessions')
      .select('id, username, ip_address, user_agent, last_activity, created_at', { count: 'exact' })
      .not('user_agent', 'eq', 'reset_token')
      .order('last_activity', { ascending: false });

    if (error) {
      console.error('Sessions list error:', error);
      return apiServerError();
    }

    return apiSuccess(data || [], { total: count ?? 0 });
  } catch (err) {
    console.error('GET /api/sessions error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/sessions
// Terminate all sessions except current (admin only)
// =============================================================
export async function DELETE(_request: NextRequest) {
  try {
    const auth = await requireApiPermission('sessions.manage');
    if (isApiError(auth)) return auth;

    const supabase = await createServerSupabaseClient();

    // Terminate all portal client sessions (exclude reset tokens and admin sessions)
    const { error } = await supabase
      .from('pyra_sessions')
      .delete()
      .not('user_agent', 'eq', 'reset_token')
      .neq('username', auth.pyraUser.username);

    if (error) {
      console.error('Sessions terminate all error:', error);
      return apiServerError();
    }

    return apiSuccess({ terminated: true });
  } catch (err) {
    console.error('DELETE /api/sessions error:', err);
    return apiServerError();
  }
}
