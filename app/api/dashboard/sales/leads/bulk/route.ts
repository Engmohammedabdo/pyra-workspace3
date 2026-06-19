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
import { isSuperAdmin } from '@/lib/auth/rbac';
import { notifyBatch } from '@/lib/notifications/notify';

/**
 * POST /api/dashboard/sales/leads/bulk
 * Perform bulk actions on multiple leads.
 * Body: {
 *   action: 'assign' | 'stage' | 'delete' | 'label',
 *   lead_ids: string[],
 *   assigned_to?: string,
 *   stage_id?: string,
 *   label_id?: string,
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_leads.manage');
    if (isApiError(auth)) return auth;

    const body = await request.json();
    const { action, lead_ids, assigned_to, stage_id, label_id } = body;

    if (!action || !['assign', 'stage', 'delete', 'label'].includes(action)) {
      return apiValidationError('إجراء غير صالح');
    }

    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return apiValidationError('يجب تحديد عميل محتمل واحد على الأقل');
    }

    if (lead_ids.length > 50) {
      return apiValidationError('الحد الأقصى 50 عميل محتمل في المرة الواحدة');
    }

    const supabase = createServiceRoleClient();

    // Agent scoping: verify ALL leads belong to the current agent
    const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
    if (!isAdmin) {
      const { data: leads } = await supabase
        .from('pyra_sales_leads')
        .select('id, assigned_to')
        .in('id', lead_ids);
      const unauthorized = (leads || []).filter(l => l.assigned_to !== auth.pyraUser.username);
      if (unauthorized.length > 0) {
        return apiForbidden('لا يمكنك تعديل عملاء محتملين غير مسندين إليك');
      }
    }

    let affected = 0;

    switch (action) {
      case 'assign': {
        if (!assigned_to) return apiValidationError('يجب تحديد الموظف');
        const { error } = await supabase
          .from('pyra_sales_leads')
          .update({ assigned_to, updated_at: new Date().toISOString() })
          .in('id', lead_ids);
        if (error) return apiServerError(error.message);
        affected = lead_ids.length;

        // Log activity for each lead
        const activityRows = lead_ids.map(leadId => ({
          id: generateId('la'),
          lead_id: leadId,
          activity_type: 'transfer',
          description: `تم تعيين الموظف ${assigned_to} (عملية جماعية)`,
          metadata: { assigned_to, bulk: true },
          created_by: auth.pyraUser.username,
        }));
        // Commit 2c bug fix: this was a bare `void` on a Supabase lazy-thenable
        // — the query was BUILT BUT NEVER SENT (no .then()/await), so bulk
        // reassign logged ZERO activity (verified missing in DB during the 2b
        // test: transfer_activities=0). Awaited now so the transfer activity
        // actually persists. (CLAUDE.md repeatedly warns about this footgun.)
        const { error: assignActErr } = await supabase
          .from('pyra_lead_activities')
          .insert(activityRows);
        if (assignActErr) console.error('[bulk assign] activity insert failed:', assignActErr.message);

        // Commit 2b — notify the new owner once per reassigned lead, at parity
        // with the per-lead reassign path (same type/title/message shape). One
        // batched insert via notifyBatch (no N+1). Skipped when the admin
        // assigns to themselves (notifyBatch drops self-notifications). Lead
        // names fetched once for the message body. Awaited so the rows persist
        // before the response (notifications are the whole point of this path).
        if (assigned_to !== auth.pyraUser.username) {
          const { data: namedLeads } = await supabase
            .from('pyra_sales_leads')
            .select('id, name')
            .in('id', lead_ids);
          await notifyBatch(
            supabase,
            (namedLeads ?? []).map((l) => ({
              to: assigned_to,
              type: 'lead_transferred',
              title: 'تم تحويل Lead لك',
              message: `${auth.pyraUser.display_name} حوّل Lead "${l.name ?? 'بدون اسم'}" إليك`,
              link: `/dashboard/crm/leads/${l.id}`,
              entity: { type: 'lead', id: l.id },
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
        if (!stage_id) return apiValidationError('يجب تحديد المرحلة');
        const { error } = await supabase
          .from('pyra_sales_leads')
          .update({ stage_id, updated_at: new Date().toISOString() })
          .in('id', lead_ids);
        if (error) return apiServerError(error.message);
        affected = lead_ids.length;

        const activityRows = lead_ids.map(leadId => ({
          id: generateId('la'),
          lead_id: leadId,
          activity_type: 'stage_change',
          description: `تم تغيير المرحلة (عملية جماعية)`,
          metadata: { stage_id, bulk: true },
          created_by: auth.pyraUser.username,
        }));
        // Commit 2c bug fix: same lazy-thenable bug as the assign case — await
        // so the bulk stage-change activity persists.
        const { error: stageActErr } = await supabase
          .from('pyra_lead_activities')
          .insert(activityRows);
        if (stageActErr) console.error('[bulk stage] activity insert failed:', stageActErr.message);
        break;
      }

      case 'delete': {
        const { error } = await supabase
          .from('pyra_sales_leads')
          .delete()
          .in('id', lead_ids);
        if (error) return apiServerError(error.message);
        affected = lead_ids.length;
        break;
      }

      case 'label': {
        if (!label_id) return apiValidationError('يجب تحديد الوسم');
        const rows = lead_ids.map(leadId => ({
          id: generateId('ll'),
          lead_id: leadId,
          label_id,
        }));
        const { error } = await supabase
          .from('pyra_lead_labels')
          .upsert(rows, { onConflict: 'lead_id,label_id' });
        if (error) return apiServerError(error.message);
        affected = lead_ids.length;
        break;
      }
    }

    // Log bulk action — Commit 2c bug fix: awaited (was a bare `void`
    // lazy-thenable that never executed, so bulk actions left no audit-log row).
    const { error: auditErr } = await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: `leads_bulk_${action}`,
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: '/dashboard/crm/pipeline',
      details: { action, count: lead_ids.length, lead_ids },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });
    if (auditErr) console.error('[bulk action] audit log insert failed:', auditErr.message);

    return apiSuccess({ action, affected });
  } catch (err) {
    console.error('POST /api/dashboard/sales/leads/bulk error:', err);
    return apiServerError();
  }
}
