import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { canAccessLead } from '@/lib/auth/lead-scope';
import { generateId } from '@/lib/utils/id';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/crm/leads/[id]/attachments/[attachmentId]
//
// Permission: leads.update + canAccessLead + (admin OR uploader === self)
// (Q-E6 locked decision: admin + uploader can delete; sales agents
// can't delete their colleagues' uploads on the same lead — small-team
// safety mechanism.)
//
// Cascade:
//   1. Fetch attachment row, verify it belongs to the lead in the route
//      (prevent cross-lead deletion via tampered URL).
//   2. Authorisation check: admin OR uploaded_by === self.
//   3. Best-effort delete from Supabase Storage (logs but doesn't fail
//      the request if storage is temporarily unavailable — the DB row
//      delete still happens, and the orphaned storage file is v1.1
//      sweep-cron territory).
//   4. DELETE from pyra_lead_attachments.
//   5. Lead timeline activity (activity_type='attachment_removed').
//   6. System audit log (logActivity).
// ────────────────────────────────────────────────────────────────────────────

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  let authForLogging: ApiAuthResult | null = null;
  let leadIdForLogging: string | null = null;
  let attachmentIdForLogging: string | null = null;
  try {
    const auth = await requireApiPermission('leads.update');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const { id: leadId, attachmentId } = await params;
    leadIdForLogging = leadId;
    attachmentIdForLogging = attachmentId;

    const supabase = createServiceRoleClient();

    // ── Scope gate (admin OR assigned_to) ──
    const allowed = await canAccessLead(
      supabase,
      auth.pyraUser.username,
      auth.pyraUser.role,
      leadId,
    );
    if (!allowed) return apiForbidden('لا تملك صلاحية الوصول لهذا الـ Lead');

    // ── Fetch attachment with cross-lead check ──
    // We .eq() on both id AND lead_id to defend against URL tampering
    // where someone tries to delete an attachment from a different lead.
    const { data: row, error: fetchError } = await supabase
      .from('pyra_lead_attachments')
      .select('id, lead_id, storage_path, file_type, size_bytes, uploaded_by')
      .eq('id', attachmentId)
      .eq('lead_id', leadId)
      .maybeSingle();

    if (fetchError) {
      logError({
        error: fetchError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { lead_id: leadId, attachment_id: attachmentId, action: 'delete-attachment', stage: 'fetch' },
      });
      console.error('delete attachment fetch error:', fetchError.message);
      return apiServerError();
    }

    if (!row) return apiNotFound('المرفق غير موجود');

    // ── Authorisation: admin OR uploader === self ──
    const isAdmin = auth.pyraUser.role === 'admin';
    const isUploader = row.uploaded_by === auth.pyraUser.username;
    if (!isAdmin && !isUploader) {
      return apiForbidden('يمكن للمدير أو صاحب الرفع فقط حذف هذا المرفق');
    }

    // ── Best-effort storage cleanup ──
    // We don't fail the request if storage removal errors — the DB row
    // delete still gives the user the expected outcome. Orphan files
    // get swept in v1.1 cron.
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([row.storage_path]);
    if (storageError) {
      // Log as warning — not a failure for the user-facing flow.
      logError({
        severity: 'warning',
        error: storageError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: {
          lead_id: leadId,
          attachment_id: attachmentId,
          storage_path: row.storage_path,
          action: 'delete-attachment',
          stage: 'storage_remove',
        },
      });
      console.warn('storage remove warning (continuing):', storageError.message);
    }

    // ── DB delete ──
    const { error: deleteError } = await supabase
      .from('pyra_lead_attachments')
      .delete()
      .eq('id', attachmentId)
      .eq('lead_id', leadId);

    if (deleteError) {
      logError({
        error: deleteError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { lead_id: leadId, attachment_id: attachmentId, action: 'delete-attachment', stage: 'db_delete' },
      });
      console.error('attachment delete failed:', deleteError.message);
      return apiServerError('فشل حذف المرفق');
    }

    // ── Lead timeline activity ──
    supabase
      .from('pyra_lead_activities')
      .insert({
        id: generateId('la'),
        lead_id: leadId,
        activity_type: 'attachment_removed',
        description: 'تم حذف مرفق',
        metadata: {
          attachment_id: attachmentId,
          file_type: row.file_type,
          size_bytes: row.size_bytes,
          deleted_by: auth.pyraUser.username,
        },
        created_by: auth.pyraUser.username,
      })
      .then(({ error: e }) => {
        if (e) console.error('[attachment removal timeline] insert failed:', e.message);
      });

    // ── System audit log (Phase 11.5 pattern) ──
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/crm/leads/${leadId}`,
      {
        lead_id: leadId,
        source: 'attachment_removed',
        attachment_id: attachmentId,
        file_type: row.file_type,
      },
      request.headers.get('x-forwarded-for') ?? undefined,
    );

    return apiSuccess({ deleted: attachmentId });
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: {
        lead_id: leadIdForLogging,
        attachment_id: attachmentIdForLogging,
        action: 'delete-attachment',
      },
    });
    console.error('DELETE /api/crm/leads/[id]/attachments/[attachmentId] threw:', err);
    return apiServerError();
  }
}
