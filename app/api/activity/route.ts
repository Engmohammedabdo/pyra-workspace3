import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { escapeLike } from '@/lib/utils/path';

// =============================================================
// GET /api/activity
// List activity logs (admin only)
//
// Query params:
//   ?action_type=  — filter by action type
//   ?username=     — filter by username
//   ?target_path=  — filter by target path (ilike)
//   ?from=         — start date (ISO string)
//   ?to=           — end date (ISO string)
//   ?page=1        — page number
//   ?limit=50      — items per page (max 100)
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const searchParams = request.nextUrl.searchParams;
    const actionType = searchParams.get('action_type')?.trim() || '';
    const username = searchParams.get('username')?.trim() || '';
    const targetPath = searchParams.get('target_path')?.trim() || '';
    const from = searchParams.get('from')?.trim() || '';
    const to = searchParams.get('to')?.trim() || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    const supabase = await createServerSupabaseClient();

    let query = supabase
      .from('pyra_activity_log')
      .select('id, action_type, username, display_name, target_path, details, ip_address, created_at', { count: 'exact' });

    // Apply filters
    if (actionType) {
      query = query.eq('action_type', actionType);
    }
    if (username) {
      query = query.eq('username', username);
    }
    if (targetPath) {
      query = query.ilike('target_path', `%${escapeLike(targetPath)}%`);
    }
    if (from) {
      query = query.gte('created_at', from);
    }
    if (to) {
      query = query.lte('created_at', to);
    }

    // Order and paginate
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: logs, count, error } = await query;

    if (error) {
      console.error('Activity log list error:', error);
      return apiServerError();
    }

    return apiSuccess(logs || [], {
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error('GET /api/activity error:', err);
    return apiServerError();
  }
}
