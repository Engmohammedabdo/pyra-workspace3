import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getDirectReports } from '@/lib/auth/team-scope';
import { hasPermission } from '@/lib/auth/rbac';
import { dubaiDayKey } from '@/lib/utils/format';
import {
  categorizeMyWorkTasks,
  chunkValues,
  collectCursorPages,
  MY_WORK_TASK_PAGE_SIZE,
} from '@/lib/production/my-work';
import { logError } from '@/lib/observability/log-error';

// =============================================================
// GET /api/my-work
// Aggregates everything that needs the current user's attention:
//   - tasks: assigned to me (overdue / today / this_week / upcoming)
//   - approvals_waiting: leave + expense + timesheet from my direct reports
//   - conversations: WhatsApp conversations assigned to me with unread
//   - leads: sales leads assigned to me needing follow-up
//   - follow_ups: due today/overdue follow-ups assigned to me
//
// Used by the home dashboard "My Work" inbox. One round trip, all surfaces.
// =============================================================

interface MyWorkResponse {
  tasks: {
    overdue: TaskItem[];
    today: TaskItem[];
    this_week: TaskItem[];
    unverified: TaskItem[];
  };
  approvals_waiting: {
    leave: LeaveItem[];
    expense: ExpenseItem[];
    timesheet: TimesheetItem[];
    total: number;
  };
  conversations: { unread: ConversationItem[] };
  leads: { needs_action: LeadItem[] };
  follow_ups: { due: FollowUpItem[] };
  counts: {
    tasks_total: number;
    approvals_total: number;
    conversations_unread: number;
    leads_action: number;
    follow_ups_due: number;
  };
}

interface TaskItem {
  id: string;
  title: string;
  due_date: string | null;
  due_at: string | null;
  production_deadline_exempt: boolean;
  board_id: string;
  board_name: string;
  column_name: string;
  is_done_column: boolean;
}
interface LeaveItem {
  id: string;
  username: string;
  display_name: string;
  type: string;
  /** Arabic display name of the leave type (pyra_leave_types.name_ar),
   *  resolved server-side by NAME lookup (same pattern as
   *  /api/approvals/team). Falls back to the raw stored `type` value
   *  (e.g. 'Annual') when the type row can't be resolved. */
  type_name: string;
  start_date: string;
  end_date: string;
  days_count: number;
}
interface ExpenseItem {
  id: string;
  description: string | null;
  amount: number;
  currency: string;
  vendor: string | null;
  submitted_by: string;
}
interface TimesheetItem {
  id: string;
  username: string;
  display_name: string;
  period_start: string;
  period_end: string;
  total_hours: number | null;
}
interface ConversationItem {
  id: string;
  contact_name: string | null;
  contact_phone: string;
  last_message_at: string | null;
  unread_count: number;
}
interface LeadItem {
  id: string;
  name: string;
  stage_id: string | null;
  last_contact_at: string | null;
  phone: string | null;
}
interface FollowUpItem {
  id: string;
  title: string;
  due_at: string;
  lead_id: string | null;
  lead_name: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const supabase = await createServerSupabaseClient();
    const serviceClient = createServiceRoleClient();
    const username = auth.pyraUser.username;
    const isAdmin = auth.pyraUser.role === 'admin';

