import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiError,
  apiNotFound,
  apiForbidden,
  apiServerError,
  apiValidationError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { canApproveFor } from '@/lib/auth/team-scope';
import { generateId } from '@/lib/utils/id';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { notify } from '@/lib/notifications/notify';
import { PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/crm/approvals/[lead_id]/approve
//
// Permission: leads.approve
// Scope:      canApproveFor(approver, lead.assigned_to)   ← admin OR direct manager
// State:      lead.stage_id MUST equal stg_contract_signed (else 422)
//
// Side effects:
//   - UPDATE lead { stage_id: stg_closed_won, is_converted: true,
//                   converted_at: now(), win_probability: 100,
//                   win_probability_overridden: true }
//   - INSERT activity 'closed_won_approved' with metadata
//     { approved_by, approved_at }
//   - NOTIFY lead.assigned_to → 'lead_closed_won_approved'
//   - logActivity audit row
// ────────────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lead_id: string }> },
) {
  try {
    const auth = await requireApiPermission('leads.approve');
    if (isApiError(auth)) return auth;

    const { lead_id: leadId } = await params;
    const supabase = createServiceRoleClient();

    // Fetch the lead — need stage_id, assigned_to, name for the notification.
    const { data: leadBefore, error: fetchErr } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, stage_id, assigned_to, is_converted')
      .eq('id', leadId)
      .maybeSingle();
    if (fetchErr) {
      console.error('approve fetch error:', fetchErr.message);
      return apiServerError();
    }
    if (!leadBefore) return apiNotFound('Lead غير موجود');

    if (leadBefore.stage_id !== PIPELINE_STAGE_IDS.CONTRACT_SIGNED) {
      return apiValidationError(
        'الـ Lead ليس في مرحلة "تم توقيع العقد" — لا يوجد طلب اعتماد فعّال',
      );
    }

    // Scope gate — admin always passes; non-admin must be direct manager.
    if (!leadBefore.assigned_to) {
      return apiValidationError('الـ Lead غير مسند لأحد — لا يمكن اعتماده');
    }
    const allowed = await canApproveFor(
      supabase,
      auth.pyraUser.username,
      auth.pyraUser.role,
      leadBefore.assigned_to,
    );
    if (!allowed) {
      return apiForbidden('يمكنك فقط اعتماد leads فريقك المباشر');
    }

    const approvedAt = new Date().toISOString();
    const { data: lead, error: updErr } = await supabase
      .from('pyra_sales_leads')
      .update({
        stage_id: PIPELINE_STAGE_IDS.CLOSED_WON,
        is_converted: true,
        converted_at: approvedAt,
        win_probability: 100,
        win_probability_overridden: true,
        updated_at: approvedAt,
      })
      .eq('id', leadId)
      // Compare-and-swap: only approve a lead STILL in contract_signed. A
      // concurrent approve/reject/move that changed the stage → 0 rows → 409,
      // so a double-approve or approve-vs-reject race can't blend two terminal
      // states (e.g. is_converted=true sitting in the Negotiation column).
      .eq('stage_id', PIPELINE_STAGE_IDS.CONTRACT_SIGNED)
      .select('*')
      .maybeSingle();
    if (updErr) {
      console.error('approve update error:', updErr.message);
      return apiServerError(`فشل اعتماد الـ Lead: ${updErr.message}`);
    }
    if (!lead) {
      return apiError('تغيّرت حالة الـ Lead — حدّث الصفحة وحاول مرة أخرى', 409);
    }

    // Activity row — fire-and-forget but with .then() so it actually executes.
    void supabase
      .from('pyra_lead_activities')
      .insert({
        id: generateId('la'),
        lead_id: leadId,
        activity_type: 'closed_won_approved',
        description: null,
        metadata: { approved_by: auth.pyraUser.username, approved_at: approvedAt },
        created_by: auth.pyraUser.username,
      })
      .then(({ error: e }) => {
        if (e) console.error('[closed_won_approved activity] insert failed:', e.message);
      });

    // Notify the original sales agent.
    if (leadBefore.assigned_to !== auth.pyraUser.username) {
      void notify(supabase, {
        to: leadBefore.assigned_to,
        type: 'lead_closed_won_approved',
        title: 'تم اعتماد إغلاق الصفقة',
        message: `${auth.pyraUser.display_name} اعتمد إغلاق "${leadBefore.name}" — مبروك 🎉`,
        link: `/dashboard/crm/leads/${leadId}`,
        entity: { type: ENTITY_TYPES.LEAD, id: leadId },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `lead_${ACTIVITY_ACTIONS.APPROVE}`,
      `/dashboard/crm/leads/${leadId}`,
      { lead_id: leadId, decision: 'approve', assigned_to: leadBefore.assigned_to },
      request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({ lead });
  } catch (err) {
    console.error('POST /api/crm/approvals/[lead_id]/approve threw:', err);
    return apiServerError();
  }
}
