import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isSuperAdmin } from '@/lib/auth/rbac';
import { WA_CONVERSATION_FIELDS } from '@/lib/supabase/fields';
import { CONVERSATION_STATUS } from '@/lib/constants/statuses';
import { typingMap } from '@/lib/whatsapp/typing-map';

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

    // Search by contact name or phone (sanitize PostgREST special chars)
    const safeSearch = search.replace(/[,().%*]/g, '');
    if (safeSearch) {
      query = query.or(`contact_name.ilike.%${safeSearch}%,contact_phone.ilike.%${safeSearch}%`);
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

    const [openRes, pendingRes, resolvedRes, unassignedRes, snoozedRes, groupRes] = await Promise.all([
      scopedCount()
        .eq('status', CONVERSATION_STATUS.OPEN)
        .or('snoozed_until.is.null,snoozed_until.lte.' + nowIso),
      scopedCount()
        .eq('status', CONVERSATION_STATUS.PENDING)
        .or('snoozed_until.is.null,snoozed_until.lte.' + nowIso),
      scopedCount()
        .eq('status', CONVERSATION_STATUS.RESOLVED),
      isAdmin
        ? supabase.from('pyra_whatsapp_conversations').select('id', { count: 'exact', head: true })
            .is('assigned_to', null)
            .is('merged_into_id', null)
            .neq('status', CONVERSATION_STATUS.RESOLVED)
        : Promise.resolve({ count: 0 }), // Agents don't see unassigned tab
      scopedCount()
        .gt('snoozed_until', nowIso),
      // Group conversations count (non-resolved)
      scopedCount()
        .eq('is_group', true)
        .neq('status', CONVERSATION_STATUS.RESOLVED),
    ]);

    const tabCounts = {
      open: openRes.count || 0,
      pending: pendingRes.count || 0,
      resolved: resolvedRes.count || 0,
      unassigned: unassignedRes.count || 0,
      snoozed: snoozedRes.count || 0,
      groups: groupRes.count || 0,
    };

    return apiSuccess(enriched, { counts: tabCounts });
  } catch (err) {
    console.error('GET /conversations error:', err);
    return apiServerError();
  }
}
