import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/dashboard/sales/whatsapp/conversations/[id]/assign
 * Assign conversation to an agent (admin only).
 * Body: { assigned_to: string (username) | null }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireApiPermission('sales_pipeline.manage');
    if (isApiError(auth)) return auth;

    const { id } = await ctx.params;
    const body = await req.json();
    const assignedTo = body.assigned_to || null;
    const supabase = createServiceRoleClient();

    // Get conversation
    const { data: conv } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('id, contact_name, remote_jid, assigned_to')
      .eq('id', id)
      .maybeSingle();

    if (!conv) return apiNotFound('المحادثة غير موجودة');

    // Update assignment
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('pyra_whatsapp_conversations')
      .update({
        assigned_to: assignedTo,
        assigned_at: assignedTo ? now : null,
        assigned_by: assignedTo ? auth.pyraUser.username : null,
        updated_at: now,
      })
      .eq('id', id);

    if (error) return apiServerError();

    // Notify assigned agent
    if (assignedTo && assignedTo !== conv.assigned_to) {
      void supabase.from('pyra_notifications').insert({
        id: generateId('n'),
        recipient_username: assignedTo,
        type: 'whatsapp_assignment',
        title: 'محادثة جديدة مسندة إليك',
        message: `تم تعيينك على محادثة ${conv.contact_name || conv.remote_jid}`,
        source_username: auth.pyraUser.username,
        source_display_name: auth.pyraUser.display_name,
        target_path: '/dashboard/sales/chat',
        is_read: false,
      });
    }

    // Activity log
    void supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'conversation_assigned',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: '/dashboard/sales/chat',
      details: {
        conversation_id: id,
        contact_name: conv.contact_name,
        assigned_to: assignedTo,
        previous_agent: conv.assigned_to,
      },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ assigned_to: assignedTo });

  } catch (err) {
    console.error('[POST /api/dashboard/sales/whatsapp/conversations/[id]/assign] error:', err);
    return apiServerError();
  }
}
