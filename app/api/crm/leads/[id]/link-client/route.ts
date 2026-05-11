import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { canAccessLead } from '@/lib/auth/lead-scope';
import { generateId } from '@/lib/utils/id';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/crm/leads/[id]/link-client
//
// Permission:  leads.update  +  canAccessLead (two-step gate, mirrors PATCH)
//
// Purpose: links a lead to an existing pyra_clients row (the "this lead is
// actually our existing client X" workflow). Used when a sales agent realizes
// mid-pipeline that the company they've been tracking is already a customer
// in the system under a different name/spelling.
//
// Phase 11.5 (Lead-Client Linking UI). Replaces the manual SQL workflow used
// for the Dr. Ahmed Mamoun precedent (activity row la_5a8173108128e943).
//
// Critical invariants:
//   - `is_converted` UNCHANGED — this is NOT a conversion. Promotion to
//     pyra_clients goes through /convert-to-customer instead.
//   - `lead.name` UNCHANGED — name correction is a separate flow (v1.1 backlog).
//   - Lead stays in its current pipeline stage.
//   - activity_type reuses `field_updated` with metadata.field='client_id' so
//     the existing timeline renderer auto-produces the Arabic title — no new
//     activity_type constant required.
//
// Activity-log convention (locked Phase 11.5):
//   action_type uses the ENTITY_TYPES + ACTIVITY_ACTIONS pattern
//   (`${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}` → 'lead_update') for
//   pattern consistency with the PATCH + convert-to-customer routes.
//   Specificity ("what flavor of update?") lives in metadata.source.
// ────────────────────────────────────────────────────────────────────────────

interface LinkClientBody {
  client_id?: unknown;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // ── Trust boundary ──
    // `id` (route param) flows from the URL — user-controlled, but gated by
    //   canAccessLead() below (admin OR assigned_to == self).
    // `body.client_id` is admin/agent input — gated by the leads.update
    //   permission AND the pre-check SELECT on pyra_clients below.
    // All Supabase calls use parameterized .eq() — no raw SQL concat.

    const auth = await requireApiPermission('leads.update');
    if (isApiError(auth)) return auth;

    const { id: leadId } = await params;
    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(
      supabase,
      auth.pyraUser.username,
      auth.pyraUser.role,
      leadId,
    );
    if (!allowed) return apiForbidden('لا تملك صلاحية الوصول لهذا الـ Lead');

    const body = (await request.json().catch(() => null)) as LinkClientBody | null;
    if (!body) return apiValidationError('JSON body مطلوب');

    const rawClientId = body.client_id;
    if (typeof rawClientId !== 'string' || rawClientId.trim().length === 0) {
      return apiValidationError('client_id مطلوب');
    }
    const clientId = rawClientId.trim();

    // ── Load the lead (existence + current client_id + stage snapshot) ──
    const { data: lead, error: leadError } = await supabase
      .from('pyra_sales_leads')
      .select('id, client_id, stage_id')
      .eq('id', leadId)
      .maybeSingle();

    if (leadError) {
      console.error('link-client: lead lookup error:', leadError.message);
      return apiServerError();
    }
    if (!lead) return apiNotFound('lead not found');

    if (lead.client_id) {
      return apiValidationError(
        'هذا الـ Lead مرتبط بعميل بالفعل — استخدم SQL manual لإعادة الربط (Unlink UI في v1.1)',
      );
    }

    // ── Verify the target client exists ──
    const { data: client, error: clientError } = await supabase
      .from('pyra_clients')
      .select('id, name')
      .eq('id', clientId)
      .maybeSingle();

    if (clientError) {
      console.error('link-client: client lookup error:', clientError.message);
      return apiServerError();
    }
    if (!client) return apiValidationError('العميل غير موجود');

    // ── UPDATE pyra_sales_leads — only client_id + updated_at ──
    // is_converted and name are intentionally left untouched (see invariants).
    const { error: updateError } = await supabase
      .from('pyra_sales_leads')
      .update({ client_id: clientId, updated_at: new Date().toISOString() })
      .eq('id', leadId);

    if (updateError) {
      console.error('link-client: update error:', updateError.message);
      return apiServerError(`فشل ربط الـ Lead بالعميل: ${updateError.message}`);
    }

    // ── Lead timeline activity (visible in activity tab) ──
    // .then() is required — Supabase query builder is lazy thenable;
    // a bare void <builder> never executes (per CLAUDE.md note).
    supabase
      .from('pyra_lead_activities')
      .insert({
        id: generateId('la'),
        lead_id: leadId,
        activity_type: 'field_updated',
        description: 'تم ربط العميل المحتمل بحساب عميل موجود',
        metadata: {
          source: 'manual_link_via_ui',
          client_id: clientId,
          lead_stage_at_link: lead.stage_id,
          field: 'client_id',
        },
        created_by: auth.pyraUser.username,
      })
      .then(({ error: e }) => {
        if (e) console.error('[link-client activity] insert failed:', e.message);
      });

    // ── System audit log ──
    // Pattern: action_type uses ENTITY_TYPES + ACTIVITY_ACTIONS constants
    // ('lead_update'); the link-specific flavor lives in metadata.source.
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/crm/leads/${leadId}`,
      {
        lead_id: leadId,
        client_id: clientId,
        source: 'manual_link_via_ui',
      },
      request.headers.get('x-forwarded-for') ?? undefined,
    );

    return apiSuccess(
      {
        lead_id: leadId,
        client_id: clientId,
        client_name: client.name,
      },
      undefined,
      200,
    );
  } catch (err) {
    console.error('POST /api/crm/leads/[id]/link-client threw:', err);
    return apiServerError();
  }
}
