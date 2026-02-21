import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/login-history
// List login attempts (admin only)
// Supports ?username=, ?success=, ?source=, ?page=, ?limit=
//   source: 'admin' | 'portal' | 'all' (default: 'all')
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const searchParams = request.nextUrl.searchParams;
    const username = searchParams.get('username')?.trim() || '';
    const success = searchParams.get('success');
    const source = searchParams.get('source') || 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    const supabase = await createServerSupabaseClient();

    let query = supabase
      .from('pyra_login_attempts')
      .select('id, username, ip_address, success, attempted_at', { count: 'exact' })
      .order('attempted_at', { ascending: false });

    // Filter by source: admin users vs portal clients
    if (source === 'admin') {
      query = query.not('username', 'like', 'client:%');
    } else if (source === 'portal') {
      query = query.like('username', 'client:%');
    }

    if (username) {
      query = query.ilike('username', `%${username}%`);
    }

    if (success === 'true' || success === 'false') {
      query = query.eq('success', success === 'true');
    }

    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error('Login history error:', error);
      return apiServerError();
    }

    return apiSuccess(data || [], { total: count ?? 0, page, limit });
  } catch (err) {
    console.error('GET /api/login-history error:', err);
    return apiServerError();
  }
}
