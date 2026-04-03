import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isSuperAdmin } from '@/lib/auth/rbac';
import { WA_CONVERSATION_FIELDS } from '@/lib/supabase/fields';

/**
 * GET /api/dashboard/sales/whatsapp/conversations
 * Shared Inbox — returns conversations from pyra_whatsapp_conversations table.
 *
 * Query params:
 *   status   = open | pending | resolved | all (default: open)
 *   assigned = me | unassigned | all (default: all)
 *   search   = contact name or phone search
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

  const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
  const username = auth.pyraUser.username;

  try {
    // Exclude our own number from conversations list
    const OWN_PHONE = '971565799505';

    let query = supabase
      .from('pyra_whatsapp_conversations')
      .select(WA_CONVERSATION_FIELDS)
      .neq('contact_phone', OWN_PHONE)
      .order('is_pinned', { ascending: false })
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    // Status filter
    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
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
      // Agent: sees only their assigned + unassigned
      if (assignedFilter === 'me') {
        query = query.eq('assigned_to', username);
      } else if (assignedFilter === 'unassigned') {
        query = query.is('assigned_to', null);
      } else {
        // Default for agent: assigned to me OR unassigned
        query = query.or(`assigned_to.eq.${username},assigned_to.is.null`);
      }
    }

    // Search by contact name or phone
    if (search) {
      query = query.or(`contact_name.ilike.%${search}%,contact_phone.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Conversations query error:', error);
      return apiServerError();
    }

    // Counts per status for tab badges
    const [openRes, pendingRes, resolvedRes, unassignedRes] = await Promise.all([
      supabase.from('pyra_whatsapp_conversations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('pyra_whatsapp_conversations').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('pyra_whatsapp_conversations').select('id', { count: 'exact', head: true }).eq('status', 'resolved'),
      supabase.from('pyra_whatsapp_conversations').select('id', { count: 'exact', head: true }).is('assigned_to', null).neq('status', 'resolved'),
    ]);

    const tabCounts = {
      open: openRes.count || 0,
      pending: pendingRes.count || 0,
      resolved: resolvedRes.count || 0,
      unassigned: unassignedRes.count || 0,
    };

    return apiSuccess(data || [], { counts: tabCounts });
  } catch (err) {
    console.error('GET /conversations error:', err);
    return apiServerError();
  }
}
