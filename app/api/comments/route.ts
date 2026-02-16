import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// =============================================================
// GET /api/comments
// List comments for a project.
// Query: ?project_id= (required)
// Order by created_at ASC (chronological)
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');

    if (!projectId) {
      return apiValidationError('معرّف المشروع مطلوب (project_id)');
    }

    const supabase = await createServerSupabaseClient();

    // Verify project exists
    const { data: project, error: projectError } = await supabase
      .from('pyra_projects')
      .select('id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return apiNotFound('المشروع غير موجود');
    }

    const { data: comments, error, count } = await supabase
      .from('pyra_client_comments')
      .select('*', { count: 'exact' })
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Comments list error:', error);
      return apiServerError('فشل في جلب التعليقات');
    }

    return apiSuccess(comments || [], { total: count || 0 });
  } catch (err) {
    console.error('Comments GET error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/comments
// Create a new comment.
// Body: { project_id, text, parent_id?, attachments? }
// Sets author_type='team', author_name from auth
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { project_id, text, parent_id, attachments } = body;

    // Validation
    if (!project_id || typeof project_id !== 'string') {
      return apiValidationError('معرّف المشروع مطلوب (project_id)');
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return apiValidationError('نص التعليق مطلوب');
    }

    if (attachments && !Array.isArray(attachments)) {
      return apiValidationError('المرفقات يجب أن تكون مصفوفة');
    }

    const supabase = await createServerSupabaseClient();

    // Verify project exists
    const { data: project, error: projectError } = await supabase
      .from('pyra_projects')
      .select('id, name, client_company')
      .eq('id', project_id)
      .single();

    if (projectError || !project) {
      return apiNotFound('المشروع غير موجود');
    }

    // If parent_id is provided, verify parent comment exists
    if (parent_id) {
      const { data: parentComment, error: parentError } = await supabase
        .from('pyra_client_comments')
        .select('id')
        .eq('id', parent_id)
        .eq('project_id', project_id)
        .single();

      if (parentError || !parentComment) {
        return apiNotFound('التعليق الأصلي غير موجود');
      }
    }

    const commentId = generateId('cc');
    const now = new Date().toISOString();

    const newComment = {
      id: commentId,
      project_id,
      author_type: 'team' as const,
      author_id: auth.pyraUser.username,
      author_name: auth.pyraUser.display_name,
      text: text.trim(),
      parent_id: parent_id || null,
      attachments: attachments || [],
      is_read_by_client: false,
      is_read_by_team: true,
      created_at: now,
    };

    const { data: comment, error } = await supabase
      .from('pyra_client_comments')
      .insert(newComment)
      .select()
      .single();

    if (error) {
      console.error('Comment create error:', error);
      return apiServerError('فشل في إنشاء التعليق');
    }

    // Notify clients of the company about the new comment
    const { data: clients } = await supabase
      .from('pyra_clients')
      .select('id')
      .eq('company', project.client_company)
      .eq('is_active', true);

    if (clients && clients.length > 0) {
      const notifications = clients.map((client) => ({
        id: generateId('cn'),
        client_id: client.id,
        type: 'new_comment',
        title: 'تعليق جديد',
        message: `تعليق جديد من ${auth.pyraUser.display_name} في مشروع ${project.name}`,
        is_read: false,
        created_at: now,
      }));

      const { error: notifErr } = await supabase.from('pyra_client_notifications').insert(notifications);
      if (notifErr) console.error('Client notification insert error:', notifErr);
    }

    // Log activity
    const { error: logErr } = await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'comment_created',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: project_id,
      details: {
        comment_id: commentId,
        project_name: project.name,
        is_reply: !!parent_id,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });
    if (logErr) console.error('Activity log insert error:', logErr);

    return apiSuccess(comment, undefined, 201);
  } catch (err) {
    console.error('Comments POST error:', err);
    return apiServerError();
  }
}
