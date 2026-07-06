import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
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
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('leads.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(supabase, auth.pyraUser.username, auth.pyraUser.role, id);
    if (!allowed) return apiForbidden(t('crm.leadAccessDenied'));

    const { data: lead, error } = await supabase
      .from('pyra_sales_leads')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('GET /api/crm/leads/[id] error:', error.message);
      return apiServerError();
    }
    if (!lead) return apiNotFound(t('crm.leadNotFound'));

    // Phase 11.5: when the lead is linked to a client, fetch the client's
    // name so the UI can render the "مرتبط بـ {client_name}" badge without // i18n-exempt: doc comment
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

    // Contracts: union by lead_id OR the lead's client_id — `lead_id` is written
    // by no code path, so a converted customer's contracts (created in finance
    // against client_id) were invisible on the Deals tab. Mirror of the dossier
    // union.
    const contractOr = lead.client_id
      ? `lead_id.eq.${id},client_id.eq.${lead.client_id}`
      : `lead_id.eq.${id}`;
    // Fan out the dependent reads in parallel.
    const [contractsRes, activityRes, followUpsRes] = await Promise.all([
      supabase
        .from('pyra_contracts')
        .select('id, title, status, contract_type, total_value, currency, start_date, end_date, retainer_amount, retainer_cycle, amount_billed, amount_collected')
        .or(contractOr)
        .order('created_at', { ascending: false }),
      supabase
        .from('pyra_lead_activities')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', id),
      supabase
        .from('pyra_sales_follow_ups')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', id)
        .in('status', ['pending', 'overdue']),
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

// Editing the lead's OWN data — identity, contact, and commercial fields — is
// ADMIN-ONLY via `leads.edit_core` (see the gate in PATCH below). Agents keep
// their workflow untouched: activities/notes (/activities), stage moves
// (/move-stage), and follow-ups (/follow-ups) live on separate routes.
// `assigned_to` is excluded here because it has its own `leads.assign` gate.
const CORE_FIELDS = new Set(
  [...PATCHABLE_KEYS].filter((k) => k !== 'assigned_to'),
);

// numeric columns are read back from PostgREST as STRINGS ("5000.00") but sent as
// JS numbers — compare them numerically so the audit doesn't record phantom
// changes when only the representation differs.
const NUMERIC_FIELDS = new Set(['expected_value', 'win_probability']);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('leads.update');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(supabase, auth.pyraUser.username, auth.pyraUser.role, id);
    if (!allowed) return apiForbidden(t('crm.leadEditPermission'));

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return apiValidationError(t('common.jsonBodyRequired'));

    if ('stage_id' in body) {
      return apiValidationError(t('crm.stageChangeViaMoveStage'));
    }

    // Reassign requires elevated permission.
    if ('assigned_to' in body && !hasPermission(auth.pyraUser.rolePermissions, 'leads.assign')) {
      return apiForbidden(t('crm.leadReassignPermission'));
    }

    // Editing any of the lead's own data fields is ADMIN-ONLY (leads.edit_core).
    // Agents reach this handler via leads.update (for reassign) but cannot touch
    // name/phone/email/company/notes/value/etc. Admin passes via the `*` wildcard.
    if (
      Object.keys(body).some((k) => CORE_FIELDS.has(k)) &&
      !hasPermission(auth.pyraUser.rolePermissions, 'leads.edit_core')
    ) {
      return apiForbidden(t('crm.leadEditCorePermission'));
    }

    const updates: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (PATCHABLE_KEYS.has(key)) updates[key] = body[key];
    }
    if (Object.keys(updates).length === 0) return apiValidationError(t('crm.noFieldsToUpdate'));

    // Manual win_probability override flips the flag (Q-BIZ-001).
    if ('win_probability' in updates) {
      updates.win_probability_overridden = true;
    }

    // Bring `updated_at` into sync explicitly — most rows have a default
    // but we want this PATCH to bump it deterministically.
    updates.updated_at = new Date().toISOString();

    // Snapshot the prior values for ALL patchable fields so every change can be
    // recorded on the timeline with old/new values (GAP 1 — full field-edit audit).
    const { data: before } = await supabase
      .from('pyra_sales_leads')
      .select([...PATCHABLE_KEYS].join(', '))
      .eq('id', id)
      .maybeSingle();
    if (!before) return apiNotFound(t('crm.leadNotFound'));

    const { data: lead, error: updErr } = await supabase
      .from('pyra_sales_leads')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    if (updErr || !lead) {
      console.error('PATCH /api/crm/leads/[id] update error:', updErr?.message);
      return apiServerError(t('crm.leadUpdateFailed', { reason: updErr?.message ? ': ' + updErr.message : '' }));
    }

    // ── Activity log: one timeline row per CHANGED field (GAP 1 fix) ──
    // Every changed lead data field now leaves a `field_updated` trace so edits
    // to name/phone/email/company/notes/value are all visible on the timeline —
    // not just the former 6 "fields of interest". `assigned_to` is skipped here
    // because it gets its own dedicated `assignment_changed` activity below.
    // Supabase query builder is lazy; bare `void <builder>` never triggers
    // execution. Always attach .then().
    const beforeRow = before as unknown as Record<string, unknown>;
    for (const key of Object.keys(updates)) {
      if (!CORE_FIELDS.has(key)) continue; // skips assigned_to + updated_at + win_probability_overridden
      const oldValue = beforeRow[key] ?? null;
      const newValue = (updates[key] as unknown) ?? null;
      // Numeric-aware for numeric columns (string-from-DB vs number-from-body),
      // object-aware for custom_fields (jsonb), strict otherwise.
      const changed = NUMERIC_FIELDS.has(key)
        ? Number(oldValue ?? 0) !== Number(newValue ?? 0)
        : typeof oldValue === 'object' || typeof newValue === 'object'
          ? JSON.stringify(oldValue) !== JSON.stringify(newValue)
          : oldValue !== newValue;
      if (!changed) continue;
      void supabase
        .from('pyra_lead_activities')
        .insert({
          id: generateId('la'),
          lead_id: id,
          activity_type: 'field_updated',
          description: null,
          metadata: { field: key, old_value: oldValue, new_value: newValue },
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
          title: 'تم تحويل Lead لك', // i18n-exempt: notification content (Phase 8)
          message: `${auth.pyraUser.display_name} حوّل Lead "${(lead as { name: string }).name}" إليك`, // i18n-exempt: notification content (Phase 8)
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

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/crm/leads/[id]  — SOFT-archive (NOT a hard delete)
//
// Permission: leads.delete + canAccessLead (admin OR the lead's owner).
// Body: { unarchive?: boolean } — pass true to restore an archived lead.
//
// Sets pyra_sales_leads.archived_at (+ archived_by). Archived leads are hidden
// from the pipeline / list by default (GET filters archived_at IS NULL) but stay
// reachable by direct URL so they can be viewed and un-archived. Backing feature
// for the previously-inert `leads.delete` permission (migration 030).
// ────────────────────────────────────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('leads.delete');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(supabase, auth.pyraUser.username, auth.pyraUser.role, id);
    if (!allowed) return apiForbidden(t('crm.leadArchivePermission'));

    const body = (await request.json().catch(() => null)) as { unarchive?: boolean } | null;
    const unarchive = body?.unarchive === true;

    const { data: existing } = await supabase
      .from('pyra_sales_leads')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return apiNotFound(t('crm.leadNotFound'));

    const nowIso = new Date().toISOString();
    const { error: updErr } = await supabase
      .from('pyra_sales_leads')
      .update(
        unarchive
          ? { archived_at: null, archived_by: null, updated_at: nowIso }
          : { archived_at: nowIso, archived_by: auth.pyraUser.username, updated_at: nowIso },
      )
      .eq('id', id);
    if (updErr) {
      console.error('DELETE /api/crm/leads/[id] update error:', updErr.message);
      return apiServerError(unarchive ? t('crm.unarchiveFailed') : t('crm.archiveFailed'), updErr, request);
    }

    // Timeline activity (lazy-thenable → needs .then()).
    void supabase
      .from('pyra_lead_activities')
      .insert({
        id: generateId('la'),
        lead_id: id,
        activity_type: 'field_updated',
        description: unarchive ? 'تم إلغاء أرشفة الـ Lead' : 'تم أرشفة الـ Lead', // i18n-exempt: DB data
        metadata: { field: 'archived_at', source: unarchive ? 'unarchived' : 'archived' },
        created_by: auth.pyraUser.username,
      })
      .then(({ error: e }) => {
        if (e) console.error('[archive activity] insert failed:', e.message);
      });

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/crm/leads/${id}`,
      { lead_id: id, source: unarchive ? 'unarchived' : 'archived' },
      request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({ id, archived: !unarchive });
  } catch (err) {
    console.error('DELETE /api/crm/leads/[id] threw:', err);
    return apiServerError(t('crm.archiveFailed'), err, request);
  }
}
