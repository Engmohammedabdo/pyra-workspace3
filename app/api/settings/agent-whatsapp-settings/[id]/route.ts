import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiServerError,
  apiValidationError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/api/activity';

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/settings/agent-whatsapp-settings/[id]
//
// Permission: settings.manage
// Body: any subset of:
//   sender_instance_name  (string, non-empty)
//   recipient_phone       (string, non-empty)
//   is_active             (boolean)
//   notes                 (string | null)  — null clears the field
//
// agent_username is NOT updatable (delete + recreate if needed) →
// returns 422 if the body includes it. Rationale: agent_username is
// the row's identity for the cron lookup; renaming would risk
// silently routing a different agent's reminders through this row.
//
// Errors:
//   422 — body includes agent_username / empty body / empty-string
//         provided for a non-empty field
//   404 — id not found
//
// Note: updated_at is bumped automatically by the BEFORE UPDATE
// trigger installed in migration 014. No manual touch needed.
//
// Activity log: 'agent_wa_settings_updated'
//               details = { id, fields_changed: [...] }
// ────────────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('settings.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return apiValidationError('JSON body مطلوب');

    if ('agent_username' in body) {
      return apiValidationError(
        'لا يمكن تعديل agent_username — احذف الإعداد وأنشئه من جديد',
      );
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.sender_instance_name === 'string') {
      const v = body.sender_instance_name.trim();
      if (!v) return apiValidationError('sender_instance_name لا يمكن أن يكون فارغ');
      updates.sender_instance_name = v;
    }
    if (typeof body.recipient_phone === 'string') {
      const v = body.recipient_phone.trim();
      if (!v) return apiValidationError('recipient_phone لا يمكن أن يكون فارغ');
      updates.recipient_phone = v;
    }
    if (typeof body.is_active === 'boolean') {
      updates.is_active = body.is_active;
    }
    if ('notes' in body) {
      updates.notes =
        typeof body.notes === 'string' ? body.notes.trim() || null : null;
    }

    if (Object.keys(updates).length === 0) {
      return apiValidationError('لا توجد حقول صالحة للتعديل');
    }

    const { data, error } = await supabase
      .from('pyra_agent_whatsapp_settings')
      .update(updates)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[PATCH /api/settings/agent-whatsapp-settings] update error:', error.message);
      return apiServerError();
    }
    if (!data) return apiNotFound('الإعداد غير موجود');

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'agent_wa_settings_updated',
      '/dashboard/settings',
      { id, fields_changed: Object.keys(updates) },
      req.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess(data);
  } catch (err) {
    console.error('PATCH /api/settings/agent-whatsapp-settings threw:', err);
    return apiServerError();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/settings/agent-whatsapp-settings/[id]
//
// Permission: settings.manage
// Hard-delete (config table; no soft-delete pattern needed).
//
// Errors: 404 — id not found
//
// Activity log: 'agent_wa_settings_deleted'
//               details = { id, agent_username, sender_instance_name }
//   (capture row before DELETE so we can include identifying fields
//   in the audit trail — not retrievable post-delete)
// ────────────────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('settings.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const { data: existing } = await supabase
      .from('pyra_agent_whatsapp_settings')
      .select('agent_username, sender_instance_name')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return apiNotFound('الإعداد غير موجود');

    const { error } = await supabase
      .from('pyra_agent_whatsapp_settings')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('[DELETE /api/settings/agent-whatsapp-settings] delete error:', error.message);
      return apiServerError();
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'agent_wa_settings_deleted',
      '/dashboard/settings',
      {
        id,
        agent_username: existing.agent_username,
        sender_instance_name: existing.sender_instance_name,
      },
      req.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/settings/agent-whatsapp-settings threw:', err);
    return apiServerError();
  }
}
