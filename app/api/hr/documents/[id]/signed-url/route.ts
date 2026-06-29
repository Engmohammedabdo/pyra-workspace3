import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/log-error';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/hr/documents/[id]/signed-url
//
// Returns a fresh 1-hour signed URL for a private-bucket document.
// Gated: documents.manage (HR admin only, service-role after the gate).
//
// Pattern: Gap #3 Phase 3a (pyra-private bucket, 3600s TTL signed URL).
// Called by the UI when a stored signed URL is about to expire, or when
// the HR admin needs to re-download a specific document on demand.
// ────────────────────────────────────────────────────────────────────────────

const DOC_BUCKET = 'pyra-private';
const SIGNED_URL_TTL = 3600; // 1 hour

export async function GET(
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

    // ── Fetch storage_path by id ──
    const { data: row, error: fetchError } = await supabase
      .from('pyra_employee_documents')
      .select('id, storage_path')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      logError({
        error: fetchError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'hr_document_signed_url', document_id: id, stage: 'fetch' },
      });
      console.error('[hr/documents signed-url GET] fetch error:', fetchError.message);
      return apiServerError();
    }

    if (!row) return apiNotFound('الوثيقة غير موجودة');

    // ── Generate fresh signed URL ──
    const { data: urlData, error: signError } = await supabase.storage
      .from(DOC_BUCKET)
      .createSignedUrl(row.storage_path, SIGNED_URL_TTL);

    if (signError || !urlData?.signedUrl) {
      logError({
        error: signError ?? new Error('createSignedUrl returned no URL'),
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: {
          source: 'hr_document_signed_url',
          document_id: id,
          storage_path: row.storage_path,
          stage: 'create_signed_url',
        },
      });
      console.error('[hr/documents signed-url GET] sign error:', signError?.message);
      return apiServerError('فشل إنشاء رابط التحميل');
    }

    return apiSuccess({ signed_url: urlData.signedUrl });
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { source: 'hr_document_signed_url' },
    });
    console.error('[hr/documents signed-url GET] threw:', err);
    return apiServerError();
  }
}
