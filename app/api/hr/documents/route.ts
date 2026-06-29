import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import {
  apiSuccess,
  apiError,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { uploadLimiter, checkRateLimit } from '@/lib/utils/rate-limit';

// ────────────────────────────────────────────────────────────────────────────
// /api/hr/documents
//
// GET  — list employee documents (optional ?employee_username= & ?type_id= filters)
//         Returns rows + inline signed URLs + joined type_name_ar / employee_display_name
// POST — multipart upload of one document
//
// Both gated: documents.manage (HR admin only, service-role after the gate)
//
// Storage — Gap #3 Phase 3a pattern (private bucket + signed URLs):
//   Bucket:  pyra-private  (private, NOT pyraai-workspace)
//   Path:    employee-documents/{employee_username}/{ts}-{nanoid}.{ext}
//   TTL:     3600 s (1 hour signed URL)
//   Server controls 100% of the path — user-supplied filename NEVER used
//
// Hard caps:
//   20 MB per file
//   MIME allowlist: PDF, JPEG, PNG, WebP  (SVG REJECTED — XSS vector)
//   Extension derived from canonical MIME_TO_EXT (hard-error on miss)
//
// Post-upload invariants:
//   - Orphan cleanup: storage remove on DB-insert failure
//   - Rate-limit: uploadLimiter (20 uploads/min/IP)
// ────────────────────────────────────────────────────────────────────────────

// Hardcoded — NOT env-overridable. Prevents misconfiguration to a public bucket.
const DOC_BUCKET = 'pyra-private';
const SIGNED_URL_TTL = 3600; // 1 hour
const MAX_DOC_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_DOC_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  // SVG is EXPLICITLY rejected — can carry <script> (XSS)
]);

// Map MIME → canonical file extension. Extension is derived server-side from
// this map — NEVER from the user-supplied filename. Hard-error on a miss
// preserves the "storage path 100% server-controlled" invariant against future
// maintenance drift (e.g. adding a MIME to ALLOWED_DOC_MIME without adding a
// MIME_TO_EXT entry).
const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// ──────────────────────────────────────────────────────────────────────────
// GET — list documents (optional filters)
// ──────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  let authForLogging: ApiAuthResult | null = null;
  try {
    const auth = await requireApiPermission('documents.manage');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const supabase = createServiceRoleClient();
    const { searchParams } = new URL(request.url);

    let q = supabase
      .from('pyra_employee_documents')
      .select(
        'id, employee_username, type_id, label, storage_path, mime_type, size_bytes, expiry_date, expiry_alert_30_sent, expiry_alert_7_sent, uploaded_by, uploaded_at, notes, metadata',
      )
      .order('uploaded_at', { ascending: false });

    const emp = searchParams.get('employee_username');
    const type = searchParams.get('type_id');
    if (emp) q = q.eq('employee_username', emp);
    if (type) q = q.eq('type_id', type);

    const { data, error } = await q;
    if (error) {
      logError({
        error,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'hr_documents_list' },
      });
      console.error('[hr/documents GET] list error:', error.message);
      return apiServerError();
    }

    // Parallel fetch for lookup tables — small tables, single-pass join
    const [{ data: types }, { data: users }] = await Promise.all([
      supabase.from('pyra_document_types').select('id, name_ar'),
      supabase.from('pyra_users').select('username, display_name'),
    ]);

    const typeMap = new Map((types ?? []).map((t) => [t.id, t.name_ar]));
    const userMap = new Map((users ?? []).map((u) => [u.username, u.display_name]));

    // Per-row signed URL (private bucket — urls expire after SIGNED_URL_TTL)
    const documents = await Promise.all(
      (data ?? []).map(async (row) => {
        const { data: urlData } = await supabase.storage
          .from(DOC_BUCKET)
          .createSignedUrl(row.storage_path, SIGNED_URL_TTL);
        return {
          ...row,
          type_name_ar: typeMap.get(row.type_id) ?? row.type_id,
          employee_display_name:
            userMap.get(row.employee_username) ?? row.employee_username,
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
      metadata: { source: 'hr_documents_list' },
    });
    console.error('[hr/documents GET] threw:', err);
    return apiServerError();
  }
}

