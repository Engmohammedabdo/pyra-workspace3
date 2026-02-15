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

// =============================================================
// GET /api/teams/[id]/members
// List team members
// =============================================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    // Verify team exists
    const { data: team, error: teamError } = await supabase
      .from('pyra_teams')
      .select('id')
      .eq('id', id)
      .single();

    if (teamError || !team) {
      return apiNotFound('الفريق غير موجود');
    }

    const { data: members, error } = await supabase
      .from('pyra_team_members')
      .select('*')
      .eq('team_id', id)
      .order('added_at', { ascending: true });

    if (error) {
      console.error('Team members list error:', error);
      return apiServerError();
    }

    return apiSuccess(members || []);
  } catch (err) {
    console.error('GET /api/teams/[id]/members error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/teams/[id]/members
// Add a member to team (admin only)
// =============================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await params;
    const body = await request.json();
    const { username } = body;

    if (!username?.trim()) {
      return apiValidationError('اسم المستخدم مطلوب');
    }

    const supabase = await createServerSupabaseClient();

    // Verify team exists
    const { data: team, error: teamError } = await supabase
      .from('pyra_teams')
      .select('id')
      .eq('id', id)
      .single();

    if (teamError || !team) {
      return apiNotFound('الفريق غير موجود');
    }

    // Check if member already exists in this team
    const { data: existingMember } = await supabase
      .from('pyra_team_members')
      .select('id')
      .eq('team_id', id)
      .eq('username', username.trim())
      .maybeSingle();

    if (existingMember) {
      return apiValidationError('المستخدم موجود بالفعل في هذا الفريق');
    }

    const memberId = generateId('tm');

    const { data: member, error } = await supabase
      .from('pyra_team_members')
      .insert({
        id: memberId,
        team_id: id,
        username: username.trim(),
        added_by: admin.pyraUser.username,
      })
      .select()
      .single();

    if (error) {
      console.error('Team member add error:', error);
      return apiServerError();
    }

    return apiSuccess(member, undefined, 201);
  } catch (err) {
    console.error('POST /api/teams/[id]/members error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/teams/[id]/members
// Remove a member from team (admin only)
// Query: ?username=
// =============================================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await params;
    const username = request.nextUrl.searchParams.get('username')?.trim();

    if (!username) {
      return apiValidationError('اسم المستخدم مطلوب في الاستعلام');
    }

    const supabase = await createServerSupabaseClient();

    // Verify team exists
    const { data: team, error: teamError } = await supabase
      .from('pyra_teams')
      .select('id')
      .eq('id', id)
      .single();

    if (teamError || !team) {
      return apiNotFound('الفريق غير موجود');
    }

    // Delete member
    const { error } = await supabase
      .from('pyra_team_members')
      .delete()
      .eq('team_id', id)
      .eq('username', username);

    if (error) {
      console.error('Team member remove error:', error);
      return apiServerError();
    }

    return apiSuccess({ removed: true, username });
  } catch (err) {
    console.error('DELETE /api/teams/[id]/members error:', err);
    return apiServerError();
  }
}
