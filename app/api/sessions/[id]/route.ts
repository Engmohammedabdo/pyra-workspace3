import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type RouteContext = { params: Promise<{ id: string }> };

// =============================================================
// DELETE /api/sessions/[id]
// Terminate a specific session (admin only)
// =============================================================
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await context.params;

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('pyra_sessions')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return apiNotFound('الجلسة غير موجودة');
    }

    return apiSuccess({ terminated: true, session_id: id });
  } catch (err) {
    console.error('DELETE /api/sessions/[id] error:', err);
    return apiServerError();
  }
}