// ──────────────────────────────────────────────────────────────────────────
// POST — upload one document
// ──────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let authForLogging: ApiAuthResult | null = null;
  let storagePathForCleanup: string | null = null;
  try {
    // Layer 1 — rate limit (20 uploads/min/IP — shared uploadLimiter)
    const limited = checkRateLimit(uploadLimiter, request);
    if (limited) return limited;

    // Layer 2 — permission (documents.manage = HR admin only)
    const auth = await requireApiPermission('documents.manage');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    // Layer 3 — service-role client (RLS bypassed — gate already enforced above)
    const supabase = createServiceRoleClient();

    // Layer 4 — parse multipart body
    const form = await request.formData();
    const file = form.get('file');
    const employee_username = form.get('employee_username');
    const type_id = form.get('type_id');
    const label = form.get('label');
    const expiry_date = form.get('expiry_date');
    const notes = form.get('notes');

    // Layer 5 — required-field validation
    if (typeof employee_username !== 'string' || !employee_username.trim()) {
      return apiValidationError('employee_username مطلوب');
    }
    if (typeof type_id !== 'string' || !type_id.trim()) {
      return apiValidationError('type_id مطلوب');
    }
    if (!(file instanceof File)) {
      return apiValidationError('الملف مطلوب');
    }

    // Layer 6 — size checks
    if (file.size <= 0) {
      return apiValidationError('الملف فارغ');
    }
    if (file.size > MAX_DOC_SIZE) {
      return apiError(
        `حجم الملف يتجاوز الحد الأقصى (20 ميجابايت). حجم الملف الحالي: ${(file.size / 1024 / 1024).toFixed(2)} MB`,
        413,
      );
    }

    // Layer 7 — MIME allowlist (SVG explicitly rejected)
    if (!ALLOWED_DOC_MIME.has(file.type)) {
      return apiError(
        `نوع الملف "${file.type}" غير مدعوم. الأنواع المسموح بها: PDF, JPG, PNG, WebP`,
        415,
      );
    }

    // Layer 8 — canonical extension from MIME_TO_EXT (hard-error on miss).
    // NEVER falls back to file.name extension — storage path is 100% server-controlled.
    const canonicalExt = MIME_TO_EXT[file.type];
    if (!canonicalExt) {
      // Should be unreachable (ALLOWED_DOC_MIME and MIME_TO_EXT are co-maintained),
      // but hard-error preserves the invariant against future maintenance drift.
      logError({
        error: new Error(`MIME_TO_EXT missing entry for ${file.type}`),
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: {
          source: 'hr_documents_upload',
          stage: 'canonical_ext_lookup',
          mime: file.type,
          employee_username,
        },
      });
      return apiServerError('خطأ داخلي في تحديد نوع الملف');
    }

    // Layer 9 — server-generated storage path (zero user control)
    // employee_username is validated above; Date.now() + nanoid = unique
    const storagePath = `employee-documents/${employee_username}/${Date.now()}-${generateId('doc').slice(4)}${canonicalExt}`;
    storagePathForCleanup = storagePath;

    // Layer 10 — upload to private Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(DOC_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false, // unique path by construction — defense in depth
      });

    if (uploadError) {
      logError({
        error: uploadError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: {
          source: 'hr_documents_upload',
          stage: 'storage_upload',
          employee_username,
          type_id,
        },
      });
      console.error('[hr/documents POST] storage upload error:', uploadError.message);
      return apiServerError(`فشل رفع الملف: ${uploadError.message}`);
    }

    // Layer 11 — DB insert
    const docId = generateId('doc');
    const { data: inserted, error: insertError } = await supabase
      .from('pyra_employee_documents')
      .insert({
        id: docId,
        employee_username: employee_username.trim(),
        type_id: type_id.trim(),
        label: typeof label === 'string' && label.trim() ? label.trim() : null,
        storage_path: storagePath,
        mime_type: file.type,
        size_bytes: file.size,
        expiry_date:
          typeof expiry_date === 'string' && expiry_date.trim() ? expiry_date.trim() : null,
        uploaded_by: auth.pyraUser.username,
        notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
      })
      .select(
        'id, employee_username, type_id, label, storage_path, mime_type, size_bytes, expiry_date, expiry_alert_30_sent, expiry_alert_7_sent, uploaded_by, uploaded_at, notes, metadata',
      )
      .single();

    if (insertError || !inserted) {
      // Storage upload succeeded but DB insert failed — orphan cleanup
      void supabase.storage.from(DOC_BUCKET).remove([storagePath]);
      logError({
        error: insertError ?? new Error('document insert returned no row'),
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: {
          source: 'hr_documents_upload',
          stage: 'db_insert',
          employee_username,
          type_id,
        },
      });
      console.error('[hr/documents POST] insert error:', insertError?.message);
      return apiServerError('فشل تسجيل الوثيقة');
    }

    // Layer 12 — signed URL for immediate use in response
    const { data: urlData } = await supabase.storage
      .from(DOC_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL);
    const signed_url = urlData?.signedUrl ?? '';

    // Layer 13 — audit log (Phase 11.5 locked pattern: action_type from
    // constants + specificity in metadata.source)
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.DOCUMENT}_${ACTIVITY_ACTIONS.CREATE}`,
      '/dashboard/hr/documents',
      {
        source: 'document_uploaded',
        employee_username: employee_username.trim(),
        type_id: type_id.trim(),
        document_id: docId,
        size_bytes: file.size,
        mime_type: file.type,
      },
      request.headers.get('x-forwarded-for') ?? undefined,
    );

    return apiSuccess({ document: { ...inserted, signed_url } }, undefined, 201);
  } catch (err) {
    // Outer catch — if storage succeeded but something threw afterwards,
    // best-effort orphan cleanup via the path captured before upload.
    if (storagePathForCleanup) {
      try {
        const supabase = createServiceRoleClient();
        void supabase.storage.from(DOC_BUCKET).remove([storagePathForCleanup]);
      } catch {
        // ignore cleanup errors — primary error takes precedence
      }
    }
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { source: 'hr_documents_upload' },
    });
    console.error('[hr/documents POST] threw:', err);
    return apiServerError();
  }
}
