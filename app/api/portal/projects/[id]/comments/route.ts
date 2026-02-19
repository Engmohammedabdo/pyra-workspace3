import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';

/**
 * POST /api/portal/projects/[id]/comments
 *
 * Create a comment on a project (optionally on a specific file).
 * Body: { text: string, parent_id?: string, file_id?: string }
 *
 * @mentions are extracted from text (e.g. @Ahmed, @Mohamed) and validated
 * against project team members AND admins. Valid mentions trigger notifications.
 *
 * Admins ALWAYS receive notifications for client comments
 * (either as @mention or as general client_comment).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const { id: projectId } = await params;
    const supabase = createServiceRoleClient();

    // ── Verify project exists and belongs to client ───
    const { data: project } = await supabase
      .from('pyra_projects')
      .select('id, client_id, client_company, team_id, name')
      .eq('id', projectId)
      .single();

    if (!project) {
      return apiNotFound('المشروع غير موجود');
    }

    const ownsProject = project.client_id
      ? project.client_id === client.id
      : project.client_company === client.company;

    if (!ownsProject) {
      return apiForbidden('لا تملك صلاحية الوصول لهذا المشروع');
    }

    // ── Parse and validate body ───────────────────────
    const body = await request.json();
    const { text, parent_id, file_id } = body;

    if (!text?.trim()) {
      return apiValidationError('نص التعليق مطلوب');
    }

    if (text.trim().length > 5000) {
      return apiValidationError('التعليق طويل جداً (الحد الأقصى 5000 حرف)');
    }

    // ── Build the full list of mentionable users ──────
    // Admins are ALWAYS mentionable + team members if project has a team.
    // This matches the logic in GET /api/portal/projects/[id]/members.

    const { data: admins } = await supabase
      .from('pyra_users')
      .select('username, display_name')
      .eq('role', 'admin');

    const allUsersMap = new Map<string, { username: string; display_name: string }>();
    for (const a of admins || []) {
      allUsersMap.set(a.username, a);
    }

    if (project.team_id) {
      const { data: teamMembers } = await supabase
        .from('pyra_team_members')
        .select('username')
        .eq('team_id', project.team_id);

      const teamUsernames = (teamMembers || []).map((m: { username: string }) => m.username);

      if (teamUsernames.length > 0) {
        const { data: teamUsers } = await supabase
          .from('pyra_users')
          .select('username, display_name')
          .in('username', teamUsernames);

        for (const u of teamUsers || []) {
          if (!allUsersMap.has(u.username)) {
            allUsersMap.set(u.username, u);
          }
        }
      }
    }

    // ── Extract @mentions and validate ────────────────
    const mentionPattern = /@([\w\u0600-\u06FF]+)/g;
    const rawMentions = [...text.matchAll(mentionPattern)].map((m: RegExpMatchArray) => m[1]);
    let validMentions: string[] = [];
    let mentionedUsernames: string[] = [];

    if (rawMentions.length > 0 && allUsersMap.size > 0) {
      // Build case-insensitive lookup: both username and display_name → username
      const nameToUsername = new Map<string, string>();
      for (const [, u] of allUsersMap) {
        nameToUsername.set(u.username.toLowerCase(), u.username);
        nameToUsername.set(u.display_name.toLowerCase(), u.username);
      }

      const seenUsernames = new Set<string>();
      for (const m of rawMentions) {
        const uname = nameToUsername.get(m.toLowerCase());
        if (uname && !seenUsernames.has(uname)) {
          seenUsernames.add(uname);
          validMentions.push(m);
          mentionedUsernames.push(uname);
        }
      }
    }

    // ── Create the comment ────────────────────────────
    const commentId = generateId('cc');
    const now = new Date().toISOString();

    const { data: comment, error } = await supabase
      .from('pyra_client_comments')
      .insert({
        id: commentId,
        project_id: projectId,
        file_id: file_id || null,
        author_type: 'client',
        author_id: client.id,
        author_name: client.name,
        text: text.trim(),
        mentions: validMentions,
        parent_id: parent_id || null,
        attachments: [],
        is_read_by_client: true,
        is_read_by_team: false,
      })
      .select('id, project_id, file_id, author_type, author_name, text, mentions, parent_id, is_read_by_client, is_read_by_team, created_at')
      .single();

    if (error) {
      console.error('POST /api/portal/projects/[id]/comments — insert error:', error);
      return apiServerError();
    }

    // ── Notify @mentioned users (admins + team) ───────
    const projectDashboardPath = `/dashboard/projects/${projectId}`;

    if (mentionedUsernames.length > 0) {
      const mentionNotifs = mentionedUsernames.map((uname) => ({
        id: generateId('n'),
        recipient_username: uname,
        type: 'mention',
        title: 'تم ذكرك في تعليق',
        message: `${client.name} ذكرك في تعليق على مشروع ${project.name}`,
        source_username: client.name,
        source_display_name: client.name,
        target_path: projectDashboardPath,
        is_read: false,
        created_at: now,
      }));
      const { error: mErr } = await supabase.from('pyra_notifications').insert(mentionNotifs);
      if (mErr) console.error('Mention notification insert error:', mErr);
    }

    // ── Notify remaining users who weren't @mentioned ─
    // All users in allUsersMap who weren't already mentioned
    // get a general "new client comment" notification.
    const remainingUsernames = [...allUsersMap.keys()].filter(
      (uname) => !mentionedUsernames.includes(uname)
    );

    if (remainingUsernames.length > 0) {
      const teamNotifs = remainingUsernames.map((uname) => ({
        id: generateId('n'),
        recipient_username: uname,
        type: 'client_comment',
        title: 'تعليق عميل جديد',
        message: `${client.name} علّق على مشروع ${project.name}`,
        source_username: client.name,
        source_display_name: client.name,
        target_path: projectDashboardPath,
        is_read: false,
        created_at: now,
      }));
      const { error: tErr } = await supabase.from('pyra_notifications').insert(teamNotifs);
      if (tErr) console.error('Team notification insert error:', tErr);
    }

    // ── Log activity (audit trail) ──────────────────
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'client_comment',
      username: client.name,
      display_name: client.name,
      target_path: projectId,
      details: {
        comment_id: commentId,
        project_name: project.name,
        file_id: file_id || null,
        mentions: validMentions,
        is_reply: !!parent_id,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(comment, undefined, 201);
  } catch (err) {
    console.error('POST /api/portal/projects/[id]/comments error:', err);
    return apiServerError();
  }
}
