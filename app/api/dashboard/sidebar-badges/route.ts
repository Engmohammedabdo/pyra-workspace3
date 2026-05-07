import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiError } from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/auth/rbac';
import { getDirectReports } from '@/lib/auth/team-scope';

/**
 * GET /api/dashboard/sidebar-badges
 * Returns badge counts for sidebar: unread notifications + overdue invoices + pending approvals.
 * Lightweight endpoint polled every 60s.
 */
export async function GET() {
  try {
    const auth = await getApiAuth();
    if (!auth) {
      return apiError('غير مصرح', 401);
    }

    const supabase = await createServerSupabaseClient();
    const serviceClient = createServiceRoleClient();
    const username = auth.pyraUser.username;
    const isAdmin = auth.pyraUser.role === 'admin';

    const canManageApprovals = hasPermission(auth.pyraUser.rolePermissions, 'quote_approvals.manage');
    const canViewWhatsApp = hasPermission(auth.pyraUser.rolePermissions, 'sales_whatsapp.view');
    const canViewFollowUps = hasPermission(auth.pyraUser.rolePermissions, 'follow_ups.view');
    const canApproveCrm = hasPermission(auth.pyraUser.rolePermissions, 'leads.approve');

    // Resolve approval scope — admins see all, managers see direct reports only
    const reports = isAdmin ? null : await getDirectReports(serviceClient, username);
    const hasApprovalScope = isAdmin || (reports && reports.length > 0);

    const teamApprovalsQuery = (table: string, statusValue: string, userColumn = 'username') => {
      if (!hasApprovalScope) return Promise.resolve({ count: 0 });
      let q = serviceClient.from(table).select('id', { count: 'exact', head: true }).eq('status', statusValue);
      if (!isAdmin && reports) q = q.in(userColumn, reports);
      return q;
    };

    const [
      notifResult,
      overdueResult,
      approvalsResult,
      unassignedWaResult,
      leaveResult,
      expenseResult,
      timesheetResult,
      followUpsResult,
      crmApprovalsResult,
    ] = await Promise.all([
      // Unread notifications for this user
      supabase
        .from('pyra_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_username', username)
        .eq('is_read', false),
      // Overdue invoices
      supabase
        .from('pyra_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'overdue'),
      // Pending quote approvals (only count for admins who can manage approvals)
      canManageApprovals
        ? supabase
            .from('pyra_quote_approvals')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
        : Promise.resolve({ count: 0 }),
      // Unassigned WhatsApp conversations (for anyone with whatsapp access)
      canViewWhatsApp
        ? supabase
            .from('pyra_whatsapp_conversations')
            .select('id', { count: 'exact', head: true })
            .is('assigned_to', null)
            .neq('status', 'resolved')
        : Promise.resolve({ count: 0 }),
      // Pending leave requests from direct reports (or all for admins)
      teamApprovalsQuery('pyra_leave_requests', 'pending'),
      // Pending expenses from direct reports (or all for admins)
      teamApprovalsQuery('pyra_expenses', 'pending', 'submitted_by'),
      // Submitted timesheet periods from direct reports (or all for admins)
      teamApprovalsQuery('pyra_timesheet_periods', 'submitted'),
      // Pending CRM follow-ups assigned to me (admin sees all)
      canViewFollowUps
        ? (() => {
            let q = serviceClient
              .from('pyra_sales_follow_ups')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'pending');
            if (!isAdmin) q = q.eq('assigned_to', username);
            return q;
          })()
        : Promise.resolve({ count: 0 }),
      // CRM Closed-Won approvals waiting on me — leads currently parked in
      // stg_contract_signed. Admin sees all; non-admin manager sees only
      // leads owned by direct reports (mirrors GET /api/crm/approvals/pending).
      canApproveCrm
        ? (async () => {
            let q = serviceClient
              .from('pyra_sales_leads')
              .select('id', { count: 'exact', head: true })
              .eq('stage_id', 'stg_contract_signed');
            if (!isAdmin) {
              const myReports = reports ?? (await getDirectReports(serviceClient, username));
              if (!myReports || myReports.length === 0) return { count: 0 };
              q = q.in('assigned_to', myReports);
            }
            return q;
          })()
        : Promise.resolve({ count: 0 }),
    ]);

    const teamApprovalsCount =
      (leaveResult.count ?? 0) + (expenseResult.count ?? 0) + (timesheetResult.count ?? 0);

    return apiSuccess({
      notifications: notifResult.count ?? 0,
      overdue_invoices: overdueResult.count ?? 0,
      pending_approvals: approvalsResult.count ?? 0,
      unassigned_conversations: unassignedWaResult.count ?? 0,
      team_approvals: teamApprovalsCount,
      follow_ups_pending: followUpsResult.count ?? 0,
      crm_pending_approvals: crmApprovalsResult.count ?? 0,
    });
  } catch {
    return apiError('خطأ في الخادم', 500);
  }
}
