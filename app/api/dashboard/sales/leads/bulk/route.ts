import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

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
        void supabase.from('pyra_lead_activities').insert(activityRows);
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
        void supabase.from('pyra_lead_activities').insert(activityRows);
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

    // Log bulk action
    void supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: `leads_bulk_${action}`,
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: '/dashboard/sales/leads',
      details: { action, count: lead_ids.length, lead_ids },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ action, affected });
  } catch (err) {
    console.error('POST /api/dashboard/sales/leads/bulk error:', err);
    return apiServerError();
  }
}
