import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/leave/conflicts?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 *
 * Check for team members with overlapping approved leave in the given date range.
 * Returns array of { username, display_name, start_date, end_date, type }
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiPermission('leave.view');
  if (isApiError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');

  if (!startDate || !endDate) {
    return apiValidationError('start_date و end_date مطلوبان');
  }

  try {
    const supabase = await createServerSupabaseClient();
    const currentUsername = auth.pyraUser.username;

    // Step 1: Get all team IDs the current user belongs to
    const { data: myTeams, error: teamsError } = await supabase
      .from('pyra_team_members')
      .select('team_id')
      .eq('username', currentUsername);

    if (teamsError) {
      console.error('Leave conflicts — team lookup error:', teamsError);
      return apiServerError(teamsError.message);
    }

    if (!myTeams || myTeams.length === 0) {
      // User is not in any team — no conflicts possible
      return apiSuccess([]);
    }

    const teamIds = myTeams.map((t) => t.team_id);

    // Step 2: Get all teammates (excluding self) from those teams
    const { data: teammates, error: matesError } = await supabase
      .from('pyra_team_members')
      .select('username')
      .in('team_id', teamIds)
      .neq('username', currentUsername);

    if (matesError) {
      console.error('Leave conflicts — teammates lookup error:', matesError);
      return apiServerError(matesError.message);
    }

    if (!teammates || teammates.length === 0) {
      return apiSuccess([]);
    }

    // Deduplicate usernames (a user may be in multiple shared teams)
    const uniqueUsernames = [...new Set(teammates.map((t) => t.username))];

    // Step 3: Query approved leave requests that overlap with the given date range
    // Overlap condition: existing.start_date <= endDate AND existing.end_date >= startDate
    const { data: conflicts, error: conflictsError } = await supabase
      .from('pyra_leave_requests')
      .select('username, start_date, end_date, type')
      .eq('status', 'approved')
      .in('username', uniqueUsernames)
      .lte('start_date', endDate)
      .gte('end_date', startDate);

    if (conflictsError) {
      console.error('Leave conflicts — query error:', conflictsError);
      return apiServerError(conflictsError.message);
    }

    if (!conflicts || conflicts.length === 0) {
      return apiSuccess([]);
    }

    // Step 4: Enrich with display_name from pyra_users
    const conflictUsernames = [...new Set(conflicts.map((c) => c.username))];
    const { data: users } = await supabase
      .from('pyra_users')
      .select('username, display_name')
      .in('username', conflictUsernames);

    const userMap = new Map<string, string>();
    if (users) {
      for (const u of users) {
        userMap.set(u.username, u.display_name);
      }
    }

    const result = conflicts.map((c) => ({
      username: c.username,
      display_name: userMap.get(c.username) || c.username,
      start_date: c.start_date,
      end_date: c.end_date,
      leave_type: c.type,
    }));

    return apiSuccess(result);
  } catch (err) {
    console.error('GET /api/leave/conflicts error:', err);
    return apiServerError();
  }
}
