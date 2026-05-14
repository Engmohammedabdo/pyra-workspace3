import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import { logError } from '@/lib/observability/log-error';
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
import { getManagerOf } from '@/lib/auth/team-scope';
import { generateId } from '@/lib/utils/id';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { notify } from '@/lib/notifications/notify';
import {
  PIPELINE_STAGE_IDS,
  PIPELINE_STAGE_LABELS_AR,
  STAGE_DEFAULT_WIN_PROBABILITY,
  type PipelineStageId,
} from '@/lib/constants/statuses';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/crm/leads/[id]/move-stage
//
// Permission:  leads.move_stage   (own leads via canAccessLead; admin all)
// Admin override: leads.manage    (only path to reopen a stg_closed_won lead)
//
// Body:
//   {
//     to_stage_id:  PipelineStageId,                // required
//     attachment?:  { type: 'contract'|'invoice', id: string },
//     lost_reason?: string,
//     reopen_reason?: string,                       // required when reopening
//   }
//
// Validation matrix (Phase-7 architecture spec):
//   ┌───────────────────────────────────────┬───────────────────────────────────────┐
//   │ to_stage_id                           │ guard                                 │
//   ├───────────────────────────────────────┼───────────────────────────────────────┤
//   │ stg_closed_won                        │ ALWAYS rejected (use approve flow)    │
//   │ stg_contract_signed                   │ require attachment + verify exists    │
//   │ stg_closed_lost                       │ require non-empty lost_reason         │
//   │ <any> when from == stg_closed_won     │ require leads.manage + reopen_reason  │
//   │ <any other>                           │ no extra requirement                  │
//   └───────────────────────────────────────┴───────────────────────────────────────┘
//
// win_probability handling per Q-BIZ-001 hybrid:
//   - if lead.win_probability_overridden = true → preserve current value
//   - else                                       → STAGE_DEFAULT_WIN_PROBABILITY[to_stage_id]
//
// Side effects:
//   - UPDATE pyra_sales_leads (stage_id, win_probability, lost_reason, updated_at)
//   - INSERT pyra_lead_activities (closed_won_pending OR stage_change)
//   - NOTIFY (only on stg_contract_signed → manager;  reopen → original assignee)
//   - logActivity audit row
// ────────────────────────────────────────────────────────────────────────────

const VALID_STAGES = new Set<string>(Object.values(PIPELINE_STAGE_IDS));

interface AttachmentInput {
  type: 'contract' | 'invoice';
  id: string;
}

