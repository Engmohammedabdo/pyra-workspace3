import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { generateId } from '@/lib/utils/id';

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/crm/customers/[lead_id]/portal-access
//
// Permission:  leads.manage
//
// Toggles the portal_active flag on the linked pyra_clients row. Per the
// Phase 9 Q9-2 (δ) decision, this endpoint never creates or destroys the
// pyra_clients row — that's convert-to-customer's job. Here we only flip
// a boolean. Idempotent: PATCH with the same value is a no-op (still 200).
//
// State checks:
//   1. Lead exists                              → 404
//   2. lead.client_id exists                    → 422 (must convert first)
//
// Side effects:
//   - UPDATE pyra_clients.portal_active
//   - logActivity → field_updated
//
// Body:
//   { enabled: boolean }
//
// Response:
//   { ok: true, data: { lead_id, client_id, portal_active } }
// ────────────────────────────────────────────────────────────────────────────

interface PortalAccessBody {
  enabled?: unknown;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ lead_id: string }> },
) {
  try {
    const auth = await requireApiPermission('leads.manage');
    if (isApiError(auth)) return auth;

    const { lead_id: leadId } = await params;
    const supabase = createServiceRoleClient();

    // ── Body validation ──
    const body = (await request.json().catch(() => null)) as PortalAccessBody | null;
    if (!body) return apiValidationError('JSON body مطلوب');
    if (typeof body.enabled !== 'boolean') {
      return apiValidationError('enabled (boolean) مطلوب');
    }
    const enabled: boolean = body.enabled;

    // ── State: load lead + verify client linkage ──
    const { data: lead, error: leadError } = await supabase
      .from('pyra_sales_leads')
      .select('id, client_id')
      .eq('id', leadId)
      .maybeSingle();

    if (leadError) {
      console.error('portal-access: lead lookup error:', leadError);
      return apiServerError();
    }
    if (!lead) return apiNotFound('العميل المحتمل غير موجود');
    if (!lead.client_id) {
      return apiValidationError(
        'العميل لم يُحوّل بعد إلى عميل دائم — استخدم convert-to-customer أولاً',
      );
    }

    // ── UPDATE flag ──
    const { error: updateError } = await supabase
      .from('pyra_clients')
      .update({
        portal_active: enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lead.client_id);

    if (updateError) {
      console.error('portal-access: pyra_clients update error:', updateError.message);
      return apiServerError();
    }

    // ── Lead timeline activity (visible in activity tab) ──
    // .then() is required to actually fire the lazy thenable — see CLAUDE.md
    // / MEMORY.md note on the void supabase.insert() bug.
    supabase
      .from('pyra_lead_activities')
      .insert({
        id: generateId('la'),
        lead_id: leadId,
        activity_type: 'field_updated',
        description: enabled
          ? 'تم تفعيل وصول العميل للبورتال'
          : 'تم إيقاف وصول العميل للبورتال',
        metadata: {
          portal_active_changed: enabled,
          client_id: lead.client_id,
        },
        created_by: auth.pyraUser.username,
      })
      .then(({ error: e }) => {
        if (e) console.error('[portal-access activity] insert failed:', e.message);
      });

    // ── System audit log (fire-and-forget) ──
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `lead_${ACTIVITY_ACTIONS.UPDATE}_portal_access`,
      `/dashboard/crm/customers/${leadId}`,
      { lead_id: leadId, client_id: lead.client_id, portal_active: enabled },
      request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({
      lead_id: leadId,
      client_id: lead.client_id,
      portal_active: enabled,
    });
  } catch (err) {
    console.error('PATCH /api/crm/customers/[lead_id]/portal-access threw:', err);
    return apiServerError();
  }
}
