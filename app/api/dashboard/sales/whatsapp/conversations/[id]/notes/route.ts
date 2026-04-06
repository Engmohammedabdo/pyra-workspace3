import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiForbidden, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { CONVERSATION_NOTE_FIELDS } from '@/lib/supabase/fields';
import { logActivity } from '@/lib/api/activity';
import { isSuperAdmin } from '@/lib/auth/rbac';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/dashboard/sales/whatsapp/conversations/[id]/notes
 * List internal notes for a conversation.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const { id } = await ctx.params;
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_conversation_notes')
      .select(CONVERSATION_NOTE_FIELDS)
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    if (error) return apiServerError();

    return apiSuccess(data || []);

  } catch (err) {
    console.error('[GET /api/dashboard/sales/whatsapp/conversations/[id]/notes] error:', err);
    return apiServerError();
  }
}

/**
 * POST /api/dashboard/sales/whatsapp/conversations/[id]/notes
 * Create an internal note (NOT sent to WhatsApp).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.send');
    if (isApiError(auth)) return auth;

    const { id } = await ctx.params;
    const body = await req.json();
    const content = body.content?.trim();

    if (!content) return apiValidationError('محتوى الملاحظة مطلوب');

    const supabase = createServiceRoleClient();

    // Verify conversation exists and agent is assigned
    const { data: conv } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('id, assigned_to')
      .eq('id', id)
      .maybeSingle();

    if (!conv) return apiNotFound('المحادثة غير موجودة');

    // Agent scoping: only assigned agent or admin can add notes
    const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
    if (!isAdmin && conv.assigned_to !== auth.pyraUser.username) {
      return apiForbidden('لا يمكنك إضافة ملاحظة لمحادثة غير مسندة إليك');
    }

    const { data: note, error } = await supabase
      .from('pyra_conversation_notes')
      .insert({
        id: generateId('cn'),
        conversation_id: id,
        author_username: auth.pyraUser.username,
        author_display_name: auth.pyraUser.display_name,
        content,
      })
      .select(CONVERSATION_NOTE_FIELDS)
      .single();

    if (error) return apiServerError();

    logActivity(auth.pyraUser.username, auth.pyraUser.display_name, 'conversation_note_added', '/dashboard/sales/whatsapp', { conversation_id: id });

    // Parse @mentions and create notifications
    const mentionRegex = /@([\p{L}\p{N}\s]+?)(?=\s|$|@)/gu;
    const matchResults: RegExpExecArray[] = [];
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(content)) !== null) {
      matchResults.push(match);
    }
    const mentions = matchResults.map(m => m[1].trim());

    if (mentions.length > 0) {
      // Fetch users matching mentioned display names
      const { data: allUsers } = await supabase
        .from('pyra_users')
        .select('id, username, display_name')
        .in('display_name', mentions);

      if (allUsers && allUsers.length > 0) {
        const notifications = allUsers
          .filter(u => u.username !== auth.pyraUser.username) // Don't notify self
          .map(u => ({
            id: generateId('n'),
            recipient_username: u.username,
            type: 'mention',
            title: 'تم ذكرك في ملاحظة',
            message: `ذكرك ${auth.pyraUser.display_name} في محادثة واتساب`,
            source_display_name: auth.pyraUser.display_name,
            target_path: '/dashboard/sales/chat',
            is_read: false,
          }));

        if (notifications.length > 0) {
          void supabase.from('pyra_notifications').insert(notifications);
        }
      }
    }

    return apiSuccess(note, undefined, 201);

  } catch (err) {
    console.error('[POST /api/dashboard/sales/whatsapp/conversations/[id]/notes] error:', err);
    return apiServerError();
  }
}
