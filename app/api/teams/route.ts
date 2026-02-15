import { NextRequest } from 'next/server';
import { getApiAuth, getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// =============================================================
// GET /api/teams
// List all teams (any authenticated user)
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const supabase = await createServerSupabaseClient();

    const { data: teams, error } = await supabase
      .from('pyra_teams')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Teams list error:', error);
      return apiServerError();
    }

    return apiSuccess(teams || []);
  } catch (err) {
    console.error('GET /api/teams error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/teams
// Create a team (admin only)
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const body = await request.json();
    const { name, description, permissions } = body;

    // Validation
    if (!name?.trim()) {
      return apiValidationError('اسم الفريق مطلوب');
    }

    const supabase = await createServerSupabaseClient();

    const teamId = generateId('t');

    const { data: team, error } = await supabase
      .from('pyra_teams')
      .insert({
        id: teamId,
        name: name.trim(),
        description: description?.trim() || null,
        permissions: permissions || {},
        created_by: admin.pyraUser.username,
      })
      .select()
      .single();

    if (error) {
      console.error('Team create error:', error);
      return apiServerError();
    }

    return apiSuccess(team, undefined, 201);
  } catch (err) {
    console.error('POST /api/teams error:', err);
    return apiServerError();
  }
}
