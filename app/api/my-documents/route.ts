import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/log-error';

// ────────────────────────────────────────────────────────────────────────────
// /api/my-documents
//
// GET — list the current employee's OWN documents.
//       Returns rows + inline signed URLs + joined type_name_ar.
//       Gated: documents.view
//       Scope:  WHERE employee_username = auth.pyraUser.username
//               (server-enforced — client-supplied username is NEVER trusted)
//
// Read-only. Upload / edit / delete live in /api/hr/documents (HR admin only).
//
// Storage — Gap #3 Phase 3a pattern (private bucket + signed URLs):
//   Bucket:  pyra-private
//   TTL:     3600 s (1 hour signed URL)
// ────────────────────────────────────────────────────────────────────────────

const DOC_BUCKET = 'pyra-private';
const SIGNED_URL_TTL = 3600; // 1 hour

export async function GET(request: NextRequest) {
  let authForLogging: ApiAuthResult | null = null;
  try {
    // Gate: documents.view (all internal roles that have this permission)
    const auth = await requireApiPermission('documents.view');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    // Service-role client after the gate (RLS bypass — query is own-scoped below)
    const supabase = createServiceRoleClient();

    // Own-scope enforced server-side — NEVER read username from client input
    const ownerUsername = auth.pyraUser.username;

    const { data, error } = await supabase
      .from('pyra_employee_documents')
      .select(
        'id, employee_username, type_id, label, storage_path, mime_type, size_bytes, expiry_date, expiry_alert_30_sent, expiry_alert_7_sent, uploaded_by, uploaded_at, notes, metadata',
      )
      .eq('employee_username', ownerUsername)
      .order('uploaded_at', { ascending: false });

    if (error) {
      logError({
        error,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'my_documents_list', owner: ownerUsername },
      });
      console.error('[my-documents GET] list error:', error.message);
      return apiServerError();
    }

    // Parallel fetch for document types lookup (small table, single-pass join)
    const { data: types } = await supabase
      .from('pyra_document_types')
      .select('id, name, name_ar');

    // type_name (English) added alongside type_name_ar (additive — i18n Phase 5.7)
    // so bilingual UI can render the locale-appropriate document-type name.
    const typeMap = new Map((types ?? []).map((t) => [t.id, t]));

    // Per-row signed URL (private bucket — urls expire after SIGNED_URL_TTL)
    // Gap #3 Phase 3a: storage_path is stripped from the response (signed_url only)
    const documents = await Promise.all(
      (data ?? []).map(async (row) => {
        const { storage_path, ...rest } = row;
        const { data: urlData } = await supabase.storage
          .from(DOC_BUCKET)
          .createSignedUrl(storage_path, SIGNED_URL_TTL);
        const type = typeMap.get(row.type_id);
        return {
          ...rest,
          type_name_ar: type?.name_ar ?? row.type_id,
          type_name: type?.name ?? row.type_id,
          signed_url: urlData?.signedUrl ?? '',
        };
      }),
    );

    return apiSuccess({ documents });
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { source: 'my_documents_list' },
    });
    console.error('[my-documents GET] threw:', err);
    return apiServerError();
  }
}
