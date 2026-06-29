import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/log-error';

// ────────────────────────────────────────────────────────────────────────────
// /api/my-documents/[id]/signed-url
//
// GET — return a fresh 1-hour signed URL for ONE of the current user's own docs.
//       Gated:  documents.view
//       Guard:  ownership check — row.employee_username === auth.pyraUser.username
//               (403 if mismatch, 404 if row doesn't exist)
//
// Read-only. The employee gets a fresh URL without exposing the raw storage path.
//
// Storage — Gap #3 Phase 3a pattern (private bucket + signed URLs):
//   Bucket:  pyra-private
//   TTL:     3600 s (1 hour)
// ────────────────────────────────────────────────────────────────────────────

const DOC_BUCKET = 'pyra-private';
const SIGNED_URL_TTL = 3600; // 1 hour

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let authForLogging: ApiAuthResult | null = null;
  try {
    // Gate: documents.view
    const auth = await requireApiPermission('documents.view');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const { id } = await params;
    if (!id) return apiNotFound('معرّف الوثيقة مفقود');

    // Service-role client after the gate (RLS bypass — ownership enforced below)
    const supabase = createServiceRoleClient();

    // Fetch the document row
    const { data: row, error } = await supabase
      .from('pyra_employee_documents')
      .select('id, employee_username, storage_path')
      .eq('id', id)
      .single();

    if (error || !row) {
      // .single() returns error when 0 rows — treat as 404
      return apiNotFound('الوثيقة غير موجودة');
    }

    // Ownership check — 403 if the doc belongs to a different employee.
    // This is the critical own-scope guard: even with documents.view permission,
    // an employee can ONLY get signed URLs for their OWN documents.
    if (row.employee_username !== auth.pyraUser.username) {
      return apiForbidden('لا يمكنك الوصول إلى وثائق موظف آخر');
    }

    // Generate a fresh signed URL
    const { data: urlData, error: signError } = await supabase.storage
      .from(DOC_BUCKET)
      .createSignedUrl(row.storage_path, SIGNED_URL_TTL);

    if (signError || !urlData?.signedUrl) {
      logError({
        error: signError ?? new Error('createSignedUrl returned no URL'),
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'my_documents_signed_url', document_id: id },
      });
      console.error('[my-documents/[id]/signed-url GET] sign error:', signError?.message);
      return apiServerError('فشل إنشاء رابط الوصول');
    }

    return apiSuccess({ signed_url: urlData.signedUrl });
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { source: 'my_documents_signed_url' },
    });
    console.error('[my-documents/[id]/signed-url GET] threw:', err);
    return apiServerError();
  }
}
