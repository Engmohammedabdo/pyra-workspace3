import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';

// ────────────────────────────────────────────────────────────────────────────
// /api/hr/documents/[id]
//
// PATCH  — update document metadata (documents.manage, service-role)
//          Allowlist: label, expiry_date, notes, type_id
//          CRITICAL: if expiry_date is present, ALSO reset both alert flags
//          (expiry_alert_30_sent: false, expiry_alert_7_sent: false)
//          so alerts re-arm after a date change.
//
// DELETE — hard delete: best-effort storage remove → DB delete (documents.manage)
//
// Storage bucket: pyra-private (hardcoded — Gap #3 Phase 3a pattern)
// ────────────────────────────────────────────────────────────────────────────

const DOC_BUCKET = 'pyra-private';

// ──────────────────────────────────────────────────────────────────────────
// PATCH — update document metadata
// ──────────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let authForLogging: ApiAuthResult | null = null;
  try {
    const auth = await requireApiPermission('documents.manage');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // ── Parse body ──
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return apiServerError('طلب غير صالح');
    }

    // ── Allowlist — only accept known fields ──
    const allowedFields = ['label', 'expiry_date', 'notes', 'type_id'] as const;
    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field] ?? null;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return apiServerError('لا توجد حقول صالحة للتحديث');
    }

    // ── CRITICAL: if expiry_date is being changed, re-arm both alert flags ──
    // A changed expiry date must reset the flags so the cron re-triggers
    // notifications for the new date. Without this, alerts would be silently
    // skipped because the flags were already set from the old expiry.
    if ('expiry_date' in body) {
      updateData.expiry_alert_30_sent = false;
      updateData.expiry_alert_7_sent = false;
    }

    // ── DB update ──
    const { data: updated, error: updateError } = await supabase
      .from('pyra_employee_documents')
      .update(updateData)
      .eq('id', id)
      .select(
        'id, employee_username, type_id, label, storage_path, mime_type, size_bytes, expiry_date, expiry_alert_30_sent, expiry_alert_7_sent, uploaded_by, uploaded_at, notes, metadata',
      )
      .single();

    if (updateError) {
      // PGRST116 = no rows matched the .eq('id', id) filter → not found
      if (updateError.code === 'PGRST116') {
        return apiNotFound('الوثيقة غير موجودة');
      }
      logError({
        error: updateError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'hr_document_update', document_id: id },
      });
      console.error('[hr/documents PATCH] update error:', updateError.message);
      return apiServerError('فشل تحديث الوثيقة');
    }

    if (!updated) return apiNotFound('الوثيقة غير موجودة');

    // ── Audit log (Phase 11.5 pattern: action_type from constants + specificity
    // in metadata.source) ──
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.DOCUMENT}_${ACTIVITY_ACTIONS.UPDATE}`,
      '/dashboard/hr/documents',
      {
        source: 'document_updated',
        id,
        updated_fields: Object.keys(updateData),
        expiry_alerts_reset: 'expiry_date' in body,
      },
      request.headers.get('x-forwarded-for') ?? undefined,
    );

    return apiSuccess({ document: updated });
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { source: 'hr_document_update' },
    });
    console.error('[hr/documents PATCH] threw:', err);
    return apiServerError();
  }
}

// ──────────────────────────────────────────────────────────────────────────
// DELETE — remove document (storage + DB)
// ──────────────────────────────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let authForLogging: ApiAuthResult | null = null;
  try {
    const auth = await requireApiPermission('documents.manage');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // ── Fetch row to get storage_path (required before delete) ──
    const { data: row, error: fetchError } = await supabase
      .from('pyra_employee_documents')
      .select('id, storage_path, employee_username, type_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      logError({
        error: fetchError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'hr_document_delete', document_id: id, stage: 'fetch' },
      });
      console.error('[hr/documents DELETE] fetch error:', fetchError.message);
      return apiServerError();
    }

    if (!row) return apiNotFound('الوثيقة غير موجودة');

    // ── Best-effort storage cleanup ──
    // Log warning on failure but continue — the DB row delete is the user-facing
    // outcome. Orphaned storage files are v1.1 sweep-cron territory.
    const { error: storageError } = await supabase.storage
      .from(DOC_BUCKET)
      .remove([row.storage_path]);
    if (storageError) {
      logError({
        severity: 'warning',
        error: storageError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: {
          source: 'hr_document_delete',
          document_id: id,
          storage_path: row.storage_path,
          stage: 'storage_remove',
        },
      });
      console.warn('[hr/documents DELETE] storage remove warning (continuing):', storageError.message);
    }

    // ── DB delete ──
    const { error: deleteError } = await supabase
      .from('pyra_employee_documents')
      .delete()
      .eq('id', id);

    if (deleteError) {
      logError({
        error: deleteError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'hr_document_delete', document_id: id, stage: 'db_delete' },
      });
      console.error('[hr/documents DELETE] delete error:', deleteError.message);
      return apiServerError('فشل حذف الوثيقة');
    }

    // ── Audit log ──
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.DOCUMENT}_${ACTIVITY_ACTIONS.DELETE}`,
      '/dashboard/hr/documents',
      {
        source: 'document_deleted',
        id,
        employee_username: row.employee_username,
        type_id: row.type_id,
      },
      request.headers.get('x-forwarded-for') ?? undefined,
    );

    return apiSuccess({ deleted: id });
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { source: 'hr_document_delete' },
    });
    console.error('[hr/documents DELETE] threw:', err);
    return apiServerError();
  }
}
