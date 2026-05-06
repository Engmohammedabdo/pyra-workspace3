import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDirectReports } from '@/lib/auth/team-scope';
import { PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';

/**
 * GET /api/crm/approvals/pending
 *
 * Permission: leads.approve
 * Scope:
 *   - admin → all leads in stg_contract_signed
 *   - manager → only leads whose assigned_to is one of my direct reports
 *
 * Returns leads awaiting Closed Won approval, plus the activity row that
 * triggered the request (closed_won_pending) so the UI can show the
 * attached contract/invoice id from its metadata.
 */
export async function GET() {
  try {
    const auth = await requireApiPermission('leads.approve');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const role = auth.pyraUser.role;
    const username = auth.pyraUser.username;

    let q = supabase
      .from('pyra_sales_leads')
      .select('id, name, phone, company, assigned_to, stage_id, expected_value, expected_value_currency, deal_type, last_contact_at, updated_at')
      .eq('stage_id', PIPELINE_STAGE_IDS.CONTRACT_SIGNED)
      .order('updated_at', { ascending: false });

    if (role !== 'admin') {
      const reports = await getDirectReports(supabase, username);
      if (reports.length === 0) return apiSuccess({ approvals: [] });
      q = q.in('assigned_to', reports);
    }

    const { data: leads, error } = await q;
    if (error) {
      console.error('GET /api/crm/approvals/pending error:', error.message);
      return apiServerError();
    }
    const rows = leads ?? [];
    if (rows.length === 0) return apiSuccess({ approvals: [] });

    // Fetch the most recent closed_won_pending activity per lead to surface
    // the attached contract/invoice id and who requested.
    const ids = rows.map((l) => l.id);
    const { data: pendingActs } = await supabase
      .from('pyra_lead_activities')
      .select('lead_id, metadata, created_by, created_at')
      .in('lead_id', ids)
      .eq('activity_type', 'closed_won_pending')
      .order('created_at', { ascending: false });

    const latestPerLead = new Map<string, { metadata: unknown; created_by: string | null; created_at: string }>();
    for (const a of pendingActs ?? []) {
      if (!latestPerLead.has(a.lead_id)) {
        latestPerLead.set(a.lead_id, {
          metadata: a.metadata,
          created_by: a.created_by,
          created_at: a.created_at,
        });
      }
    }

    const usernames = Array.from(new Set(rows.map((r) => r.assigned_to).filter((x): x is string => !!x)));
    const { data: users } = usernames.length
      ? await supabase
          .from('pyra_users')
          .select('username, display_name')
          .in('username', usernames)
      : { data: [] as Array<{ username: string; display_name: string }> };
    const userMap = new Map((users ?? []).map((u) => [u.username, u.display_name]));

    const approvals = rows.map((l) => ({
      ...l,
      assigned_display_name: l.assigned_to ? userMap.get(l.assigned_to) ?? l.assigned_to : null,
      pending_request: latestPerLead.get(l.id) ?? null,
    }));

    return apiSuccess({ approvals });
  } catch (err) {
    console.error('GET /api/crm/approvals/pending threw:', err);
    return apiServerError();
  }
}
