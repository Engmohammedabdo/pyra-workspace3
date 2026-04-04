import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiNotFound } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity } from '@/lib/api/activity';

type RouteCtx = { params: Promise<{ id: string; taskId: string; attId: string }> };

// =============================================================
// POST /api/boards/[id]/tasks/[taskId]/attachments/[attId]/review
// Approve or request revision on a file
// Body: { action: 'approve' | 'revision', note?: string }
// =============================================================
export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const { id: boardId, taskId, attId } = await ctx.params;
    const body = await req.json();
    const action = body.action as string;
    const note = (body.note as string) || '';

    if (!action || !['approve', 'revision'].includes(action)) {
      return apiValidationError('يجب تحديد الإجراء: approve أو revision');
    }

    const supabase = await createServerSupabaseClient();

    // Update attachment status
    const reviewStatus = action === 'approve' ? 'approved' : 'revision_requested';
    const { data, error } = await supabase
      .from('pyra_task_attachments')
      .update({
        review_status: reviewStatus,
        reviewed_by: auth.pyraUser.username,
        review_note: note || null,
      })
      .eq('id', attId)
      .eq('task_id', taskId)
      .select()
      .single();

    if (error || !data) return apiNotFound('الملف غير موجود');

    // Get task info for notification
    const { data: task } = await supabase
      .from('pyra_tasks')
      .select('title, board_id')
      .eq('id', taskId)
      .single();

    // Notify the uploader
    if (data.uploaded_by && data.uploaded_by !== auth.pyraUser.username) {
      await supabase.from('pyra_notifications').insert({
        id: generateId('ntf'),
        username: data.uploaded_by,
        type: action === 'approve' ? 'file_approved' : 'file_revision_requested',
        title: action === 'approve'
          ? `تمت الموافقة على الملف: ${data.file_name}`
          : `مطلوب تعديل على الملف: ${data.file_name}`,
        message: note || (action === 'approve' ? 'تمت الموافقة' : 'مطلوب تعديل'),
        link: `/dashboard/boards/${boardId}`,
        is_read: false,
      });
    }

    // Activity log
    await supabase.from('pyra_task_activity').insert({
      id: generateId('act'),
      task_id: taskId,
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      action: action === 'approve' ? 'file_approved' : 'file_revision_requested',
      details: JSON.stringify({ file_name: data.file_name, note }),
    });

    // If revision requested, add comment
    if (action === 'revision' && note) {
      await supabase.from('pyra_task_comments').insert({
        id: generateId('tc'),
        task_id: taskId,
        author_username: auth.pyraUser.username,
        author_name: auth.pyraUser.display_name,
        content: `📎 مطلوب تعديل على "${data.file_name}": ${note}`,
      });
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      action === 'approve' ? 'attachment_approved' : 'attachment_revision_requested',
      `/dashboard/boards/${boardId}`,
      { task_id: taskId, attachment_id: attId, file_name: data.file_name },
    );

    return apiSuccess(data);

  } catch (err) {
    console.error('[POST /api/boards/[id]/tasks/[taskId]/attachments/[attId]/review] error:', err);
    return apiServerError();
  }
}
