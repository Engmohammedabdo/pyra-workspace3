import { NextRequest } from 'next/server';
import { getApiAuth, getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

type RouteContext = { params: Promise<{ id: string }> };

// =============================================================
// DELETE /api/comments/[id]
// Delete a comment. Only the author or admin can delete.
// =============================================================
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await context.params;

    const supabase = await createServerSupabaseClient();

    // Fetch the comment
    const { data: comment, error: fetchError } = await supabase
      .from('pyra_client_comments')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !comment) {
      return apiNotFound('التعليق غير موجود');
    }

    // Authorization: only the author (by display_name match) or admin can delete
    const isAuthor = comment.author_name === auth.pyraUser.display_name;
    const isAdmin = auth.pyraUser.role === 'admin';

    if (!isAuthor && !isAdmin) {
      return apiForbidden('لا يمكنك حذف هذا التعليق');
    }

    // Delete child comments (replies) first
    await supabase
      .from('pyra_client_comments')
      .delete()
      .eq('parent_id', id);

    // Delete the comment
    const { error } = await supabase
      .from('pyra_client_comments')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Comment delete error:', error);
      return apiServerError('فشل في حذف التعليق');
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'comment_deleted',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: comment.project_id,
      details: {
        comment_id: id,
        deleted_comment_author: comment.author_name,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('Comment DELETE error:', err);
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/comments/[id]
// Mark comment as read.
// Body: { read_by: 'client' | 'team' }
// Updates is_read_by_client or is_read_by_team.
// =============================================================
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await context.params;
    const body = await request.json();
    const { read_by } = body;

    // Validation
    if (!read_by || !['client', 'team'].includes(read_by)) {
      return apiValidationError('قيمة read_by غير صالحة. القيم المسموحة: client, team');
    }

    const supabase = await createServerSupabaseClient();

    // Verify comment exists
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_client_comments')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('التعليق غير موجود');
    }

    // Build the update
    const updates: Record<string, boolean> = {};
    if (read_by === 'client') {
      updates.is_read_by_client = true;
    } else {
      updates.is_read_by_team = true;
    }

    const { data: comment, error } = await supabase
      .from('pyra_client_comments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Comment read update error:', error);
      return apiServerError('فشل في تحديث حالة القراءة');
    }

    return apiSuccess(comment);
  } catch (err) {
    console.error('Comment PATCH error:', err);
    return apiServerError();
  }
}
