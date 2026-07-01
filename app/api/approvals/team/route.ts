import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getDirectReports } from '@/lib/auth/team-scope';
import { hasPermission } from '@/lib/auth/rbac';

// =============================================================
// GET /api/approvals/team
// Returns ALL pending approvals (leave + expense + timesheet) for
// users that report to the current user. Admins see all.
//
// Used by the Manager Approvals dashboard at /dashboard/approvals.
// =============================================================

export interface TeamApprovalsResponse {
  leave: Array<{
    id: string;
    username: string;
    display_name: string;
    type: string;
    start_date: string;
    end_date: string;
    days_count: number;
    reason: string | null;
    created_at: string;
  }>;
  expense: Array<{
    id: string;
    description: string | null;
    amount: number;
    currency: string;
    vat_amount: number;
    vendor: string | null;
    expense_date: string;
    submitted_by: string;
    submitted_by_display: string;
    receipt_url: string | null;
    notes: string | null;
    created_at: string;
  }>;
  timesheet: Array<{
    id: string;
    username: string;
    display_name: string;
    period_start: string;
    period_end: string;
    total_hours: number | null;
    submitted_at: string | null;
  }>;
  is_manager: boolean;
}

export async function GET() {
  try {
    // Entry gate: require leave.view (in BASE_EMPLOYEE — every internal user
    // has it). This is the standard project-wide pattern (no API uses raw
    // getApiAuth without a permission). Defense in depth: even after this
    // gate, only admins or users with explicit leave.approve get data;
    // everyone else gets is_manager:false with empty arrays.
    const auth = await requireApiPermission('leave.view');
    if (isApiError(auth)) return auth;

    const serviceClient = createServiceRoleClient();
    const supabase = await createServerSupabaseClient();
    const username = auth.pyraUser.username;
    const isAdmin = auth.pyraUser.role === 'admin';

    // Only admins or users with explicit leave.approve permission get team
    // approval data — even if they happen to be set as someone's manager.
    // Misconfigured manager_username (e.g., a sales agent assigned by mistake)
    // must not leak HR data to roles without an HR mandate.
    const hasApprovalRights =
      isAdmin || hasPermission(auth.pyraUser.rolePermissions, 'leave.approve');

    if (!hasApprovalRights) {
      return apiSuccess<TeamApprovalsResponse>({
        leave: [],
        expense: [],
        timesheet: [],
        is_manager: false,
      });
    }

    const reports = isAdmin ? null : await getDirectReports(serviceClient, username);
    const isManager = isAdmin || (reports !== null && reports.length > 0);

    if (!isManager) {
      return apiSuccess<TeamApprovalsResponse>({
        leave: [],
        expense: [],
        timesheet: [],
        is_manager: false,
      });
    }

    // Build queries (admin: no scope; manager: scoped to direct reports)
    const buildLeaveQuery = () => {
      let q = serviceClient
        .from('pyra_leave_requests')
        .select('id, username, type, start_date, end_date, days_count, reason, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!isAdmin && reports) q = q.in('username', reports);
      return q;
    };

    const buildExpenseQuery = () => {
      let q = serviceClient
        .from('pyra_expenses')
        .select('id, description, amount, currency, vat_amount, vendor, expense_date, submitted_by, receipt_url, notes, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!isAdmin && reports) q = q.in('submitted_by', reports);
      return q;
    };

    const buildTimesheetQuery = () => {
      let q = serviceClient
        .from('pyra_timesheet_periods')
        .select('id, username, start_date, end_date, total_hours, submitted_at')
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false })
        .limit(100);
      if (!isAdmin && reports) q = q.in('username', reports);
      return q;
    };

    const [leaveResult, expenseResult, timesheetResult] = await Promise.all([
      buildLeaveQuery(),
      buildExpenseQuery(),
      buildTimesheetQuery(),
    ]);

    // Collect all usernames to enrich with display_name
    const allUsernames = new Set<string>();
    (leaveResult.data || []).forEach((l) => allUsernames.add(l.username));
    (expenseResult.data || []).forEach((e) => e.submitted_by && allUsernames.add(e.submitted_by));
    (timesheetResult.data || []).forEach((t) => allUsernames.add(t.username));

    const usernamesArray = Array.from(allUsernames);
    const { data: users } = usernamesArray.length
      ? await supabase.from('pyra_users').select('username, display_name').in('username', usernamesArray)
      : { data: [] };
    const userMap = new Map(
      (users || []).map((u: { username: string; display_name: string }) => [u.username, u.display_name])
    );

    const response: TeamApprovalsResponse = {
      leave: (leaveResult.data || []).map((l) => ({
        id: l.id,
        username: l.username,
        display_name: userMap.get(l.username) || l.username,
        type: l.type,
        start_date: l.start_date,
        end_date: l.end_date,
        days_count: l.days_count,
        reason: l.reason || null,
        created_at: l.created_at,
      })),
      expense: (expenseResult.data || []).map((e) => ({
        id: e.id,
        description: e.description || null,
        amount: e.amount,
        currency: e.currency || 'AED',
        vat_amount: e.vat_amount || 0,
        vendor: e.vendor || null,
        expense_date: e.expense_date,
        submitted_by: e.submitted_by,
        submitted_by_display: userMap.get(e.submitted_by) || e.submitted_by,
        receipt_url: e.receipt_url || null,
        notes: e.notes || null,
        created_at: e.created_at,
      })),
      timesheet: (timesheetResult.data || []).map((t) => ({
        id: t.id,
        username: t.username,
        display_name: userMap.get(t.username) || t.username,
        period_start: t.start_date,
        period_end: t.end_date,
        total_hours: t.total_hours || null,
        submitted_at: t.submitted_at || null,
      })),
      is_manager: true,
    };

    return apiSuccess(response);
  } catch (err) {
    console.error('[GET /api/approvals/team] error:', err);
    return apiServerError();
  }
}
