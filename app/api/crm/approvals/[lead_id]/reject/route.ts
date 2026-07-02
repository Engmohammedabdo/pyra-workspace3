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
import { PIPELINE_STAGE_IDS, STAGE_DEFAULT_WIN_PROBABILITY } from '@/lib/constants/statuses';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/crm/approvals/[lead_id]/reject
//
// Permission: leads.approve
// Scope:      canApproveFor(approver, lead.assigned_to)
// State:      lead.stage_id MUST equal stg_contract_signed (else 422)
//
// Body:
//   { reason: string }   ← required, becomes the rejection note in the
//                          activity timeline + the notification message.
//
// Side effects:
//   - UPDATE lead { stage_id: stg_negotiation }
//     win_probability falls back to stg_negotiation default unless the
//     agent had an override on file (Q-BIZ-001 hybrid).
//   - INSERT activity 'closed_won_rejected' with metadata
//     { rejected_by, rejected_at, reason }
//   - NOTIFY lead.assigned_to → 'lead_closed_won_rejected'  (message = reason)
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

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const reason = body && typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) {
      return apiValidationError('سبب الرفض مطلوب (reason)');
    }

    const { data: leadBefore, error: fetchErr } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, stage_id, assigned_to, win_probability, win_probability_overridden')
      .eq('id', leadId)
      .maybeSingle();
    if (fetchErr) {
      console.error('reject fetch error:', fetchErr.message);
      return apiServerError();
    }
    if (!leadBefore) return apiNotFound('Lead غير موجود');

    if (leadBefore.stage_id !== PIPELINE_STAGE_IDS.CONTRACT_SIGNED) {
      return apiValidationError(
        'الـ Lead ليس في مرحلة "تم توقيع العقد" — لا يوجد طلب اعتماد فعّال',
      );
    }

    if (!leadBefore.assigned_to) {
      return apiValidationError('الـ Lead غير مسند لأحد — لا يمكن رفضه');
    }
    const allowed = await canApproveFor(
      supabase,
      auth.pyraUser.username,
      auth.pyraUser.role,
      leadBefore.assigned_to,
    );
    if (!allowed) {
      return apiForbidden('يمكنك فقط رفض leads فريقك المباشر');
    }

    // Drop back to negotiation. Win probability follows Q-BIZ-001 hybrid.
    const updates: Record<string, unknown> = {
      stage_id: PIPELINE_STAGE_IDS.NEGOTIATION,
      updated_at: new Date().toISOString(),
      // Defensive: a rejected deal must NOT carry conversion state. Normally a
      // contract_signed lead isn't converted yet, but if a racing approve set
      // these, reject clears them so a "customer" can never survive in the
      // Negotiation column (the CAS below also blocks that race).
      is_converted: false,
      converted_at: null,
    };
    if (!leadBefore.win_probability_overridden) {
      updates.win_probability = STAGE_DEFAULT_WIN_PROBABILITY[PIPELINE_STAGE_IDS.NEGOTIATION];
    }

    const { data: lead, error: updErr } = await supabase
      .from('pyra_sales_leads')
      .update(updates)
      .eq('id', leadId)
      // Compare-and-swap: only reject a lead STILL in contract_signed.
      .eq('stage_id', PIPELINE_STAGE_IDS.CONTRACT_SIGNED)
      .select('*')
      .maybeSingle();
    if (updErr) {
      console.error('reject update error:', updErr.message);
      return apiServerError(`فشل رفض الـ Lead: ${updErr.message}`);
    }
    if (!lead) {
      return apiError('تغيّرت حالة الـ Lead — حدّث الصفحة وحاول مرة أخرى', 409);
    }

    const rejectedAt = new Date().toISOString();
    void supabase
      .from('pyra_lead_activities')
      .insert({
        id: generateId('la'),
        lead_id: leadId,
        activity_type: 'closed_won_rejected',
        description: reason,
        metadata: { rejected_by: auth.pyraUser.username, rejected_at: rejectedAt, reason },
        created_by: auth.pyraUser.username,
      })
      .then(({ error: e }) => {
        if (e) console.error('[closed_won_rejected activity] insert failed:', e.message);
      });

    if (leadBefore.assigned_to !== auth.pyraUser.username) {
      void notify(supabase, {
        to: leadBefore.assigned_to,
        type: 'lead_closed_won_rejected',
        title: 'تم رفض إغلاق الصفقة',
        message: `${auth.pyraUser.display_name} رفض إغلاق "${leadBefore.name}" — السبب: ${reason}`,
        link: `/dashboard/crm/leads/${leadId}`,
        entity: { type: ENTITY_TYPES.LEAD, id: leadId },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `lead_${ACTIVITY_ACTIONS.REJECT}`,
      `/dashboard/crm/leads/${leadId}`,
      { lead_id: leadId, decision: 'reject', reason, assigned_to: leadBefore.assigned_to },
      request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({ lead });
  } catch (err) {
    console.error('POST /api/crm/approvals/[lead_id]/reject threw:', err);
    return apiServerError();
  }
}
