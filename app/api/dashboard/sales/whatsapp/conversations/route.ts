import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isSuperAdmin } from '@/lib/auth/rbac';
import { WA_CONVERSATION_FIELDS } from '@/lib/supabase/fields';
import { CONVERSATION_STATUS } from '@/lib/constants/statuses';
import { typingMap } from '@/lib/whatsapp/typing-map';
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';
import { needsReply, waitingMinutes, waitingSeverity } from '@/lib/whatsapp/inbox';

/**
 * GET /api/dashboard/sales/whatsapp/conversations
 * Shared Inbox — returns conversations from pyra_whatsapp_conversations table.
 *
 * Query params:
 *   status   = open | pending | resolved | snoozed | all (default: open)
 *   assigned = me | unassigned | all (default: all)
 *   search   = contact name or phone search
 *   label    = label ID to filter by
 *   team     = team ID to filter by
 *   priority = low | normal | high | urgent (comma-separated for multi)
 *   sort     = newest | oldest | priority | waiting_longest (default: newest)
 *   type     = individual | group | all (default: all)
 *   instance = Evolution instance name (line filter) | all (default: all)
 *   limit    = number (default: 100)
 *
 * Scoping:
 *   Admin: sees ALL conversations
 *   Agent: sees assigned_to=username + unassigned (to pick up)
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiPermission('sales_whatsapp.view');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();
  const sp = request.nextUrl.searchParams;

  const statusFilter = sp.get('status') || 'open';
  const assignedFilter = sp.get('assigned') || 'all';
  const search = sp.get('search')?.trim() || '';
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '100')));
  const contactPhone = sp.get('contact_phone')?.trim() || '';
  const excludeId = sp.get('exclude_id')?.trim() || '';
  const labelFilter = sp.get('label') || '';
  const teamFilter = sp.get('team') || '';
  const priorityFilter = sp.get('priority') || '';
  const assignedAgents = sp.get('assigned_agents') || '';
  const sortBy = sp.get('sort') || 'newest';
  const type = sp.get('type') || 'all'; // 'individual' | 'group' | 'all'
  const instanceFilter = sp.get('instance') || 'all'; // line filter (multi-number inbox)

  const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
  const username = auth.pyraUser.username;

  try {
    // Exclude our own number from conversations list
    const OWN_PHONE = '971565799505';

    let query = supabase
      .from('pyra_whatsapp_conversations')
      .select(WA_CONVERSATION_FIELDS)
      .or('contact_phone.is.null,contact_phone.neq.971565799505')
      .is('merged_into_id', null)
      .limit(limit);

    // Filter by conversation type
    if (type === 'individual') {
      query = query.eq('is_group', false);
    } else if (type === 'group') {
      query = query.eq('is_group', true);
    }

    // Line filter — one conversation list can now hold several WhatsApp
    // numbers (company line + per-agent lines); this narrows to one of them.
    if (instanceFilter && instanceFilter !== 'all') {
      query = query.eq('instance_name', instanceFilter);
    }

    // Snoozed tab: show only snoozed conversations
    if (statusFilter === 'snoozed') {
      query = query.gt('snoozed_until', new Date().toISOString());
    } else {
      // For non-snoozed tabs, exclude snoozed conversations
      query = query.or('snoozed_until.is.null,snoozed_until.lte.' + new Date().toISOString());

      // Status filter
      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
    }

    // Assignment filter + scoping
    if (isAdmin) {
      if (assignedFilter === 'me') {
        query = query.eq('assigned_to', username);
      } else if (assignedFilter === 'unassigned') {
        query = query.is('assigned_to', null);
      }
      // 'all' = no filter for admin
    } else {
      // Agent: sees ONLY conversations assigned to them — nothing else
      query = query.eq('assigned_to', username);
    }

    // Filter by contact phone (for previous conversations)
    if (contactPhone) {
      query = query.eq('contact_phone', contactPhone);
    }

    // Exclude a specific conversation
    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    // Search by contact name or phone — Phase D Commit 1 hardening (audit
    // P2 #7). Previous `.replace(/[,().%*]/g, '')` missed the dot (.) which
    // is the PostgREST filter syntax delimiter, leaving room for
    // `name.eq.foo.assigned_to.neq.x` style injection. Now uses the
    // canonical escapePostgrestValue(escapeLike(...)) pattern matching
    // /api/crm/leads/route.ts.
    if (search) {
      const safe = escapePostgrestValue(`%${escapeLike(search)}%`);
      query = query.or(`contact_name.ilike.${safe},contact_phone.ilike.${safe}`);
    }

    // Team filter
    if (teamFilter) {
      query = query.eq('team_id', teamFilter);
    }

    // Priority filter (supports comma-separated)
    if (priorityFilter) {
      const priorities = priorityFilter.split(',').map(p => p.trim()).filter(Boolean);
      if (priorities.length === 1) {
        query = query.eq('priority', priorities[0]);
      } else if (priorities.length > 1) {
        query = query.in('priority', priorities);
      }
    }

    // Assigned agents filter (supports comma-separated usernames)
    if (assignedAgents) {
      const agents = assignedAgents.split(',').map(a => a.trim()).filter(Boolean);
      if (agents.length === 1) {
        query = query.eq('assigned_to', agents[0]);
      } else if (agents.length > 1) {
        query = query.in('assigned_to', agents);
      }
    }

    // Sorting
    switch (sortBy) {
      case 'oldest':
        query = query.order('last_message_at', { ascending: true, nullsFirst: true });
        break;
      case 'priority':
        query = query
          .order('is_pinned', { ascending: false })
          .order('priority', { ascending: true })
          .order('last_message_at', { ascending: false, nullsFirst: false });
        break;
      case 'waiting_longest':
        query = query.order('waiting_since', { ascending: true, nullsFirst: true });
        break;
      default: // newest
        query = query
          .order('is_pinned', { ascending: false })
          .order('last_message_at', { ascending: false, nullsFirst: false });
    }

    const { data, error } = await query;
    if (error) {
      console.error('Conversations query error:', error);
      return apiServerError();
    }

    let conversations = data || [];

    // Label filter: filter conversations by label assignment (post-query join)
    if (labelFilter) {
      const { data: labelAssignments } = await supabase
        .from('pyra_conversation_label_assignments')
        .select('conversation_id')
        .eq('label_id', labelFilter);

      const labelConvIds = new Set((labelAssignments || []).map(a => a.conversation_id));
      conversations = conversations.filter(c => labelConvIds.has(c.id));
    }

    // Fetch labels for all returned conversations
    const convIds = conversations.map(c => c.id).filter(Boolean);
    const labelsMap: Record<string, Array<{ id: string; name: string; name_ar: string; color: string }>> = {};

    if (convIds.length > 0) {
      const { data: allAssignments } = await supabase
        .from('pyra_conversation_label_assignments')
        .select('conversation_id, pyra_conversation_labels(id, name, name_ar, color)')
        .in('conversation_id', convIds);

      if (allAssignments) {
        for (const row of allAssignments) {
          const cid = row.conversation_id;
          if (!labelsMap[cid]) labelsMap[cid] = [];
          if (row.pyra_conversation_labels) {
            labelsMap[cid].push(
              row.pyra_conversation_labels as unknown as { id: string; name: string; name_ar: string; color: string }
            );
          }
        }
      }
    }

    // Enrich conversations with labels and typing state
    const now = Date.now();
    const enriched = conversations.map(c => {
      // Check typing state from in-memory map
      const typingEntry = c.remote_jid ? typingMap.get(c.remote_jid) : undefined;
      const isTyping = typingEntry
        ? typingEntry.typing && (now - typingEntry.updatedAt < 10_000)
        : false;

      return {
        ...c,
        labels: labelsMap[c.id] || [],
        is_typing: isTyping,
      };
    });

    // Counts per status for tab badges (scoped to agent for non-admins)
    const nowIso = new Date().toISOString();

    // Helper: build a count query with optional agent scoping
    function scopedCount() {
      let q = supabase.from('pyra_whatsapp_conversations').select('id', { count: 'exact', head: true })
        .is('merged_into_id', null);
      if (!isAdmin) q = q.eq('assigned_to', username);
      return q;
    }

    // CR-T2 — server-computed inbox chip counts (needs_reply / unassigned /
    // late), consumed by the redesigned top bar's quick-filter chips. Their
    // base scope MIRRORS the list's own-number exclusion + merged exclusion
    // + instance filter (own-number/merged are baked into buildBaseQuery();
    // instance is applied inside it too) — but NEVER the status-tab/label/
    // team/priority/search filters, so the chips read as global counts for
    // the current line+scope, not "counts within whatever tab is open".
    //
    // Supabase query builders are lazy and mutate in place on every
    // .eq()/.is()/... call, so forking one builder instance into two
    // queries would corrupt both. buildBaseQuery() returns a FRESH builder
    // every call — never reused across queries.
    function buildBaseQuery() {
      let q = supabase
        .from('pyra_whatsapp_conversations')
        .select('id, status, assigned_to, last_customer_message_at, last_agent_message_at, last_message_at')
        .or('contact_phone.is.null,contact_phone.neq.971565799505')
        .is('merged_into_id', null);
      if (instanceFilter && instanceFilter !== 'all') {
        q = q.eq('instance_name', instanceFilter);
      }
      if (!isAdmin) {
        q = q.eq('assigned_to', username);
      }
      return q;
    }

    // needs_reply / late: PostgREST cannot compare two columns
    // (last_customer_message_at vs last_agent_message_at) in one filter, so
    // we pull a light projection of OPEN conversations that have a customer
    // message on record and evaluate needsReply()/waitingMinutes() — the
    // SAME predicate CR-T1 gave the client-side inbox split, reused here
    // rather than re-derived — in JS. Capped at 2000 rows; if the cap is
    // ever actually hit, warn loudly instead of silently undercounting
    // (same pattern as /api/mobile/my-day's going-cold fetch).
    const INBOX_COUNTS_PROJECTION_CAP = 2000;
    const { data: projectionRows, error: projectionError } = await buildBaseQuery()
      .eq('status', CONVERSATION_STATUS.OPEN)
      .not('last_customer_message_at', 'is', null)
      .limit(INBOX_COUNTS_PROJECTION_CAP);

    if (projectionError) {
      console.error('Conversations inbox-counts projection error:', projectionError);
    }
    if (projectionRows && projectionRows.length === INBOX_COUNTS_PROJECTION_CAP) {
      console.warn(
        `[conversations] inbox-counts projection hit the ${INBOX_COUNTS_PROJECTION_CAP}-row cap — ` +
        'needs_reply/late counts may undercount for this scope'
      );
    }

    const nowMs = Date.now();
    let needsReplyCount = 0;
    let lateCount = 0;
    for (const row of projectionRows || []) {
      if (!needsReply(row)) continue;
      needsReplyCount++;
      const mins = waitingMinutes(row, nowMs);
      if (mins !== null && waitingSeverity(mins) === 'late') lateCount++;
    }

    // unassigned: a true head-count, deliberately WITHOUT the agent-scope
    // filter that buildBaseQuery() applies — even for a non-admin this chip
    // shows the system-wide open+unassigned pickup pool, not "my
    // unassigned" (which is always 0 — an agent's own conversations are,
    // by definition, assigned to them). needs_reply/late above stay scoped
    // to the agent; this one field intentionally does not. This also
    // replaces the old admin-only "unassigned" tab-badge count (which
    // counted any non-resolved status and never matched what the tab
    // itself queries — status='open' + assigned_to is null); the new
    // definition matches the tab's real query.
    let unassignedCountQuery = supabase
      .from('pyra_whatsapp_conversations')
      .select('id', { count: 'exact', head: true })
      .or('contact_phone.is.null,contact_phone.neq.971565799505')
      .is('merged_into_id', null)
      .eq('status', CONVERSATION_STATUS.OPEN)
      .is('assigned_to', null);
    if (instanceFilter && instanceFilter !== 'all') {
      unassignedCountQuery = unassignedCountQuery.eq('instance_name', instanceFilter);
    }

    const [openRes, pendingRes, resolvedRes, unassignedCountRes, snoozedRes, groupRes] = await Promise.all([
      scopedCount()
        .eq('status', CONVERSATION_STATUS.OPEN)
        .or('snoozed_until.is.null,snoozed_until.lte.' + nowIso),
      scopedCount()
        .eq('status', CONVERSATION_STATUS.PENDING)
        .or('snoozed_until.is.null,snoozed_until.lte.' + nowIso),
      scopedCount()
        .eq('status', CONVERSATION_STATUS.RESOLVED),
      unassignedCountQuery,
      scopedCount()
        .gt('snoozed_until', nowIso),
      // Group conversations count (non-resolved)
      scopedCount()
        .eq('is_group', true)
        .neq('status', CONVERSATION_STATUS.RESOLVED),
    ]);

    if (unassignedCountRes.error) {
      console.error('Conversations unassigned-count error:', unassignedCountRes.error);
    }

    const tabCounts = {
      open: openRes.count || 0,
      pending: pendingRes.count || 0,
      resolved: resolvedRes.count || 0,
      unassigned: unassignedCountRes.count || 0,
      snoozed: snoozedRes.count || 0,
      groups: groupRes.count || 0,
      needs_reply: needsReplyCount,
      late: lateCount,
    };

    return apiSuccess(enriched, { counts: tabCounts });
  } catch (err) {
    console.error('GET /conversations error:', err);
    return apiServerError();
  }
}
