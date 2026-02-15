import { NextRequest } from 'next/server';
import { getApiAuth, getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/teams/[id]
// Get team details + members
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

    // Get team
    const { data: team, error: teamError } = await supabase
      .from('pyra_teams')
      .select('*')
      .eq('id', id)
      .single();

    if (teamError || !team) {
      return apiNotFound('الفريق غير موجود');
    }

    // Get members
    const { data: members, error: membersError } = await supabase
      .from('pyra_team_members')
      .select('*')
      .eq('team_id', id)
      .order('added_at', { ascending: true });

    if (membersError) {
      console.error('Team members fetch error:', membersError);
      return apiServerError();
    }

    return apiSuccess({
      ...team,
      members: members || [],
    });
  } catch (err) {
    console.error('GET /api/teams/[id] error:', err);
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/teams/[id]
// Update team (admin only)
// =============================================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await params;
    const body = await request.json();
    const { name, description, permissions } = body;

    const supabase = await createServerSupabaseClient();

    // Verify team exists
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_teams')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('الفريق غير موجود');
    }

    // Build update object
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (permissions !== undefined) updates.permissions = permissions;

    if (Object.keys(updates).length === 0) {
      return apiSuccess(existing);
    }

    const { data: updated, error } = await supabase
      .from('pyra_teams')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Team update error:', error);
      return apiServerError();
    }

    return apiSuccess(updated);
  } catch (err) {
    console.error('PATCH /api/teams/[id] error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/teams/[id]
// Delete team (admin only) — delete members first
// =============================================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    // Verify team exists
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_teams')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('الفريق غير موجود');
    }

    // Delete all team members first
    const { error: membersDeleteError } = await supabase
      .from('pyra_team_members')
      .delete()
      .eq('team_id', id);

    if (membersDeleteError) {
      console.error('Team members delete error:', membersDeleteError);
      return apiServerError();
    }

    // Delete the team
    const { error: teamDeleteError } = await supabase
      .from('pyra_teams')
      .delete()
      .eq('id', id);

    if (teamDeleteError) {
      console.error('Team delete error:', teamDeleteError);
      return apiServerError();
    }

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/teams/[id] error:', err);
    return apiServerError();
  }
}
