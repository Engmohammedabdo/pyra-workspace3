import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// =============================================================
// GET /api/tasks/[id]/comments
// List all comments for a task
// =============================================================
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('tasks.view');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('pyra_task_comments')
    .select('id, author_username, author_name, content, mentions, created_at')
    .eq('task_id', id)
    .order('created_at', { ascending: true });

  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

// =============================================================
// POST /api/tasks/[id]/comments
// Add a comment to a task  { content: string }
// Extracts @mentions and sends notifications to mentioned users
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('tasks.view');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const { content } = await req.json();
  if (!content || !content.trim()) {
    return apiValidationError('محتوى التعليق مطلوب');
  }

  const supabase = await createServerSupabaseClient();
  const trimmedContent = content.trim();
  const now = new Date().toISOString();

  // ── Extract @mentions ──────────────────────────────
  const mentionPattern = /@([\w\u0600-\u06FF]+)/g;
  const rawMentions = [...trimmedContent.matchAll(mentionPattern)].map((m: RegExpMatchArray) => m[1]);
  let validMentions: string[] = [];
  const mentionedUsernames: string[] = [];

  if (rawMentions.length > 0) {
    // Fetch task to get board_id and assigned_to
    const { data: task } = await supabase
      .from('pyra_tasks')
      .select('board_id, assigned_to')
      .eq('id', id)
      .single();

    const nameToUsername = new Map<string, string>();

    // 1. Always include admins
    const { data: admins } = await supabase
      .from('pyra_users')
      .select('username, display_name')
      .eq('role', 'admin');

    (admins || []).forEach((u) => {
      nameToUsername.set(u.username.toLowerCase(), u.username);
      nameToUsername.set(u.display_name.toLowerCase(), u.username);
    });

    // 2. Get board -> project -> team members
    if (task?.board_id) {
      const { data: board } = await supabase
        .from('pyra_boards')
        .select('id, project_id')
        .eq('id', task.board_id)
        .single();

      if (board?.project_id) {
        const { data: project } = await supabase
          .from('pyra_projects')
          .select('id, team_id')
          .eq('id', board.project_id)
          .single();

        if (project?.team_id) {
          const { data: teamMembers } = await supabase
            .from('pyra_team_members')
            .select('username')
            .eq('team_id', project.team_id);

          const memberUsernames = (teamMembers || []).map((m) => m.username);
          if (memberUsernames.length > 0) {
            const { data: users } = await supabase
              .from('pyra_users')
              .select('username, display_name')
              .in('username', memberUsernames);

            (users || []).forEach((u) => {
              nameToUsername.set(u.username.toLowerCase(), u.username);
              nameToUsername.set(u.display_name.toLowerCase(), u.username);
            });
          }
        }
      }
    }

    // 3. Include task assignee
    if (task?.assigned_to) {
      const { data: assignee } = await supabase
        .from('pyra_users')
        .select('username, display_name')
        .eq('username', task.assigned_to)
        .single();

      if (assignee) {
        nameToUsername.set(assignee.username.toLowerCase(), assignee.username);
        nameToUsername.set(assignee.display_name.toLowerCase(), assignee.username);
      }
    }

    // 4. Validate mentions
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

  // ── Insert comment ─────────────────────────────────
  const commentId = generateId('tc');
  const { data, error } = await supabase
    .from('pyra_task_comments')
    .insert({
      id: commentId,
      task_id: id,
      author_username: auth.pyraUser.username,
      author_name: auth.pyraUser.display_name,
      content: trimmedContent,
      mentions: validMentions.length > 0 ? validMentions : [],
    })
    .select()
    .single();

  if (error) return apiServerError(error.message);

  // ── Notify @mentioned users ────────────────────────
  if (mentionedUsernames.length > 0) {
    // Get the board ID for the target_path
    const { data: taskForPath } = await supabase
      .from('pyra_tasks')
      .select('board_id')
      .eq('id', id)
      .single();

    const mentionNotifs = mentionedUsernames.map((uname) => ({
      id: generateId('n'),
      recipient_username: uname,
      type: 'mention',
      title: 'تم ذكرك في تعليق',
      message: `${auth.pyraUser.display_name} ذكرك في تعليق على مهمة`,
      source_username: auth.pyraUser.username,
      source_display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/boards/${taskForPath?.board_id || ''}`,
      is_read: false,
      created_at: now,
    }));
    const { error: mErr } = await supabase.from('pyra_notifications').insert(mentionNotifs);
    if (mErr) console.error('Mention notification insert error:', mErr);
  }

  // ── Log activity ───────────────────────────────────
  await supabase.from('pyra_task_activity').insert({
    id: generateId('tl'),
    task_id: id,
    username: auth.pyraUser.username,
    display_name: auth.pyraUser.display_name,
    action: 'comment_added',
    details: { content: trimmedContent.slice(0, 100), mentions: validMentions },
  });

  return apiSuccess(data, undefined, 201);
}

// =============================================================
// DELETE /api/tasks/[id]/comments?commentId=xxx
// Delete a comment
// =============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('tasks.create');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const commentId = req.nextUrl.searchParams.get('commentId');
  if (!commentId) return apiValidationError('commentId مطلوب');

  const supabase = await createServerSupabaseClient();

  // Only allow deleting own comments (or admin)
  const { hasPermission: checkPerm } = await import('@/lib/auth/rbac');
  const isAdmin = checkPerm(auth.pyraUser.rolePermissions, 'tasks.manage');

  if (!isAdmin) {
    const { data: comment } = await supabase
      .from('pyra_task_comments')
      .select('author_username')
      .eq('id', commentId)
      .eq('task_id', id)
      .single();

    if (comment?.author_username !== auth.pyraUser.username) {
      return apiServerError('لا يمكنك حذف تعليقات الآخرين');
    }
  }

  const { error } = await supabase
    .from('pyra_task_comments')
    .delete()
    .eq('id', commentId)
    .eq('task_id', id);

  if (error) return apiServerError(error.message);
  return apiSuccess({ deleted: true });
}
