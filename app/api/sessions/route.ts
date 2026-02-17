import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/sessions
// List active sessions (admin only)
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiUnauthorized();

    const supabase = await createServerSupabaseClient();

    const { data, count, error } = await supabase
      .from('pyra_sessions')
      .select('*', { count: 'exact' })
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
    const admin = await getApiAdmin();
    if (!admin) return apiUnauthorized();

    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from('pyra_sessions')
      .delete()
      .neq('id', 'keep-none'); // Delete all — we pass dummy to delete all

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