    const now = new Date();
    const nowIso = now.toISOString();
    const todayStr = dubaiDayKey(now);
    const [todayYear, todayMonth, todayDay] = todayStr.split('-').map(Number);
    const todayWeekday = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay)).getUTCDay();
    const daysUntilSaturday = (6 - todayWeekday + 7) % 7;
    const endOfWeekStr = dubaiDayKey(new Date(now.getTime() + daysUntilSaturday * 86_400_000));

    // ─── TASKS — assigned to me ────────────────────────────────
    const assignments = await collectCursorPages(
      async (after, pageSize) => {
        let query = supabase
          .from('pyra_task_assignees')
          .select('task_id')
          .eq('username', username)
          .order('task_id', { ascending: true })
          .limit(pageSize);
        if (after !== null) query = query.gt('task_id', after);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
      },
      (assignment) => assignment.task_id,
    );

    const taskIds = [...new Set(assignments.map((assignment) => assignment.task_id))];
    let allTasks: TaskItem[] = [];

    if (taskIds.length > 0) {
      for (const taskIdChunk of chunkValues(taskIds, MY_WORK_TASK_PAGE_SIZE)) {
        const { data: tasksData, error } = await supabase
          .from('pyra_tasks')
          .select('id, title, due_date, due_at, production_deadline_exempt, board_id, pyra_boards!inner(name), pyra_board_columns!inner(name, is_done_column)')
          .in('id', taskIdChunk)
          .eq('is_archived', false)
          .order('id', { ascending: true });
        if (error) throw error;

        allTasks.push(...(tasksData || []).map((t) => {
          const board = Array.isArray(t.pyra_boards) ? t.pyra_boards[0] : t.pyra_boards;
          const col = Array.isArray(t.pyra_board_columns) ? t.pyra_board_columns[0] : t.pyra_board_columns;
          return {
            id: t.id as string,
            title: t.title as string,
            due_date: (t.due_date as string) || null,
            due_at: (t.due_at as string) || null,
            production_deadline_exempt: t.production_deadline_exempt === true,
            board_id: t.board_id as string,
            board_name: (board?.name as string) || '',
            column_name: (col?.name as string) || '',
            is_done_column: !!col?.is_done_column,
          };
        }));
      }
    }

    const categorizedTasks = categorizeMyWorkTasks(allTasks, nowIso, todayStr, endOfWeekStr);
    const overdueTasks = categorizedTasks.overdue;
    const todayTasks = categorizedTasks.today;
    const thisWeekTasks = categorizedTasks.thisWeek;
    const unverifiedTasks = categorizedTasks.unverified;

    // ─── APPROVALS — for direct reports (admin sees all) ───────
    // Defense in depth: require leave.approve permission EVEN IF the user
    // happens to be set as someone's manager. Without this, a sales_agent
    // accidentally set as manager_username would see HR data.
    const canSeeApprovals =
      isAdmin || hasPermission(auth.pyraUser.rolePermissions, 'leave.approve');

    let approvalScope: string[] = [];
    if (canSeeApprovals) {
      approvalScope = isAdmin ? [] : await getDirectReports(serviceClient, username);
    }

    let leaveItems: LeaveItem[] = [];
    let expenseItems: ExpenseItem[] = [];
    let timesheetItems: TimesheetItem[] = [];

    if (canSeeApprovals && (isAdmin || approvalScope.length > 0)) {
      let leaveQuery = serviceClient
        .from('pyra_leave_requests')
        .select('id, username, type, start_date, end_date, days_count')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20);
      if (!isAdmin) leaveQuery = leaveQuery.in('username', approvalScope);
      const { data: leaves } = await leaveQuery;

      const leaveUsernames = Array.from(new Set((leaves || []).map((l) => l.username)));
      const { data: leaveUsers } = leaveUsernames.length
        ? await serviceClient.from('pyra_users').select('username, display_name').in('username', leaveUsernames)
        : { data: [] };
      const userMap = new Map((leaveUsers || []).map((u) => [u.username, u.display_name]));

      // Resolve leave-type Arabic names by NAME lookup (pyra_leave_requests
      // stores the type NAME string, not an id — Batch D). One batched query,
      // never N+1. Same pattern as /api/approvals/team (685912f).
      const leaveTypeNames = Array.from(new Set((leaves || []).map((l) => l.type).filter(Boolean)));
      const { data: leaveTypeRows } = leaveTypeNames.length
        ? await serviceClient.from('pyra_leave_types').select('name, name_ar').in('name', leaveTypeNames)
        : { data: [] };
      const typeNameMap = new Map((leaveTypeRows || []).map((t) => [t.name, t.name_ar]));

      leaveItems = (leaves || []).map((l) => ({
        id: l.id,
        username: l.username,
        display_name: userMap.get(l.username) || l.username,
        type: l.type,
        type_name: typeNameMap.get(l.type) || l.type,
        start_date: l.start_date,
        end_date: l.end_date,
        days_count: l.days_count,
      }));

      let expenseQuery = serviceClient
        .from('pyra_expenses')
        .select('id, description, amount, currency, vendor, submitted_by, created_by')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20);
      if (!isAdmin) expenseQuery = expenseQuery.in('submitted_by', approvalScope);
      const { data: expenses } = await expenseQuery;
      expenseItems = (expenses || []).map((e) => ({
        id: e.id,
        description: e.description || null,
        amount: e.amount,
        currency: e.currency || 'AED',
        vendor: e.vendor || null,
        submitted_by: e.submitted_by || e.created_by,
      }));

      let tsQuery = serviceClient
        .from('pyra_timesheet_periods')
        .select('id, username, start_date, end_date, total_hours')
        .eq('status', 'submitted')
        .order('end_date', { ascending: false })
        .limit(20);
      if (!isAdmin) tsQuery = tsQuery.in('username', approvalScope);
      const { data: timesheets } = await tsQuery;

      const tsUsernames = Array.from(new Set((timesheets || []).map((t) => t.username)));
      const { data: tsUsers } = tsUsernames.length
        ? await serviceClient.from('pyra_users').select('username, display_name').in('username', tsUsernames)
        : { data: [] };
      const tsUserMap = new Map((tsUsers || []).map((u) => [u.username, u.display_name]));
      timesheetItems = (timesheets || []).map((t) => ({
        id: t.id,
        username: t.username,
        display_name: tsUserMap.get(t.username) || t.username,
        period_start: t.start_date,
        period_end: t.end_date,
        total_hours: t.total_hours,
      }));
    }

    // ─── CONVERSATIONS — WhatsApp assigned to me with unread ───
    const { data: convData } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('id, contact_name, contact_phone, last_message_at, unread_count')
      .eq('assigned_to', username)
      .gt('unread_count', 0)
      .order('last_message_at', { ascending: false })
      .limit(10);

    const conversations = (convData || []) as ConversationItem[];
    // TRUE unread-conversation count (the list above is capped at 10 for display;
    // a head:true count returns the real total without fetching rows, so the
    // inbox badge doesn't saturate at 10).
    const { count: convUnreadCount } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', username)
      .gt('unread_count', 0);

    // ─── LEADS — assigned to me, not converted ──────────────────
    // Schema note: pyra_sales_leads has `name` (not full_name), and lifecycle
    // is tracked via `is_converted` + `stage_id` (no `status` column).
    const { data: leadsData } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, stage_id, last_contact_at, phone')
      .eq('assigned_to', username)
      // IS NOT TRUE catches both false and legacy NULL rows (a bare .eq(false)
      // silently hides legacy leads that deals-at-risk/idle-check DO count).
      .not('is_converted', 'is', true)
      .order('last_contact_at', { ascending: true, nullsFirst: true })
      .limit(10);

    const leads: LeadItem[] = (leadsData || []).map((l) => ({
      id: l.id,
      name: l.name,
      stage_id: l.stage_id || null,
      last_contact_at: l.last_contact_at || null,
      phone: l.phone || null,
    }));
    // TRUE count of assigned non-converted leads (same filter as the list above,
    // which is capped at 10 for display). Without this the badge froze at 10 for
    // any agent with a real book of leads.
    const { count: leadsActionCount } = await supabase
      .from('pyra_sales_leads')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', username)
      .not('is_converted', 'is', true);

    // ─── FOLLOW-UPS — due today or overdue ─────────────────────
    // Schema note: pyra_sales_follow_ups column is `due_at` (not scheduled_for).
    const followUpDueCutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const { data: followUpsData } = await supabase
      .from('pyra_sales_follow_ups')
      .select('id, title, due_at, lead_id, status')
      .eq('assigned_to', username)
      // Include 'overdue' — the check-due cron flips due-past pending → overdue,
      // and a bare status='pending' dropped them from the home inbox entirely
      // (agent believed they were clear while follow-ups were overdue+invisible).
      .in('status', ['pending', 'overdue'])
      .lte('due_at', followUpDueCutoff)
      .order('due_at', { ascending: true })
      .limit(10);
    // TRUE count of due/overdue follow-ups (same filter as the capped list above).
    const { count: followUpsDueCount } = await supabase
      .from('pyra_sales_follow_ups')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', username)
      .in('status', ['pending', 'overdue'])
      .lte('due_at', followUpDueCutoff);

    const followUpLeadIds = Array.from(
      new Set((followUpsData || []).map((f) => f.lead_id).filter(Boolean))
    ) as string[];
    const { data: followUpLeads } = followUpLeadIds.length
      ? await supabase.from('pyra_sales_leads').select('id, name').in('id', followUpLeadIds)
      : { data: [] };
    const leadMap = new Map((followUpLeads || []).map((l) => [l.id, l.name]));
    const follow_ups: FollowUpItem[] = (followUpsData || []).map((f) => ({
      id: f.id,
      title: f.title,
      due_at: f.due_at,
      lead_id: f.lead_id || null,
      lead_name: f.lead_id ? leadMap.get(f.lead_id) || null : null,
    }));

    const approvalsTotal = leaveItems.length + expenseItems.length + timesheetItems.length;

    const response: MyWorkResponse = {
      tasks: {
        overdue: overdueTasks,
        today: todayTasks,
        this_week: thisWeekTasks,
        unverified: unverifiedTasks,
      },
      approvals_waiting: {
        leave: leaveItems,
        expense: expenseItems,
        timesheet: timesheetItems,
        total: approvalsTotal,
      },
      conversations: { unread: conversations },
      leads: { needs_action: leads },
      follow_ups: { due: follow_ups },
      counts: {
        tasks_total: overdueTasks.length + todayTasks.length + thisWeekTasks.length
          + unverifiedTasks.length,
        approvals_total: approvalsTotal,
        // The list arrays above are capped at 10 for display; the badge counts
        // come from head:true COUNT queries so they show the real total (?? falls
        // back to the loaded length if a count query returned null).
        conversations_unread: convUnreadCount ?? conversations.length,
        leads_action: leadsActionCount ?? leads.length,
        follow_ups_due: followUpsDueCount ?? follow_ups.length,
      },
    };

    return apiSuccess(response);
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'my-work' } });
    console.error('[GET /api/my-work] error:', err);
    return apiServerError();
  }
}
