import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity } from '@/lib/api/activity';

/**
 * POST /api/dashboard/sales/whatsapp/conversations/bulk
 * Bulk update conversations.
 * Body: { ids: string[], action: 'assign'|'status'|'priority'|'label'|'snooze'|'mute', value: any }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.manage');
    if (isApiError(auth)) return auth;

    const body = await req.json();
    const { ids, action, value } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return apiValidationError('يجب تحديد محادثة واحدة على الأقل');
    }

    if (!action) {
      return apiValidationError('الإجراء مطلوب');
    }

    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();
    let updateCount = 0;

    switch (action) {
      case 'assign': {
        const assignedTo = value?.assigned_to || null;
        const teamId = value?.team_id;
        const updateData: Record<string, unknown> = {
          assigned_to: assignedTo,
          assigned_at: assignedTo ? now : null,
          assigned_by: assignedTo ? auth.pyraUser.username : null,
          updated_at: now,
        };
        if (teamId !== undefined) updateData.team_id = teamId;

        const { count, error } = await supabase
          .from('pyra_whatsapp_conversations')
          .update(updateData)
          .in('id', ids);

        if (error) {
          console.error('Bulk assign error:', error);
          return apiServerError();
        }
        updateCount = count || ids.length;
        break;
      }

      case 'status': {
        const status = value?.status;
        if (!status) return apiValidationError('الحالة مطلوبة');

        const { count, error } = await supabase
          .from('pyra_whatsapp_conversations')
          .update({ status, updated_at: now })
          .in('id', ids);

        if (error) {
          console.error('Bulk status error:', error);
          return apiServerError();
        }
        updateCount = count || ids.length;
        break;
      }

      case 'priority': {
        const priority = value?.priority;
        if (!priority) return apiValidationError('الأولوية مطلوبة');

        const { count, error } = await supabase
          .from('pyra_whatsapp_conversations')
          .update({ priority, updated_at: now })
          .in('id', ids);

        if (error) {
          console.error('Bulk priority error:', error);
          return apiServerError();
        }
        updateCount = count || ids.length;
        break;
      }

      case 'label': {
        const labelId = value?.label_id;
        if (!labelId) return apiValidationError('معرف التسمية مطلوب');

        // Assign label to all selected conversations (skip existing)
        const inserts = ids.map(convId => ({
          id: generateId('cla'),
          conversation_id: convId,
          label_id: labelId,
          assigned_by: auth.pyraUser.username,
        }));

        const { error } = await supabase
          .from('pyra_conversation_label_assignments')
          .upsert(inserts, { onConflict: 'conversation_id,label_id', ignoreDuplicates: true });

        if (error) {
          console.error('Bulk label error:', error);
          return apiServerError();
        }
        updateCount = ids.length;
        break;
      }

      case 'snooze': {
        const snoozedUntil = value?.snoozed_until || null;

        const { count, error } = await supabase
          .from('pyra_whatsapp_conversations')
          .update({ snoozed_until: snoozedUntil, updated_at: now })
          .in('id', ids);

        if (error) {
          console.error('Bulk snooze error:', error);
          return apiServerError();
        }
        updateCount = count || ids.length;
        break;
      }

      case 'mute': {
        const isMuted = value?.is_muted ?? true;

        const { count, error } = await supabase
          .from('pyra_whatsapp_conversations')
          .update({ is_muted: isMuted, updated_at: now })
          .in('id', ids);

        if (error) {
          console.error('Bulk mute error:', error);
          return apiServerError();
        }
        updateCount = count || ids.length;
        break;
      }

      default:
        return apiValidationError('إجراء غير مدعوم');
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'conversations_bulk_update',
      '/dashboard/sales/whatsapp',
      { action, count: updateCount, ids: ids.slice(0, 10) }
    );

    return apiSuccess({ updated: updateCount });
  } catch (err) {
    console.error('[POST /conversations/bulk] error:', err);
    return apiServerError();
  }
}
