import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
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

// Gap #3 Phase 3a — lead attachments live in the PRIVATE bucket (hardcoded,
// matches the POST route). Removing from the wrong bucket would orphan the object.
const LEAD_ATTACH_BUCKET = 'pyra-private';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const t = await getTranslations('api');
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
    if (!allowed) return apiForbidden(t('crm.leadAccessDenied'));

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

    if (!row) return apiNotFound(t('crm.attachmentNotFound'));

    // ── Authorisation: admin OR uploader === self ──
    const isAdmin = auth.pyraUser.role === 'admin';
    const isUploader = row.uploaded_by === auth.pyraUser.username;
    if (!isAdmin && !isUploader) {
      return apiForbidden(t('crm.attachmentDeleteOwnerOrAdminOnly'));
    }

    // ── DB delete FIRST (fatal on error) ──
    // Order matters: if storage removal ran first and the DB delete then failed,
    // the row would survive while its object is gone → every later GET signs a
    // URL for a missing object (a permanently broken image/audio cell). Deleting
    // the row first means a failed storage remove only leaves a harmless orphan
    // file (swept by the v1.1 cron), which is the documented, recoverable failure.
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
      return apiServerError(t('crm.attachmentDeleteFailed'));
    }

    // ── Best-effort storage cleanup (after the row is gone) ──
    // We don't fail the request if storage removal errors — the row is already
    // deleted so the user sees the expected outcome; orphan files get swept in
    // the v1.1 cron.
    const { error: storageError } = await supabase.storage
      .from(LEAD_ATTACH_BUCKET)
      .remove([row.storage_path]);
    if (storageError) {
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

    // ── Lead timeline activity ──
    supabase
      .from('pyra_lead_activities')
      .insert({
        id: generateId('la'),
        lead_id: leadId,
        activity_type: 'attachment_removed',
        description: 'تم حذف مرفق', // i18n-exempt: DB data
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
