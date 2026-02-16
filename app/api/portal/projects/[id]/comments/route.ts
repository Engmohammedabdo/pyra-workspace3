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
 * Create a comment on a project.
 * Body: { text: string, parent_id?: string }
 *
 * @mentions are extracted from text (e.g. @Ahmed) and validated
 * against project team members. Only valid mentions are stored.
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
    const { text, parent_id } = body;

    if (!text?.trim()) {
      return apiValidationError('نص التعليق مطلوب');
    }

    if (text.trim().length > 5000) {
      return apiValidationError('التعليق طويل جداً (الحد الأقصى 5000 حرف)');
    }

    // ── Extract @mentions and validate against project members ──
    const mentionPattern = /@([\w\u0600-\u06FF]+)/g;
    const rawMentions = [...text.matchAll(mentionPattern)].map((m: RegExpMatchArray) => m[1]);
    let validMentions: string[] = [];

    if (rawMentions.length > 0 && project.team_id) {
      // Get team members for this project
      const { data: teamMembers } = await supabase
        .from('pyra_team_members')
        .select('username')
        .eq('team_id', project.team_id);

      const memberUsernames = (teamMembers || []).map((m: { username: string }) => m.username);
      if (memberUsernames.length > 0) {
        // Get display names to match mentions by username or display_name
        const { data: users } = await supabase
          .from('pyra_users')
          .select('username, display_name')
          .in('username', memberUsernames);

        const validNames = new Set<string>();
        (users || []).forEach((u: { username: string; display_name: string }) => {
          validNames.add(u.username.toLowerCase());
          validNames.add(u.display_name.toLowerCase());
        });

        validMentions = rawMentions.filter((m: string) => validNames.has(m.toLowerCase()));
      }
    }

    // ── Create the comment ────────────────────────────
    const commentId = generateId('cc');
    const { data: comment, error } = await supabase
      .from('pyra_client_comments')
      .insert({
        id: commentId,
        project_id: projectId,
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
      .select('id, project_id, author_type, author_name, text, mentions, parent_id, is_read_by_client, is_read_by_team, created_at')
      .single();

    if (error) {
      console.error('POST /api/portal/projects/[id]/comments — insert error:', error);
      return apiServerError();
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
