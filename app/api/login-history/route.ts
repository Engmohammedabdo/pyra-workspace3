import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/login-history
// List login attempts (admin only)
// Supports ?username=, ?success=, ?limit=
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiUnauthorized();

    const searchParams = request.nextUrl.searchParams;
    const username = searchParams.get('username');
    const success = searchParams.get('success');
    const limit = parseInt(searchParams.get('limit') || '100');

    const supabase = await createServerSupabaseClient();

    let query = supabase
      .from('pyra_login_attempts')
      .select('*', { count: 'exact' })
      .order('attempted_at', { ascending: false })
      .limit(Math.min(limit, 500));

    if (username) {
      query = query.eq('username', username);
    }

    if (success !== null && success !== undefined) {
      query = query.eq('success', success === 'true');
    }

    const { data, count, error } = await query;

    if (error) {
      console.error('Login history error:', error);
      return apiServerError();
    }

    return apiSuccess(data || [], { total: count ?? 0 });
  } catch (err) {
    console.error('GET /api/login-history error:', err);
    return apiServerError();
  }
}
