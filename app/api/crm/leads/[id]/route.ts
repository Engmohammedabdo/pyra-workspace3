import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiForbidden,
  apiServerError,
  apiValidationError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { canAccessLead } from '@/lib/auth/lead-scope';
import { hasPermission } from '@/lib/auth/rbac';
import { generateId } from '@/lib/utils/id';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { notify } from '@/lib/notifications/notify';

/**
 * GET /api/crm/leads/[id]
 *
 * Permission: leads.view
 * Scope: canAccessLead — admin or assigned_to == self.
 *
 * Returns: { lead, contracts, invoices, payments_summary, activity_count,
 *           follow_ups_pending, files_count }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiPermission('leads.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(supabase, auth.pyraUser.username, auth.pyraUser.role, id);
    if (!allowed) return apiForbidden('لا تملك صلاحية الوصول لهذا الـ Lead');

    const { data: lead, error } = await supabase
      .from('pyra_sales_leads')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('GET /api/crm/leads/[id] error:', error.message);
      return apiServerError();
    }
    if (!lead) return apiNotFound('Lead غير موجود');

    // Phase 11.5: when the lead is linked to a client, fetch the client's
    // name so the UI can render the "مرتبط بـ {client_name}" badge without
    // a second round trip. Skipped entirely when client_id is null.
    let clientName: string | null = null;
    if (lead.client_id) {
      const { data: client } = await supabase
        .from('pyra_clients')
        .select('name')
        .eq('id', lead.client_id)
        .maybeSingle();
      clientName = client?.name ?? null;
    }

    // Fan out the dependent reads in parallel.
    const [contractsRes, activityRes, followUpsRes] = await Promise.all([
      supabase
        .from('pyra_contracts')
        .select('id, title, status, contract_type, total_value, currency, start_date, end_date, retainer_amount, retainer_cycle, amount_billed, amount_collected')
        .eq('lead_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('pyra_lead_activities')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', id),
      supabase
        .from('pyra_sales_follow_ups')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', id)
        .eq('status', 'pending'),
    ]);

    const contracts = contractsRes.data ?? [];
    const contractIds = contracts.map((c) => c.id);

    let invoices: Array<{ id: string; contract_id: string | null; client_id: string | null; invoice_number: string | null; currency: string | null; total: number; status: string; due_date: string | null }> = [];
    let totalPaid = 0;
    if (contractIds.length > 0) {
      const { data: invs } = await supabase
        .from('pyra_invoices')
        .select('id, contract_id, client_id, invoice_number, currency, total, status, due_date')
        .in('contract_id', contractIds);
      invoices = invs ?? [];

      // Cash-basis: total paid via pyra_payments joined by invoice_id.
      const invoiceIds = invoices.map((i) => i.id);
      if (invoiceIds.length > 0) {
        const { data: payments } = await supabase
          .from('pyra_payments')
          .select('amount, invoice_id')
          .in('invoice_id', invoiceIds);
        for (const p of payments ?? []) totalPaid += Number(p.amount) || 0;
      }
    }

    return apiSuccess({
      lead: { ...lead, client_name: clientName },
      contracts,
      invoices,
      payments_summary: {
        total_paid: totalPaid,
        currency: lead.expected_value_currency || 'AED',
      },
      activity_count: activityRes.count ?? 0,
      follow_ups_pending: followUpsRes.count ?? 0,
      files_count: 0, // v1 — files surfaced via the dedicated file-index hook elsewhere
    });
  } catch (err) {
    console.error('GET /api/crm/leads/[id] threw:', err);
    return apiServerError();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/crm/leads/[id]
//
// Permission: leads.update + canAccessLead.
// `assigned_to` change additionally requires leads.assign.
// `stage_id` changes are NOT accepted here — they go through the dedicated
//   /move-stage endpoint (Phase 7) so the approval workflow can intercept
//   transitions to closed_won.
//
// Side effects:
//   - For each "field of interest" change → log a `field_updated` activity
//   - For an assigned_to change → also log `assignment_changed` + notify
//     the new owner
//   - On `win_probability` set → flip win_probability_overridden = true
//     (Q-BIZ-001 hybrid policy)
// ────────────────────────────────────────────────────────────────────────────

const PATCHABLE_KEYS = new Set([
  'name', 'phone', 'email', 'company',
  'lead_type', 'industry', 'deal_type',
  'expected_value', 'expected_value_currency', 'billing_cycle',
  'priority', 'notes', 'source',
  'contact_person', 'contact_role', 'company_size', 'decision_maker', 'budget_range',
  'last_contact_at', 'next_follow_up',
  'win_probability',
  'assigned_to',         // requires leads.assign
  'lost_reason',
  'custom_fields',
]);

const FIELDS_OF_INTEREST = new Set([
  'priority', 'expected_value', 'deal_type', 'billing_cycle', 'win_probability', 'lost_reason',
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiPermission('leads.update');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(supabase, auth.pyraUser.username, auth.pyraUser.role, id);
    if (!allowed) return apiForbidden('لا تملك صلاحية تعديل هذا الـ Lead');

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return apiValidationError('JSON body مطلوب');

    if ('stage_id' in body) {
      return apiValidationError('تغيير المرحلة يتم عبر /api/crm/leads/[id]/move-stage');
    }

    // Reassign requires elevated permission.
    if ('assigned_to' in body && !hasPermission(auth.pyraUser.rolePermissions, 'leads.assign')) {
      return apiForbidden('لا تملك صلاحية إعادة إسناد الـ Lead');
    }

    const updates: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (PATCHABLE_KEYS.has(key)) updates[key] = body[key];
    }
    if (Object.keys(updates).length === 0) return apiValidationError('لا توجد حقول للتحديث');

    // Manual win_probability override flips the flag (Q-BIZ-001).
    if ('win_probability' in updates) {
      updates.win_probability_overridden = true;
    }

    // Bring `updated_at` into sync explicitly — most rows have a default
    // but we want this PATCH to bump it deterministically.
    updates.updated_at = new Date().toISOString();

    // Snapshot the prior values for the fields we care about.
    const { data: before } = await supabase
      .from('pyra_sales_leads')
      .select(['name', 'assigned_to', 'priority', 'expected_value', 'deal_type', 'billing_cycle', 'win_probability', 'lost_reason'].join(', '))
      .eq('id', id)
      .maybeSingle();
    if (!before) return apiNotFound('Lead غير موجود');

    const { data: lead, error: updErr } = await supabase
      .from('pyra_sales_leads')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    if (updErr || !lead) {
      console.error('PATCH /api/crm/leads/[id] update error:', updErr?.message);
      return apiServerError(`فشل تحديث الـ Lead${updErr?.message ? ': ' + updErr.message : ''}`);
    }

    // ── Activity log: one row per "field of interest" change ──
    // Supabase query builder is lazy; bare `void <builder>` never triggers
    // execution. Always attach .then().
    const beforeRow = before as unknown as Record<string, unknown>;
    for (const key of Object.keys(updates)) {
      if (!FIELDS_OF_INTEREST.has(key)) continue;
      const oldValue = beforeRow[key];
      const newValue = updates[key];
      if (oldValue === newValue) continue;
      void supabase
        .from('pyra_lead_activities')
        .insert({
          id: generateId('la'),
          lead_id: id,
          activity_type: 'field_updated',
          description: null,
          metadata: { field: key, old_value: oldValue ?? null, new_value: newValue ?? null },
          created_by: auth.pyraUser.username,
        })
        .then(({ error: e }) => {
          if (e) console.error('[field_updated activity] insert failed:', e.message);
        });
    }

    // ── Assignment change: dedicated activity + notify the new owner ──
    if (
      'assigned_to' in updates &&
      typeof updates.assigned_to === 'string' &&
      updates.assigned_to !== beforeRow.assigned_to
    ) {
      const newOwner = updates.assigned_to;
      void supabase
        .from('pyra_lead_activities')
        .insert({
          id: generateId('la'),
          lead_id: id,
          activity_type: 'assignment_changed',
          description: null,
          metadata: { from_user: beforeRow.assigned_to ?? null, to_user: newOwner },
          created_by: auth.pyraUser.username,
        })
        .then(({ error: e }) => {
          if (e) console.error('[assignment_changed activity] insert failed:', e.message);
        });
      if (newOwner && newOwner !== auth.pyraUser.username) {
        void notify(supabase, {
          to: newOwner,
          type: 'lead_transferred',
          title: 'تم تحويل Lead لك',
          message: `${auth.pyraUser.display_name} حوّل Lead "${(lead as { name: string }).name}" إليك`,
          link: `/dashboard/crm/leads/${id}`,
          entity: { type: ENTITY_TYPES.LEAD, id },
          from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
        });
      }
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/crm/leads/${id}`,
      { lead_id: id, fields: Object.keys(updates) },
      request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({ lead });
  } catch (err) {
    console.error('PATCH /api/crm/leads/[id] threw:', err);
    return apiServerError();
  }
}
