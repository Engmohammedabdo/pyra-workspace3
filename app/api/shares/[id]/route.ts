import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// PATCH /api/shares/[id]
// Deactivate share link
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
