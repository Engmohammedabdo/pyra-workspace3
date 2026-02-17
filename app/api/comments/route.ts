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
// List comments for a project — optionally filtered by file_id.
// Query: ?project_id= (required) &file_id= (optional)
// Order by created_at ASC (chronological)
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');
    const fileId = searchParams.get('file_id');

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

    let query = supabase
      .from('pyra_client_comments')
      .select('*', { count: 'exact' })
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    // Filter by specific file when provided
    if (fileId) {
      query = query.eq('file_id', fileId);
    }

    const { data: comments, error, count } = await query;

    if (error) {
      console.error('Comments list error:', error);
      return apiServerError('فشل في جلب التعليقات');
    }

    // Auto-mark client comments as read-by-team
    const unreadIds = (comments || [])
      .filter((c) => c.author_type === 'client' && !c.is_read_by_team)
      .map((c) => c.id);
    if (unreadIds.length > 0) {
      await supabase
        .from('pyra_client_comments')
        .update({ is_read_by_team: true })
        .in('id', unreadIds);
    }

    return apiSuccess(comments || [], { total: count || 0 });
  } catch (err) {
    console.error('Comments GET error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/comments
// Create a new comment (team → client or internal).
// Body: { project_id, text, file_id?, parent_id?, attachments? }
// Sets author_type='team', author_name from auth.
// Sends notifications to: company clients + @mentioned team members.
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { project_id, text, file_id, parent_id, attachments } = body;

    // Validation
    if (!project_id || typeof project_id !== 'string') {
      return apiValidationError('معرّف المشروع مطلوب (project_id)');
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return apiValidationError('نص التعليق مطلوب');
    }

    if (text.trim().length > 5000) {
      return apiValidationError('التعليق طويل جداً (الحد الأقصى 5000 حرف)');
    }

    if (attachments && !Array.isArray(attachments)) {
      return apiValidationError('المرفقات يجب أن تكون مصفوفة');
    }

    const supabase = await createServerSupabaseClient();

    // Verify project exists
    const { data: project, error: projectError } = await supabase
      .from('pyra_projects')
      .select('id, name, client_company, team_id')
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

    // ── Extract & validate @mentions ──────────────────
    const mentionPattern = /@([\w\u0600-\u06FF]+)/g;
    const rawMentions = [...text.matchAll(mentionPattern)].map((m: RegExpMatchArray) => m[1]);
    let validMentions: string[] = [];
    let mentionedUsernames: string[] = [];

    if (rawMentions.length > 0 && project.team_id) {
      const { data: teamMembers } = await supabase
        .from('pyra_team_members')
        .select('username')
        .eq('team_id', project.team_id);

      const memberUsernames = (teamMembers || []).map((m: { username: string }) => m.username);
      if (memberUsernames.length > 0) {
        const { data: users } = await supabase
          .from('pyra_users')
          .select('username, display_name')
          .in('username', memberUsernames);

        const nameToUsername = new Map<string, string>();
        (users || []).forEach((u: { username: string; display_name: string }) => {
          nameToUsername.set(u.username.toLowerCase(), u.username);
          nameToUsername.set(u.display_name.toLowerCase(), u.username);
        });

        const seenUsernames = new Set<string>();
        for (const m of rawMentions) {
          const uname = nameToUsername.get(m.toLowerCase());
          if (uname && !seenUsernames.has(uname) && uname !== auth.pyraUser.username) {
            seenUsernames.add(uname);
            validMentions.push(m);
            mentionedUsernames.push(uname);
          }
        }
      }
    }

    const commentId = generateId('cc');
    const now = new Date().toISOString();

    const newComment = {
      id: commentId,
      project_id,
      file_id: file_id || null,
      author_type: 'team' as const,
      author_id: auth.pyraUser.username,
      author_name: auth.pyraUser.display_name,
      text: text.trim(),
      mentions: validMentions,
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

    // ── Notify company clients ───────────────────────
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

    // ── Notify @mentioned team members ───────────────
    if (mentionedUsernames.length > 0) {
      const mentionNotifs = mentionedUsernames.map((uname) => ({
        id: generateId('n'),
        recipient_username: uname,
        type: 'mention',
        title: 'تم ذكرك في تعليق',
        message: `${auth.pyraUser.display_name} ذكرك في تعليق على مشروع ${project.name}`,
        source_username: auth.pyraUser.username,
        source_display_name: auth.pyraUser.display_name,
        target_path: project_id,
        is_read: false,
        created_at: now,
      }));
      const { error: mErr } = await supabase.from('pyra_notifications').insert(mentionNotifs);
      if (mErr) console.error('Mention notification insert error:', mErr);
    }

    // ── Log activity ─────────────────────────────────
    const { error: logErr } = await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'comment_created',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: project_id,
      details: {
        comment_id: commentId,
        project_name: project.name,
        file_id: file_id || null,
        mentions: validMentions,
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
