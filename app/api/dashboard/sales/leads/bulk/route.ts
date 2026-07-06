import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiValidationError,
  apiForbidden,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { hasPermission, isSuperAdmin } from '@/lib/auth/rbac';
import { isAssignableUser } from '@/lib/auth/lead-scope';
import { notifyBatch } from '@/lib/notifications/notify';
import {
  PIPELINE_STAGE_IDS,
  PIPELINE_STAGE_LABELS_AR,
  STAGE_DEFAULT_WIN_PROBABILITY,
  type PipelineStageId,
} from '@/lib/constants/statuses';

const BULK_ACTIONS = new Set(['assign', 'stage', 'delete', 'label']);
const VALID_STAGES = new Set<string>(Object.values(PIPELINE_STAGE_IDS));

interface BulkLeadRow {
  id: string;
  name: string | null;
  assigned_to: string | null;
  stage_id: string | null;
  win_probability_overridden: boolean | null;
  archived_at: string | null;
}

function stageLabel(stage: string | null): string | null {
  if (!stage) return null;
  return VALID_STAGES.has(stage) ? PIPELINE_STAGE_LABELS_AR[stage as PipelineStageId] : stage;
}

/**
 * POST /api/dashboard/sales/leads/bulk
 * Perform safe bulk actions on multiple leads.
 * Body: {
 *   action: 'assign' | 'stage' | 'delete' | 'label',
 *   lead_ids: string[],
 *   assigned_to?: string,
 *   stage_id?: string,
 *   lost_reason?: string,
 *   label_id?: string,
 * }
 *
 * This legacy endpoint is still used by the CRM pipeline for admin bulk
 * reassignment. Keep it aligned with the new CRM rules: no hard deletes, no
 * direct closed_won transition, no contract_signed without per-lead proof, and
 * assignment changes must use the CRM assign permission.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_leads.manage');
    if (isApiError(auth)) return auth;

    const body = await request.json();
    const { action, lead_ids, assigned_to, stage_id, label_id, lost_reason } = body;

    if (!action || !BULK_ACTIONS.has(action)) {
      return apiValidationError('إجراء غير صالح');
    }

    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return apiValidationError('يجب تحديد عميل محتمل واحد على الأقل');
    }

    const normalizedLeadIds = Array.from(
      new Set(
        lead_ids
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id) => id.trim()),
      ),
    );
    if (normalizedLeadIds.length === 0 || normalizedLeadIds.length !== lead_ids.length) {
      return apiValidationError('قائمة العملاء المحتملين غير صالحة');
    }

    if (normalizedLeadIds.length > 50) {
      return apiValidationError('الحد الأقصى 50 عميل محتمل في المرة الواحدة');
    }

    const supabase = createServiceRoleClient();

    const { data: leadData, error: leadFetchErr } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, assigned_to, stage_id, win_probability_overridden, archived_at')
      .in('id', normalizedLeadIds);
    if (leadFetchErr) return apiServerError(leadFetchErr.message);

    const leads = (leadData ?? []) as BulkLeadRow[];
    if (leads.length !== normalizedLeadIds.length) {
      return apiValidationError('بعض العملاء المحتملين غير موجودين');
    }

    if (leads.some((lead) => lead.archived_at)) {
      return apiValidationError('لا يمكن تنفيذ عملية جماعية على Leads مؤرشفة');
    }

    // Non-admins can only bulk-update leads already assigned to them.
    const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
    if (!isAdmin) {
      const unauthorized = leads.filter((lead) => lead.assigned_to !== auth.pyraUser.username);
      if (unauthorized.length > 0) {
        return apiForbidden('لا يمكنك تعديل عملاء محتملين غير مسندين إليك');
      }
    }

    let affected = 0;
    const nowIso = new Date().toISOString();

    switch (action) {
      case 'assign': {
        if (!hasPermission(auth.pyraUser.rolePermissions, 'leads.assign')) {
          return apiForbidden('تغيير مسؤول مجموعة Leads متاح للمدير فقط');
        }

        const targetOwner = typeof assigned_to === 'string' ? assigned_to.trim() : '';
        if (!targetOwner) return apiValidationError('يجب تحديد الموظف');
        if (!(await isAssignableUser(supabase, targetOwner))) {
          return apiValidationError('الموظف المحدد غير موجود أو غير نشط');
        }

        const { error } = await supabase
          .from('pyra_sales_leads')
          .update({ assigned_to: targetOwner, updated_at: nowIso })
          .in('id', normalizedLeadIds);
        if (error) return apiServerError(error.message);
        affected = normalizedLeadIds.length;

        const changedLeads = leads.filter((lead) => lead.assigned_to !== targetOwner);
        const activityRows = changedLeads.map((lead) => ({
          id: generateId('la'),
          lead_id: lead.id,
          activity_type: 'assignment_changed',
          description: null,
          metadata: { from_user: lead.assigned_to ?? null, to_user: targetOwner, bulk: true },
          created_by: auth.pyraUser.username,
        }));
        if (activityRows.length > 0) {
          const { error: assignActErr } = await supabase
            .from('pyra_lead_activities')
            .insert(activityRows);
          if (assignActErr) console.error('[bulk assign] activity insert failed:', assignActErr.message);
        }

        // Preserve the notification chain: the new owner gets one bell item per
        // lead, written in a single batched insert and skipping self-notifies.
        if (targetOwner !== auth.pyraUser.username && changedLeads.length > 0) {
          await notifyBatch(
            supabase,
            changedLeads.map((lead) => ({
              to: targetOwner,
              type: 'lead_transferred',
              title: 'تم تحويل Lead لك',
              message: `${auth.pyraUser.display_name} حوّل Lead "${lead.name ?? 'بدون اسم'}" إليك`,
              link: `/dashboard/crm/leads/${lead.id}`,
              entity: { type: 'lead', id: lead.id },
              from: {
                username: auth.pyraUser.username,
                displayName: auth.pyraUser.display_name,
              },
            })),
          );
        }
        break;
      }

      case 'stage': {
        if (!hasPermission(auth.pyraUser.rolePermissions, 'leads.move_stage')) {
          return apiForbidden('تغيير مرحلة مجموعة Leads غير متاح لحسابك');
        }

        const targetStage = typeof stage_id === 'string' ? stage_id.trim() : '';
        if (!targetStage) return apiValidationError('يجب تحديد المرحلة');
        if (!VALID_STAGES.has(targetStage)) return apiValidationError('المرحلة المحددة غير صالحة');
        if (targetStage === PIPELINE_STAGE_IDS.CLOSED_WON) {
          return apiValidationError('لا يمكن نقل Leads إلى فوز بالصفقة مباشرة. استخدم مسار الموافقة');
        }
        if (targetStage === PIPELINE_STAGE_IDS.CONTRACT_SIGNED) {
          return apiValidationError('مرحلة توقيع العقد تحتاج عقد أو فاتورة لكل Lead، لذلك تتم من صفحة الـ Lead نفسه');
        }

        const reopeningClosedWon = leads.some(
          (lead) => lead.stage_id === PIPELINE_STAGE_IDS.CLOSED_WON && lead.stage_id !== targetStage,
        );
        if (reopeningClosedWon) {
          return apiValidationError('إعادة فتح صفقة مغلقة لا تتم كعملية جماعية. افتح كل Lead وحده مع سبب واضح');
        }

        const targetStageTyped = targetStage as PipelineStageId;
        let lostReason: string | null = null;
        if (targetStageTyped === PIPELINE_STAGE_IDS.CLOSED_LOST) {
          lostReason = typeof lost_reason === 'string' ? lost_reason.trim() : '';
          if (!lostReason) return apiValidationError('نقل Leads إلى خسارة يحتاج سبب الخسارة');
        }

        const movingLeads = leads.filter((lead) => lead.stage_id !== targetStageTyped);
        const baseUpdate: Record<string, unknown> = {
          stage_id: targetStageTyped,
          updated_at: nowIso,
        };
        if (lostReason !== null) baseUpdate.lost_reason = lostReason;

        const autoProbabilityIds = movingLeads
          .filter((lead) => !lead.win_probability_overridden)
          .map((lead) => lead.id);
        const overriddenProbabilityIds = movingLeads
          .filter((lead) => !!lead.win_probability_overridden)
          .map((lead) => lead.id);

        if (autoProbabilityIds.length > 0) {
          const { error } = await supabase
            .from('pyra_sales_leads')
            .update({
              ...baseUpdate,
              win_probability: STAGE_DEFAULT_WIN_PROBABILITY[targetStageTyped],
            })
            .in('id', autoProbabilityIds);
          if (error) return apiServerError(error.message);
        }

        if (overriddenProbabilityIds.length > 0) {
          const { error } = await supabase
            .from('pyra_sales_leads')
            .update(baseUpdate)
            .in('id', overriddenProbabilityIds);
          if (error) return apiServerError(error.message);
        }

        affected = movingLeads.length;

        const activityRows = movingLeads.map((lead) => ({
          id: generateId('la'),
          lead_id: lead.id,
          activity_type: 'stage_change',
          description: null,
          metadata: {
            from_stage: lead.stage_id,
            from_stage_label: stageLabel(lead.stage_id),
            to_stage: targetStageTyped,
            to_stage_label: PIPELINE_STAGE_LABELS_AR[targetStageTyped],
            changed_by: auth.pyraUser.username,
            bulk: true,
            ...(lostReason ? { lost_reason: lostReason } : {}),
          },
          created_by: auth.pyraUser.username,
        }));
        if (activityRows.length > 0) {
          const { error: stageActErr } = await supabase
            .from('pyra_lead_activities')
            .insert(activityRows);
          if (stageActErr) console.error('[bulk stage] activity insert failed:', stageActErr.message);
        }
        break;
      }

      case 'delete': {
        if (!hasPermission(auth.pyraUser.rolePermissions, 'leads.delete')) {
          return apiForbidden('أرشفة مجموعة Leads متاحة للمدير فقط');
        }

        const { error } = await supabase
          .from('pyra_sales_leads')
          .update({ archived_at: nowIso, archived_by: auth.pyraUser.username, updated_at: nowIso })
          .in('id', normalizedLeadIds);
        if (error) return apiServerError(error.message);
        affected = normalizedLeadIds.length;

        const activityRows = normalizedLeadIds.map((leadId) => ({
          id: generateId('la'),
          lead_id: leadId,
          activity_type: 'field_updated',
          description: 'تم أرشفة الـ Lead (عملية جماعية)',
          metadata: { field: 'archived_at', source: 'bulk_archived', bulk: true },
          created_by: auth.pyraUser.username,
        }));
        const { error: archiveActErr } = await supabase
          .from('pyra_lead_activities')
          .insert(activityRows);
        if (archiveActErr) console.error('[bulk archive] activity insert failed:', archiveActErr.message);
        break;
      }

      case 'label': {
        if (!label_id) return apiValidationError('يجب تحديد الوسم');
        const rows = normalizedLeadIds.map((leadId) => ({
          id: generateId('ll'),
          lead_id: leadId,
          label_id,
        }));
        const { error } = await supabase
          .from('pyra_lead_labels')
          .upsert(rows, { onConflict: 'lead_id,label_id' });
        if (error) return apiServerError(error.message);
        affected = normalizedLeadIds.length;
        break;
      }
    }

    const { error: auditErr } = await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: `leads_bulk_${action}`,
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: '/dashboard/crm/pipeline',
      details: { action, count: normalizedLeadIds.length, affected, lead_ids: normalizedLeadIds },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });
    if (auditErr) console.error('[bulk action] audit log insert failed:', auditErr.message);

    return apiSuccess({ action, affected });
  } catch (err) {
    console.error('POST /api/dashboard/sales/leads/bulk error:', err);
    return apiServerError();
  }
}