function isAttachment(value: unknown): value is AttachmentInput {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    (v.type === 'contract' || v.type === 'invoice') &&
    typeof v.id === 'string' &&
    v.id.trim().length > 0
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Phase 14.1 Commit 2 — hoisted for catch-block logError context.
  let authForLogging: ApiAuthResult | null = null;
  let leadIdForLogging: string | null = null;
  try {
    const auth = await requireApiPermission('leads.move_stage');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const { id } = await params;
    leadIdForLogging = id;
    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(supabase, auth.pyraUser.username, auth.pyraUser.role, id);
    if (!allowed) return apiForbidden('لا تملك صلاحية تحريك هذا الـ Lead');

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return apiValidationError('JSON body مطلوب');

    const toStage = typeof body.to_stage_id === 'string' ? body.to_stage_id.trim() : '';
    if (!toStage) return apiValidationError('to_stage_id مطلوب');
    if (!VALID_STAGES.has(toStage)) return apiValidationError(`to_stage_id غير معروف: ${toStage}`);

    // Direct moves to closed_won are never allowed via this endpoint —
    // the approval workflow owns that transition.
    if (toStage === PIPELINE_STAGE_IDS.CLOSED_WON) {
      return apiValidationError(
        'لا يمكن النقل المباشر إلى "فوز بالصفقة" — تتم عبر اعتماد المدير',
      );
    }

    // Fetch the lead — need from_stage, assigned_to, override flag, current win prob.
    const { data: leadBefore, error: fetchErr } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, stage_id, assigned_to, win_probability, win_probability_overridden, lost_reason, is_converted')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) {
      logError({
        error: fetchErr,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { lead_id: id, action: 'move-stage', stage: 'lead_fetch' },
      });
      console.error('move-stage fetch error:', fetchErr.message);
      return apiServerError();
    }
    if (!leadBefore) return apiNotFound('Lead غير موجود');

    const fromStage = leadBefore.stage_id as PipelineStageId | null;
    const toStageTyped = toStage as PipelineStageId;
    if (fromStage === toStageTyped) {
      return apiValidationError('الـ Lead بالفعل في هذه المرحلة');
    }

    // ── Reopen guard: from == closed_won requires leads.manage + reopen_reason
    const isReopen = fromStage === PIPELINE_STAGE_IDS.CLOSED_WON;
    let reopenReason: string | null = null;
    if (isReopen) {
      if (!hasPermission(auth.pyraUser.rolePermissions, 'leads.manage')) {
        return apiForbidden('لا يمكن إعادة فتح صفقة مغلقة');
      }
      reopenReason = typeof body.reopen_reason === 'string' ? body.reopen_reason.trim() : '';
      if (!reopenReason) {
        return apiValidationError('reopen_reason مطلوب لإعادة فتح صفقة مغلقة');
      }
    }

    // ── Attachment guard for contract_signed
    let attachment: AttachmentInput | null = null;
    let attachmentLabel: string | null = null;
    if (toStageTyped === PIPELINE_STAGE_IDS.CONTRACT_SIGNED) {
      if (!isAttachment(body.attachment)) {
        return apiValidationError('attachment (عقد أو فاتورة) مطلوب لمرحلة "تم توقيع العقد"');
      }
      attachment = body.attachment;

      // Verify the attachment exists + fetch a human-readable label.
      if (attachment.type === 'contract') {
        const { data: contract } = await supabase
          .from('pyra_contracts')
          .select('id, title, total_value, currency')
          .eq('id', attachment.id)
          .maybeSingle();
        if (!contract) return apiValidationError('العقد المختار غير موجود');
        attachmentLabel = contract.title ?? `Contract ${contract.id}`;
      } else {
        const { data: invoice } = await supabase
          .from('pyra_invoices')
          .select('id, invoice_number, total')
          .eq('id', attachment.id)
          .maybeSingle();
        if (!invoice) return apiValidationError('الفاتورة المختارة غير موجودة');
        attachmentLabel = invoice.invoice_number
          ? `فاتورة #${invoice.invoice_number}`
          : `فاتورة ${invoice.id}`;
      }
    }

    // ── lost_reason guard
    let lostReason: string | null = null;
    if (toStageTyped === PIPELINE_STAGE_IDS.CLOSED_LOST) {
      const lr = typeof body.lost_reason === 'string' ? body.lost_reason.trim() : '';
      if (!lr) return apiValidationError('lost_reason مطلوب لمرحلة "خسارة"');
      lostReason = lr;
    }

    // ── Compute updates
    const updates: Record<string, unknown> = {
      stage_id: toStageTyped,
      updated_at: new Date().toISOString(),
    };
    if (!leadBefore.win_probability_overridden) {
      updates.win_probability = STAGE_DEFAULT_WIN_PROBABILITY[toStageTyped];
    }
    if (lostReason !== null) updates.lost_reason = lostReason;

    const { data: lead, error: updErr } = await supabase
      .from('pyra_sales_leads')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    if (updErr || !lead) {
      logError({
        error: updErr ?? new Error('move-stage update returned no row'),
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { lead_id: id, action: 'move-stage', stage: 'stage_update' },
      });
      console.error('move-stage update error:', updErr?.message);
      return apiServerError(`فشل نقل المرحلة${updErr?.message ? ': ' + updErr.message : ''}`);
    }

    // ── Activity row (uses .then() — NOT bare `void <builder>`)
    const fromLabel = fromStage ? PIPELINE_STAGE_LABELS_AR[fromStage] ?? fromStage : null;
    const toLabel = PIPELINE_STAGE_LABELS_AR[toStageTyped];
    const isContractSigned = toStageTyped === PIPELINE_STAGE_IDS.CONTRACT_SIGNED;
    const activityType: 'closed_won_pending' | 'stage_change' = isContractSigned
      ? 'closed_won_pending'
      : 'stage_change';

    type ActivityMetadata = {
      from_stage: string | null;
      from_stage_label: string | null;
      to_stage: string;
      to_stage_label: string;
      changed_by: string;
      requested_by?: string;
      attachment?: AttachmentInput;
      attachment_label?: string;
      lost_reason?: string;
      reopened?: boolean;
      reopen_reason?: string;
    };
    const activityMetadata: ActivityMetadata = {
      from_stage: fromStage,
      from_stage_label: fromLabel,
      to_stage: toStageTyped,
      to_stage_label: toLabel,
      changed_by: auth.pyraUser.username,
    };
    if (isContractSigned && attachment) {
      activityMetadata.requested_by = auth.pyraUser.username;
      activityMetadata.attachment = attachment;
      if (attachmentLabel) activityMetadata.attachment_label = attachmentLabel;
    }
    if (lostReason !== null) activityMetadata.lost_reason = lostReason;
    if (isReopen && reopenReason) {
      activityMetadata.reopened = true;
      activityMetadata.reopen_reason = reopenReason;
    }

    void supabase
      .from('pyra_lead_activities')
      .insert({
        id: generateId('la'),
        lead_id: id,
        activity_type: activityType,
        description: isContractSigned ? attachmentLabel : (isReopen ? reopenReason : null),
        metadata: activityMetadata,
        created_by: auth.pyraUser.username,
      })
      .then(({ error: e }) => {
        if (e) console.error(`[${activityType} activity] insert failed:`, e.message);
      });

    // ── Notifications
    const leadName = (lead as { name: string }).name;
    if (isContractSigned) {
      // Notify the agent's direct manager (or admin if none — admin sees the
      // approvals queue regardless via the GET /api/crm/approvals/pending
      // endpoint's admin override).
      const managerUsername = leadBefore.assigned_to
        ? await getManagerOf(supabase, leadBefore.assigned_to)
        : null;
      if (managerUsername && managerUsername !== auth.pyraUser.username) {
        void notify(supabase, {
          to: managerUsername,
          type: 'lead_closed_won_pending_approval',
          title: 'صفقة بانتظار اعتمادك',
          message: `${auth.pyraUser.display_name} يطلب اعتماد إغلاق "${leadName}"`,
          link: `/dashboard/crm/approvals`,
          entity: { type: ENTITY_TYPES.LEAD, id },
          from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
        });
      }
    } else if (isReopen) {
      // Notify the original assignee that admin reopened the deal.
      if (leadBefore.assigned_to && leadBefore.assigned_to !== auth.pyraUser.username) {
        void notify(supabase, {
          to: leadBefore.assigned_to,
          type: 'lead_reopened',
          title: 'تم إعادة فتح صفقة كانت مغلقة',
          message: `${auth.pyraUser.display_name} أعاد فتح "${leadName}" — السبب: ${reopenReason}`,
          link: `/dashboard/crm/leads/${id}`,
          entity: { type: ENTITY_TYPES.LEAD, id },
          from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
        });
      }
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `lead_${ACTIVITY_ACTIONS.UPDATE}_stage`,
      `/dashboard/crm/leads/${id}`,
      { lead_id: id, from_stage: fromStage, to_stage: toStageTyped, attachment, reopen: isReopen },
      request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({
      lead,
      pending_approval: isContractSigned,
    });
  } catch (err) {
    // Phase 14.1 Commit 2 — pipeline-stage move failure. Both the kanban
    // drag-drop AND mobile stage sheet route through here; silent failures
    // surface as stuck cards or stale optimistic UI.
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { lead_id: leadIdForLogging, action: 'move-stage' },
    });
    console.error('POST /api/crm/leads/[id]/move-stage threw:', err);
    return apiServerError();
  }
}
