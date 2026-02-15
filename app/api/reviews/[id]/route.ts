import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// PATCH /api/reviews/[id]
// Toggle resolved status
// Body: { resolved: boolean }
// =============================================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await params;
    const body = await request.json();

    if (typeof body.resolved !== 'boolean') {
      return apiValidationError('حالة الحل مطلوبة (true أو false)');
    }

    const supabase = await createServerSupabaseClient();

    // Verify review exists
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_reviews')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('المراجعة غير موجودة');
    }

    const { data: updated, error } = await supabase
      .from('pyra_reviews')
      .update({ resolved: body.resolved })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Review update error:', error);
      return apiServerError();
    }

    return apiSuccess(updated);
  } catch (err) {
    console.error('PATCH /api/reviews/[id] error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/reviews/[id]
// Delete review (author or admin only)
// =============================================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    // Verify review exists
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_reviews')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('المراجعة غير موجودة');
    }

    // Only author or admin can delete
    const isAdmin = auth.pyraUser.role === 'admin';
    const isAuthor = existing.username === auth.pyraUser.username;

    if (!isAdmin && !isAuthor) {
      return apiForbidden('لا يمكنك حذف هذه المراجعة');
    }

    const { error } = await supabase
      .from('pyra_reviews')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Review delete error:', error);
      return apiServerError();
    }

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/reviews/[id] error:', err);
    return apiServerError();
  }
}
