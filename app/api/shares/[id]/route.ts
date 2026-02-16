import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// PATCH /api/shares/[id]
// Deactivate share link
// Only the creator or an admin can deactivate a share link.
// =============================================================
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    // Verify link exists
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_share_links')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('رابط المشاركة غير موجود');
    }

    // IDOR check: only the creator or admin can deactivate
    const isOwner = existing.created_by === auth.pyraUser.username;
    const isAdmin = auth.pyraUser.role === 'admin';

    if (!isOwner && !isAdmin) {
      return apiError('ليس لديك صلاحية لإلغاء رابط المشاركة هذا', 403);
    }

    const { data: updated, error } = await supabase
      .from('pyra_share_links')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Share link deactivate error:', error);
      return apiServerError();
    }

    return apiSuccess(updated);
  } catch (err) {
    console.error('PATCH /api/shares/[id] error:', err);
    return apiServerError();
  }
}
