import { createServiceRoleClient } from '@/lib/supabase/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';
import { CONVERSATION_STATUS } from '@/lib/constants/statuses';

/**
 * POST /api/dashboard/sales/whatsapp/sla/check
 * Check and update SLA breaches across all open conversations.
 * Called periodically from the frontend poll cycle.
 */
export async function POST() {
  const auth = await getApiAuth();
  if (!auth) return apiError('غير مصرح', 401);

  try {
    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();
    let newlyBreached = 0;

    // Find conversations with SLA that haven't been checked for first response breach
    const { data: firstResponseCandidates } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('id, assigned_to, contact_name, contact_phone, sla_first_response_due')
      .in('status', [CONVERSATION_STATUS.OPEN, CONVERSATION_STATUS.PENDING])
      .not('sla_policy_id', 'is', null)
      .is('first_reply_at', null)
      .eq('sla_first_response_breached', false)
      .not('sla_first_response_due', 'is', null)
      .lt('sla_first_response_due', now);

    if (firstResponseCandidates && firstResponseCandidates.length > 0) {
      const ids = firstResponseCandidates.map(c => c.id);

      // Batch update all breached conversations
      await supabase
        .from('pyra_whatsapp_conversations')
        .update({ sla_first_response_breached: true })
        .in('id', ids);

      // Create notifications for each breached conversation
      const notifications = firstResponseCandidates.map(conv => ({
        id: generateId('n'),
        recipient_username: conv.assigned_to || 'admin',
        type: 'sla_breach',
        title: 'تجاوز اتفاقية مستوى الخدمة — الرد الأول',
        message: `المحادثة مع ${conv.contact_name || conv.contact_phone || 'جهة اتصال'} تجاوزت وقت الرد الأول`,
        source_display_name: 'نظام SLA',
        target_path: '/dashboard/sales/chat',
        is_read: false,
      }));

      if (notifications.length > 0) {
        await supabase.from('pyra_notifications').insert(notifications);
      }

      newlyBreached += ids.length;
    }

    // Find conversations with SLA that haven't been checked for resolution breach
    const { data: resolutionCandidates } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('id, assigned_to, contact_name, contact_phone, sla_resolution_due')
      .in('status', [CONVERSATION_STATUS.OPEN, CONVERSATION_STATUS.PENDING])
      .not('sla_policy_id', 'is', null)
      .is('resolved_at', null)
      .eq('sla_resolution_breached', false)
      .not('sla_resolution_due', 'is', null)
      .lt('sla_resolution_due', now);

    if (resolutionCandidates && resolutionCandidates.length > 0) {
      const ids = resolutionCandidates.map(c => c.id);

      await supabase
        .from('pyra_whatsapp_conversations')
        .update({ sla_resolution_breached: true })
        .in('id', ids);

      const notifications = resolutionCandidates.map(conv => ({
        id: generateId('n'),
        recipient_username: conv.assigned_to || 'admin',
        type: 'sla_breach',
        title: 'تجاوز اتفاقية مستوى الخدمة — الحل',
        message: `المحادثة مع ${conv.contact_name || conv.contact_phone || 'جهة اتصال'} تجاوزت وقت الحل`,
        source_display_name: 'نظام SLA',
        target_path: '/dashboard/sales/chat',
        is_read: false,
      }));

      if (notifications.length > 0) {
        await supabase.from('pyra_notifications').insert(notifications);
      }

      newlyBreached += ids.length;
    }

    return apiSuccess({ newly_breached: newlyBreached });
  } catch (err) {
    return apiServerError(err instanceof Error ? err.message : 'خطأ في الخادم');
  }
}
